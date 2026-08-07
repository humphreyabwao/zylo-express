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

/* ---------------------------------------------------------------- logging */

/**
 * A `PostgrestError` logged directly prints `{}`.
 *
 * Its fields are non-enumerable, so `console.error("...", error)` renders an
 * empty object and the operator learns nothing — which is exactly what the
 * sales list produced when its table did not exist yet. This pulls the four
 * fields that matter into a plain object.
 */
export function describeError(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== "object") return { error: String(error) };

  const e = error as MaybePostgrestError & {
    details?: string;
    hint?: string;
  };

  return {
    message: e.message ?? String(error),
    ...(e.code ? { code: e.code } : {}),
    ...(e.details ? { details: e.details } : {}),
    ...(e.hint ? { hint: e.hint } : {}),
  };
}

/**
 * 42P01 — undefined_table. The migration has not been run.
 *
 * Worth its own branch because it is not a fault in the code and it is not
 * transient: it will repeat on every render until somebody applies the SQL.
 * Logging it as an error, at that volume, buries the ones that matter.
 */
export function isMissingRelation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as MaybePostgrestError;
  if (e.code === "42P01") return true;
  return /does not exist|schema cache|could not find the (table|function)/i.test(
    e.message ?? ""
  );
}

/**
 * Log a failed read once per key, at a level that matches what it is.
 *
 * A missing table is a `warn` with a sentence saying which migration is
 * outstanding, emitted once per process rather than per request — otherwise a
 * single un-run migration fills the console and hides real errors behind it.
 */
const warnedOnce = new Set<string>();

export function logQueryFailure(scope: string, error: unknown): void {
  if (isMissingRelation(error)) {
    if (warnedOnce.has(scope)) return;
    warnedOnce.add(scope);
    console.warn(
      `[admin] ${scope}: a table or function this reads does not exist yet. ` +
        `Apply the pending migrations in supabase/schema-pending.sql. ` +
        `Showing empty results until then.`
    );
    return;
  }

  console.error(`[admin] ${scope} failed:`, describeError(error));
}
