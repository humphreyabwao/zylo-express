"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { z } from "zod";

import {
  AdminAuthorizationError,
  createOperatorClient,
  requireAdminAction,
} from "@/lib/admin/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { GRANTABLE_MODULES, isUnrestricted } from "@/lib/admin/permissions";
import type { UserRoleDb } from "@/lib/supabase/types";

/**
 * Staff mutations.
 *
 * Server Actions rather than route handlers: there is no admin REST surface to
 * find, no API key in the browser, and the framework's own origin check applies
 * to every call. See `src/lib/admin/guard.ts` for the three layers behind this.
 *
 * Every action here authorises *first*, before the payload is even parsed. An
 * unauthorised caller should never get as far as having their input validated —
 * validation errors are themselves information.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
}

const roleSchema = z.object({
  userId: z.string().uuid("That is not a valid account id."),
  role: z.enum(["customer", "staff", "admin"]),
});

/**
 * Changes an account's role.
 *
 * Two invariants worth naming:
 *
 *   1. Only an administrator may do this. Staff can run the shop; staff cannot
 *      grant themselves the ability to remove other staff.
 *   2. An administrator cannot demote themselves. It reads as a safety rail and
 *      it is, but the real reason is recoverability: the last administrator
 *      demoting themselves leaves an organisation with no way back into its own
 *      portal short of a SQL console.
 */
export async function setUserRole(
  userId: string,
  role: UserRoleDb
): Promise<ActionResult> {
  let identity;
  try {
    identity = await requireAdminAction({ elevated: true, module: "staff" });
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  const parsed = roleSchema.safeParse({ userId, role });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  if (parsed.data.userId === identity.profile.id && parsed.data.role !== "admin") {
    return {
      ok: false,
      message:
        "You cannot remove your own administrator access. Ask another administrator.",
    };
  }

  const supabase = await createOperatorClient();

  // RLS is what actually authorises this write — `is_admin()` backs the update
  // policy on profiles. The check above is for a good error message, not for
  // security.
  const { error } = await supabase
    .from("profiles")
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.userId);

  if (error) {
    console.error("[admin] role change failed:", error);
    return {
      ok: false,
      message:
        "The database refused that change. You may not have permission to set this role.",
    };
  }

  revalidatePath("/admin/staff");
  revalidatePath("/admin/customers");

  return { ok: true, message: `Role updated to ${parsed.data.role}.` };
}

/**
 * Revokes portal access by returning an account to `customer`.
 *
 * Deliberately not a delete. The account owns orders, addresses and a wishlist;
 * deleting the profile would either orphan or cascade them. Removing the role
 * removes the access, which is the thing actually being asked for.
 */
export async function revokePortalAccess(userId: string): Promise<ActionResult> {
  const result = await setUserRole(userId, "customer");
  return result.ok
    ? { ok: true, message: "Portal access revoked. The account remains a customer." }
    : result;
}

/* ------------------------------------------------------- create an account */

export interface CreateStaffResult extends ActionResult {
  /**
   * Shown once, then gone.
   *
   * Not stored anywhere and not recoverable — the only copy is the one the
   * administrator reads off the screen and passes on. If it is lost, the fix
   * is a password reset, not a lookup.
   */
  temporaryPassword?: string;
  email?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Only segments this application actually has.
 *
 * An unknown string in `permissions` matches no module and is therefore
 * harmless, but it is also a typo nobody would ever notice — so it is refused
 * at the door rather than stored and silently ignored.
 */
const permissionsSchema = z
  .array(z.string().trim())
  .max(64)
  .optional()
  .default([])
  .transform((values) => [...new Set(values)])
  .refine(
    (values) =>
      values.every((value) =>
        GRANTABLE_MODULES.some((module) => module.segment === value)
      ),
    "That list contains a module this portal does not have."
  );

const createStaffSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "An email address is required.")
    .max(200, "That address is too long.")
    .email("That does not look like an email address.")
    .transform((value) => value.toLowerCase()),
  firstName: z
    .string()
    .trim()
    .min(1, "A first name is required.")
    .max(60, "That name is too long."),
  lastName: z
    .string()
    .trim()
    .min(1, "A last name is required.")
    .max(60, "That name is too long."),
  // Only portal roles. This form exists to grant access; creating a customer
  // through it would be a signup form wearing a staff form's clothes.
  role: z.enum(["staff", "admin"], {
    errorMap: () => ({ message: "Choose staff or administrator." }),
  }),
  /**
   * Which modules the account may reach.
   *
   * Deliberately not defaulted to everything. An account created without a
   * thought should be able to do the least, not the most — the form offers a
   * sensible starting set and the person creating it decides.
   */
  permissions: permissionsSchema,
  /**
   * Optional. Blank means "generate one", which is the better default — a
   * person inventing passwords for colleagues invents one pattern and reuses
   * it. Offered anyway because handing over a password already agreed on the
   * telephone is a real workflow.
   */
  password: z
    .string()
    .max(72, "Supabase caps passwords at 72 characters.")
    .optional()
    .default("")
    .refine(
      (value) => value === "" || value.length >= 10,
      "Use at least 10 characters, or leave it blank to generate one."
    ),
});

/**
 * A temporary password the administrator reads out.
 *
 * 18 bytes of `randomBytes` in base64url — about 144 bits, which is far past
 * anything guessable, and short enough to retype without a mistake. Excludes
 * the characters base64url already omits, so there is no `l`/`1` ambiguity to
 * resolve over the telephone.
 *
 * Deliberately random rather than administrator-chosen: a person inventing
 * passwords for colleagues invents one pattern and uses it for everybody.
 */
function generateTemporaryPassword(): string {
  return randomBytes(18).toString("base64url");
}

/**
 * Create a portal account outright.
 *
 * ## Why this uses the service-role client
 *
 * Everything else in this directory writes through the RLS-bound operator
 * client, so the database is the thing that authorises. Creating an auth user
 * has no user-context equivalent — `auth.admin.createUser` is a service-role
 * operation by definition. The gate is therefore this function's own
 * `elevated` check rather than a policy, which is why that check comes first
 * and why the role is constrained to two values a line above.
 *
 * ## Why the account is created confirmed
 *
 * There is no SMTP configured, so Supabase cannot send a confirmation email —
 * an unconfirmed account would simply never be able to sign in. The
 * administrator creating it has already decided this person is staff; the
 * confirmation step would be verifying an address they typed themselves.
 *
 * The `profiles` row is written by the `on_auth_user_created` trigger with the
 * default `customer` role, so the role is set immediately afterwards. If that
 * second write fails the auth user is deleted rather than left behind as an
 * account that can sign in and reach nothing.
 */
export async function createStaffAccount(
  input: unknown
): Promise<CreateStaffResult> {
  let identity;
  try {
    identity = await requireAdminAction({ elevated: true, module: "staff" });
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  const parsed = createStaffSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }

  const admin = createAdminClient();
  const temporaryPassword =
    parsed.data.password || generateTemporaryPassword();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
    },
  });

  if (createError || !created?.user) {
    // Supabase reports an existing address as a 422. Worth naming, because the
    // fix is to promote the account rather than create a second one.
    const alreadyExists = /already|exists|registered/i.test(
      createError?.message ?? ""
    );

    console.error("[admin] staff create failed:", createError);
    return {
      ok: false,
      message: alreadyExists
        ? "That address already has an account. Find it under Customers and change its role instead."
        : "Could not create that account.",
      ...(alreadyExists ? { fieldErrors: { email: "Already registered." } } : {}),
    };
  }

  const { error: roleError } = await admin
    .from("profiles")
    .update({ role: parsed.data.role, permissions: parsed.data.permissions })
    .eq("id", created.user.id);

  if (roleError) {
    console.error("[admin] staff role assignment failed:", roleError);

    // Roll back rather than leave an account that can sign in and see nothing.
    const { error: cleanupError } = await admin.auth.admin.deleteUser(
      created.user.id
    );
    if (cleanupError) {
      console.error("[admin] staff rollback failed:", cleanupError);
      return {
        ok: false,
        message:
          "The account was created but its role could not be set, and it could not be removed. Find it under Customers and set the role by hand.",
      };
    }

    return { ok: false, message: "Could not grant portal access." };
  }

  console.info(
    `[admin] ${identity.profile.email} created ${parsed.data.role} account ${parsed.data.email}`
  );

  revalidatePath("/admin/staff");

  return {
    ok: true,
    message: `${parsed.data.firstName} ${parsed.data.lastName} can now sign in.`,
    temporaryPassword,
    email: parsed.data.email,
  };
}

/* -------------------------------------------------------- account lifecycle */

/** Refuses when `userId` is the caller. */
function selfCheck(
  identity: { profile: { id: string } },
  userId: string,
  verb: string
): ActionResult | null {
  if (identity.profile.id !== userId) return null;
  return { ok: false, message: `You cannot ${verb} your own account.` };
}

/**
 * Refuses when this would remove the last administrator.
 *
 * The same recoverability argument as self-demotion: an organisation with no
 * administrator cannot restore one from inside the portal, and the fix is a
 * SQL console.
 */
async function lastAdminCheck(userId: string): Promise<ActionResult | null> {
  const admin = createAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (target?.role !== "admin") return null;

  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");

  if ((count ?? 0) > 1) return null;
  return {
    ok: false,
    message: "This is the only administrator. Promote someone else first.",
  };
}

/* ------------------------------------------------------------------- edit */

const editSchema = z.object({
  userId: z.string().uuid("That is not a valid account id."),
  firstName: z.string().trim().min(1, "A first name is required.").max(60),
  lastName: z.string().trim().min(1, "A last name is required.").max(60),
  permissions: permissionsSchema,
});

/**
 * Rename an account.
 *
 * Email is deliberately not editable. Changing it in `auth.users` without a
 * confirmation round trip leaves an account whose sign-in address nobody has
 * verified, and there is no SMTP to send that confirmation with — so the
 * honest operation is to create the new account and delete the old one.
 */
export async function updateStaffAccount(input: unknown): Promise<ActionResult> {
  try {
    await requireAdminAction({ elevated: true, module: "staff" });
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  const parsed = editSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]!.message };
  }

  const supabase = await createOperatorClient();

  // A superadmin's permission list is ignored at read time, so writing one is
  // misleading rather than dangerous — but leaving it untouched keeps the row
  // honest about which accounts are actually restricted.
  const { data: target } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", parsed.data.userId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("profiles")
    .update({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      ...(target && isUnrestricted(target.role)
        ? {}
        : { permissions: parsed.data.permissions }),
    })
    .eq("id", parsed.data.userId)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error("[admin] staff edit failed:", error);
    return { ok: false, message: "Could not save those changes." };
  }

  revalidatePath("/admin/staff");
  return { ok: true, message: "Account updated." };
}

/* --------------------------------------------------------- reset password */

const resetSchema = z.object({
  userId: z.string().uuid("That is not a valid account id."),
  /** Empty means "generate one". */
  password: z
    .string()
    .max(72, "Supabase caps passwords at 72 characters.")
    .refine(
      (value) => value === "" || value.length >= 10,
      "Use at least 10 characters, or leave it blank to generate one."
    ),
});

export async function resetStaffPassword(
  input: unknown
): Promise<CreateStaffResult> {
  let identity;
  try {
    identity = await requireAdminAction({ elevated: true, module: "staff" });
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  const parsed = resetSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: { password: parsed.error.issues[0]!.message },
    };
  }

  const password = parsed.data.password || generateTemporaryPassword();
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.updateUserById(
    parsed.data.userId,
    { password }
  );

  if (error || !data?.user) {
    console.error("[admin] password reset failed:", error);
    return { ok: false, message: "Could not reset that password." };
  }

  console.info(
    `[admin] ${identity.profile.email} reset the password for ${data.user.email}`
  );

  revalidatePath("/admin/staff");
  return {
    ok: true,
    message: "Password reset.",
    temporaryPassword: password,
    email: data.user.email ?? "",
  };
}

/* ---------------------------------------------------------------- suspend */

const suspendSchema = z.object({
  userId: z.string().uuid("That is not a valid account id."),
  suspended: z.boolean(),
});

/**
 * Block sign-in without touching anything else.
 *
 * Distinct from `revokePortalAccess`, which returns the account to `customer`
 * — that removes portal access and leaves them able to shop. A suspension
 * stops the account being used at all, which is what you want for a departure
 * you have not finished unwinding, or a credential you think is compromised.
 *
 * Implemented as an auth ban rather than a column, so Supabase enforces it at
 * token issue. A flag in `profiles` would only be as good as the code that
 * remembered to check it.
 */
export async function setStaffSuspended(input: unknown): Promise<ActionResult> {
  let identity;
  try {
    identity = await requireAdminAction({ elevated: true, module: "staff" });
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  const parsed = suspendSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]!.message };
  }

  const self = selfCheck(identity, parsed.data.userId, "suspend");
  if (self) return self;

  if (parsed.data.suspended) {
    const last = await lastAdminCheck(parsed.data.userId);
    if (last) return last;
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.updateUserById(
    parsed.data.userId,
    // Supabase takes a duration string. "none" lifts it; a long finite ban is
    // the documented way to express an indefinite one — a century here.
    { ban_duration: parsed.data.suspended ? "876000h" : "none" }
  );

  if (error || !data?.user) {
    console.error("[admin] suspend failed:", error);
    return { ok: false, message: "Could not change that account." };
  }

  console.info(
    `[admin] ${identity.profile.email} ${
      parsed.data.suspended ? "suspended" : "reinstated"
    } ${data.user.email}`
  );

  revalidatePath("/admin/staff");
  return {
    ok: true,
    message: parsed.data.suspended ? "Account suspended." : "Account reinstated.",
  };
}

/* ----------------------------------------------------------------- delete */

/**
 * Delete an account outright.
 *
 * What goes with it, from the foreign keys in migration 2: `profiles`,
 * `addresses` and `wishlist_items` cascade and are destroyed. `orders` and
 * `reviews` are `on delete set null`, so they survive, detached from the person
 * who placed or wrote them.
 *
 * That asymmetry is why the confirmation states it rather than asking "are you
 * sure". Suspending keeps everything and is reversible; this is not.
 */
export async function deleteStaffAccount(userId: string): Promise<ActionResult> {
  let identity;
  try {
    identity = await requireAdminAction({ elevated: true, module: "staff" });
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  const parsed = z
    .string()
    .uuid("That is not a valid account id.")
    .safeParse(userId);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };

  const self = selfCheck(identity, parsed.data, "delete");
  if (self) return self;

  const last = await lastAdminCheck(parsed.data);
  if (last) return last;

  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("email")
    .eq("id", parsed.data)
    .maybeSingle();

  const { error } = await admin.auth.admin.deleteUser(parsed.data);
  if (error) {
    console.error("[admin] staff delete failed:", error);
    return { ok: false, message: "Could not delete that account." };
  }

  console.info(
    `[admin] ${identity.profile.email} deleted account ${profile?.email ?? parsed.data}`
  );

  revalidatePath("/admin/staff");
  return { ok: true, message: `${profile?.email ?? "Account"} deleted.` };
}
