import "server-only";

/**
 * Postgres error codes worth translating.
 *
 * A `PostgrestError` reaching an operator as-is is a support ticket: "duplicate
 * key value violates unique constraint \"categories_slug_key\"" is accurate,
 * mentions a constraint name nobody has seen, and does not say what to do. The
 * codes below are the ones this portal actually provokes.
 */

interface MaybePostgrestError {
  code?: string;
  message?: string;
}

/** 23505 — unique_violation. A slug or SKU that is already taken. */
export function isUniqueViolation(error: MaybePostgrestError | null): boolean {
  return error?.code === "23505";
}

/** 23503 — foreign_key_violation. Pointing at a row that is not there. */
export function isForeignKeyViolation(error: MaybePostgrestError | null): boolean {
  return error?.code === "23503";
}

/**
 * 42501 — insufficient_privilege: the row-level security policy refused it.
 *
 * Admin writes run through `createOperatorClient()` — the publishable key plus
 * the session cookie — and the `is_admin()` policy is what authorises them. A
 * refusal here means the signed-in account is not staff, or its session has
 * lapsed mid-edit.
 *
 * PostgREST reports a policy refusal as a bare 401/403 with no code on some
 * paths, so the message is sniffed as well as the code.
 */
export function isPolicyRefusal(error: MaybePostgrestError | null): boolean {
  if (!error) return false;
  if (error.code === "42501") return true;
  return /row-level security|violates row-level security policy/i.test(
    error.message ?? ""
  );
}

/** Shown when a policy refuses a write. */
export const POLICY_REFUSAL_MESSAGE =
  "Your session is not authorised for that. Sign in again with a staff account.";

/**
 * The message to show for a failed write.
 *
 * Wrapping the choice keeps the call sites to one line each. A policy refusal
 * always wins over the caller's fallback, because "Could not save those
 * changes" is actively misleading when the real answer is that this session was
 * never allowed to save anything.
 */
export function refusalMessage(
  error: MaybePostgrestError | null,
  fallback: string
): string {
  return isPolicyRefusal(error) ? POLICY_REFUSAL_MESSAGE : fallback;
}
