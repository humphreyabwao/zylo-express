"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AdminAuthorizationError, requireAdminAction } from "@/lib/admin/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { describeError } from "@/lib/admin/errors";
import { forgetCredentials } from "@/lib/payments/credentials";
import type { PaymentProvider } from "@/lib/payments/credentials";
import type { PaymentCredentialRow } from "@/lib/supabase/types";
import { PaystackError, checkAccount } from "@/lib/payments/paystack";

/**
 * Payment provider keys.
 *
 * ## Why the service-role client
 *
 * `payment_credentials` has RLS enabled and no policies, so the operator
 * client cannot see it — that is the point of the table, not an oversight.
 * Every other admin action in this codebase deliberately writes as the
 * signed-in operator so the policies in migration 4 still apply; this one
 * cannot, because the row is invisible to every role except the service one.
 *
 * The authorisation that RLS would have provided is done here instead, before
 * the client is ever constructed. There is no path to `createAdminClient()`
 * from a browser, so the check below is the gate rather than a convenience.
 *
 * ## Why superadmin
 *
 * An administrator with Settings can already change prices. Changing which
 * Paystack account the shop's takings land in is a different order of
 * authority — it is the one setting where a mistake or a bad actor redirects
 * money rather than mispricing it. A shop with several administrators should
 * not hand that out with the Settings module.
 *
 * ## What comes back
 *
 * Never a key. `getMaskedCredentials()` returns hints; these actions return
 * a result and nothing else. A secret goes in and does not come out.
 */

export interface PaymentActionResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
}

/* --------------------------------------------------------------- schema */

/**
 * A blank field means "leave this alone".
 *
 * The form only ever shows a hint like `sk_test_••••a91f`, so it has nothing
 * real to submit back. Treating blank as a deletion would wipe the live key
 * every time somebody edited the settlement currency. Clearing a slot is an
 * explicit action instead — see `clearPaymentKey`.
 */
const optionalKey = z
  .string()
  .trim()
  .max(200, "That does not look like an API key.")
  .optional()
  .transform((value) => (value ? value : undefined));

const credentialsSchema = z.object({
  provider: z.enum(["paystack", "paypal"]),
  mode: z.enum(["test", "live"]),
  enabled: z.boolean(),
  settlementCurrency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, "Use a three-letter code, e.g. KES."),
  testSecretKey: optionalKey,
  testPublicKey: optionalKey,
  liveSecretKey: optionalKey,
  livePublicKey: optionalKey,
});

/* ------------------------------------------------------------ validation */

/**
 * Catch the mistake that costs real money: a live key saved under test, or a
 * test key promoted to live. Paystack names the mode in the key itself, so
 * this is checkable rather than a matter of trust.
 */
function keyModeError(
  value: string | undefined,
  expected: "test" | "live",
  kind: "secret" | "public"
): string | null {
  if (!value) return null;

  const prefix = kind === "secret" ? "sk_" : "pk_";
  if (!value.startsWith(prefix)) {
    return `A ${kind} key starts with ${prefix}. Check you have not swapped the two.`;
  }

  const other = expected === "test" ? "live" : "test";
  if (value.startsWith(`${prefix}${other}_`)) {
    return `That is a ${other} key in the ${expected} field.`;
  }

  return null;
}

async function authorise(): Promise<PaymentActionResult | null> {
  try {
    await requireAdminAction({ module: "settings", superadmin: true });
    return null;
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

function done(provider: PaymentProvider): void {
  // The memo in credentials.ts is process-local and 30s; a save should be
  // visible on the next request, not half a minute later.
  forgetCredentials(provider);
  revalidatePath("/admin/settings");
  // Checkout decides which methods to offer from this.
  revalidatePath("/checkout");
}

/* ----------------------------------------------------------------- save */

export async function updatePaymentCredentials(
  input: unknown
): Promise<PaymentActionResult> {
  const refusal = await authorise();
  if (refusal) return refusal;

  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message: "Please check the fields and try again.",
      fieldErrors: Object.fromEntries(
        Object.entries(flat)
          .filter(([, messages]) => messages?.length)
          .map(([field, messages]) => [field, messages![0]])
      ),
    };
  }

  const values = parsed.data;

  if (values.provider === "paystack") {
    const fieldErrors: Record<string, string> = {};

    const checks = [
      ["testSecretKey", values.testSecretKey, "test", "secret"],
      ["testPublicKey", values.testPublicKey, "test", "public"],
      ["liveSecretKey", values.liveSecretKey, "live", "secret"],
      ["livePublicKey", values.livePublicKey, "live", "public"],
    ] as const;

    for (const [field, value, expected, kind] of checks) {
      const error = keyModeError(value, expected, kind);
      if (error) fieldErrors[field] = error;
    }

    if (Object.keys(fieldErrors).length > 0) {
      return { ok: false, message: "Those keys do not look right.", fieldErrors };
    }
  }

  // Only the fields that were actually filled in are written, so saving the
  // form does not blank the keys it never displayed.
  const patch: Partial<PaymentCredentialRow> = {
    mode: values.mode,
    enabled: values.enabled,
    settlement_currency: values.settlementCurrency,
  };

  if (values.testSecretKey) patch.test_secret_key = values.testSecretKey;
  if (values.testPublicKey) patch.test_public_key = values.testPublicKey;
  if (values.liveSecretKey) patch.live_secret_key = values.liveSecretKey;
  if (values.livePublicKey) patch.live_public_key = values.livePublicKey;

  const supabase = createAdminClient();

  const { error } = await supabase
    .from("payment_credentials")
    .update(patch)
    .eq("provider", values.provider);

  if (error) {
    console.error(
      `[admin] payment credentials save failed: ${describeError(error)}`
    );
    return {
      ok: false,
      message:
        error.code === "42P01"
          ? "The payment credentials table is missing. Run the database migrations first."
          : "Could not save those settings.",
    };
  }

  done(values.provider);

  const live = values.mode === "live";
  return {
    ok: true,
    message: live
      ? "Saved. This shop is now taking real payments."
      : "Saved. This shop is in test mode — no money will move.",
  };
}

/* ---------------------------------------------------------------- clear */

const clearSchema = z.object({
  provider: z.enum(["paystack", "paypal"]),
  slot: z.enum([
    "test_secret_key",
    "test_public_key",
    "live_secret_key",
    "live_public_key",
  ]),
});

/** Remove one stored key. Explicit, because blank means "unchanged". */
export async function clearPaymentKey(
  input: unknown
): Promise<PaymentActionResult> {
  const refusal = await authorise();
  if (refusal) return refusal;

  const parsed = clearSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Unknown key." };
  }

  const { provider, slot } = parsed.data;

  // Written out rather than computed, so the column name is checked against
  // the row type instead of widening the patch to `Record<string, unknown>`.
  const patch: Partial<PaymentCredentialRow> =
    slot === "test_secret_key"
      ? { test_secret_key: null }
      : slot === "test_public_key"
        ? { test_public_key: null }
        : slot === "live_secret_key"
          ? { live_secret_key: null }
          : { live_public_key: null };

  const { error } = await createAdminClient()
    .from("payment_credentials")
    .update(patch)
    .eq("provider", provider);

  if (error) {
    console.error(`[admin] payment key clear failed: ${describeError(error)}`);
    return { ok: false, message: "Could not remove that key." };
  }

  done(provider);
  return { ok: true, message: "Key removed." };
}

/* ----------------------------------------------------------------- test */

export interface ConnectionResult extends PaymentActionResult {
  businessName?: string;
  currencies?: string[];
  mode?: "test" | "live";
}

/**
 * Call Paystack with the key that is actually in force.
 *
 * Deliberately tests the *saved* key rather than one typed into the form: what
 * matters is whether checkout will work, and checkout reads the saved one.
 */
export async function testPaystackConnection(): Promise<ConnectionResult> {
  const refusal = await authorise();
  if (refusal) return refusal;

  try {
    const account = await checkAccount();

    return {
      ok: true,
      message: `Connected to ${account.businessName}.`,
      businessName: account.businessName,
      currencies: account.currencies,
    };
  } catch (error) {
    if (error instanceof PaystackError) {
      // 401 is the one an operator will actually hit, and "Paystack rejected
      // the request (401)" does not tell them what to do about it.
      return {
        ok: false,
        message:
          error.httpStatus === 401
            ? "Paystack rejected that key. Check it was copied in full, and that it matches the selected mode."
            : error.message,
      };
    }

    return { ok: false, message: "Could not reach Paystack." };
  }
}
