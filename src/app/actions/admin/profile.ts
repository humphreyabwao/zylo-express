"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  AdminAuthorizationError,
  createOperatorClient,
  requireAdminAction,
} from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";

/**
 * The operator's own account.
 *
 * Separate from `staff.ts` because the authorisation is different in kind:
 * those actions need `elevated` and act on somebody else, these act only on the
 * caller and therefore need nothing beyond a portal session. A member of staff
 * who cannot change anyone's role can still change their own name.
 *
 * Both write through the session-bound client, so the row being changed is the
 * caller's by construction rather than by a check — there is no `userId` in
 * either payload to get wrong.
 */

export interface ProfileResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
}

async function authorise(): Promise<ProfileResult | null> {
  try {
    await requireAdminAction();
    return null;
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}

/* ------------------------------------------------------------------ details */

const detailsSchema = z.object({
  firstName: z.string().trim().min(1, "A first name is required.").max(60),
  lastName: z.string().trim().min(1, "A last name is required.").max(60),
  phone: z.string().trim().max(40, "That number is too long.").optional().default(""),
});

export async function updateOwnProfile(input: unknown): Promise<ProfileResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = detailsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const supabase = await createOperatorClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, message: "Your session has expired." };

  // Scoped to the caller's own id. RLS would refuse anything else, but saying
  // so here means the intent is legible without reading the policies.
  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      phone: parsed.data.phone || null,
    })
    .eq("id", user.id);

  if (error) {
    console.error("[admin] profile update failed:", error);
    return { ok: false, message: "Could not save those changes." };
  }

  revalidatePath("/admin/profile");
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Profile saved." };
}

/* ----------------------------------------------------------------- password */

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    password: z
      .string()
      .min(10, "Use at least 10 characters.")
      .max(72, "Supabase caps passwords at 72 characters."),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    path: ["confirm"],
    message: "Those do not match.",
  });

/**
 * Change your own password.
 *
 * The current password is verified first, by signing in with it. Supabase's
 * `updateUser` does not require it — a live session is enough — which means an
 * unattended desk is a password change. Re-authenticating turns that into
 * something that needs the password itself.
 *
 * `signInWithPassword` on the session-bound client refreshes the very session
 * making the request, so a correct answer leaves the operator signed in and a
 * wrong one changes nothing.
 */
export async function changeOwnPassword(input: unknown): Promise<ProfileResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return { ok: false, message: "Your session has expired." };

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });

  if (reauthError) {
    return {
      ok: false,
      message: "That is not your current password.",
      fieldErrors: { currentPassword: "Incorrect." },
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    console.error("[admin] password change failed:", error);
    return { ok: false, message: error.message || "Could not change your password." };
  }

  return { ok: true, message: "Password changed." };
}
