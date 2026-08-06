"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  AdminAuthorizationError,
  createOperatorClient,
  requireAdminAction,
} from "@/lib/admin/guard";
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
    identity = await requireAdminAction({ elevated: true });
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
