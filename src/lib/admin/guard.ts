import "server-only";

import { redirect } from "next/navigation";

import { createClient, getCurrentProfile } from "@/lib/supabase/server";
import type { ProfileRow, UserRoleDb } from "@/lib/supabase/types";

/**
 * Authorisation for the admin portal.
 *
 * Three independent layers, in order of what an attacker meets first:
 *
 *   1. `proxy.ts` keeps the session cookie fresh and rejects unauthenticated
 *      requests to /admin before a page renders.
 *   2. `requireAdmin()` here, called by every admin page and every admin Server
 *      Action. It re-reads the role from the database on each call rather than
 *      trusting anything in the request.
 *   3. Row Level Security. `public.is_admin()` backs every catalogue write
 *      policy, so even a forged session that somehow reached a mutation would
 *      be refused by Postgres.
 *
 * Layer 3 is the one that actually protects the data. The first two exist so
 * that failures are clean redirects rather than opaque database errors.
 *
 * There is deliberately no admin REST surface: the browser holds no Supabase
 * key, and every mutation goes through a Server Action on our own origin. See
 * `src/lib/supabase/server.ts`.
 */

/** Roles permitted into the portal at all. */
const PORTAL_ROLES: UserRoleDb[] = ["staff", "admin"];

/** Roles permitted to perform destructive or privilege-changing operations. */
const ELEVATED_ROLES: UserRoleDb[] = ["admin"];

export class AdminAuthorizationError extends Error {
  constructor(message = "Not authorised") {
    super(message);
    this.name = "AdminAuthorizationError";
  }
}

export interface AdminIdentity {
  profile: ProfileRow;
  /** Whether this identity may perform destructive operations. */
  canElevate: boolean;
}

/**
 * Resolves the current operator without redirecting.
 *
 * Returns null when nobody is signed in or the account is a customer. Use this
 * where a missing identity is an expected branch; use `requireAdmin()` where it
 * is not.
 */
export async function getAdminIdentity(): Promise<AdminIdentity | null> {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  if (!PORTAL_ROLES.includes(profile.role)) return null;

  return { profile, canElevate: ELEVATED_ROLES.includes(profile.role) };
}

/**
 * Page-level guard. Redirects rather than throwing, so an operator whose
 * session lapsed lands on the sign-in form instead of an error boundary.
 */
export async function requireAdmin(): Promise<AdminIdentity> {
  const identity = await getAdminIdentity();
  if (!identity) redirect("/admin/login");
  return identity;
}

/**
 * Server Action guard. Throws, because an action has no sensible redirect and
 * a silent no-op would be worse than a visible failure.
 *
 * Call this first in every admin action — before reading the payload, so a
 * malformed body from an unauthorised caller is never even parsed.
 */
export async function requireAdminAction(options: {
  elevated?: boolean;
} = {}): Promise<AdminIdentity> {
  const identity = await getAdminIdentity();

  if (!identity) {
    throw new AdminAuthorizationError(
      "You are not signed in as a member of staff."
    );
  }

  if (options.elevated && !identity.canElevate) {
    throw new AdminAuthorizationError(
      "This action requires an administrator account."
    );
  }

  return identity;
}

/**
 * An RLS-bound client for admin work.
 *
 * Deliberately *not* the service-role client. Writes here run as the signed-in
 * operator so the policies in `20260806000004_rls.sql` still apply — that is
 * what makes layer 3 above real rather than decorative. Reach for
 * `createAdminClient()` only where a genuinely trusted operation needs it, and
 * justify it at the call site.
 */
export async function createOperatorClient() {
  return createClient();
}
