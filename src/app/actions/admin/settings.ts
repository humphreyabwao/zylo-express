"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  AdminAuthorizationError,
  createOperatorClient,
  requireAdminAction,
} from "@/lib/admin/guard";
import { CacheTags, invalidateTags } from "@/lib/cache";
import { refusalMessage } from "@/lib/admin/errors";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { getStoreSettings } from "@/lib/settings";
import { refreshStoredRates } from "@/lib/fx";

/**
 * Store settings.
 *
 * Writes `site_settings`, which has existed since migration 3 and held nothing
 * until migration 13 seeded it. Every value here was previously a constant in
 * `src/data/commerce.ts`, changeable only by a deploy.
 *
 * ## Why the base currency is not editable
 *
 * `currency.base` names what the numbers already in the database mean. Every
 * product price, order total and payment amount is stored in its minor units.
 * Changing it would convert nothing — it would silently reinterpret a $1,250
 * bag as KES 1,250, and every historical order with it.
 *
 * Moving the ledger to another currency is a data migration: rewrite every
 * amount at a rate recorded at the moment of the change, and accept that
 * refunds against older orders now cross a boundary. It is not a form field,
 * so this file does not offer one.
 *
 * ## Rates are display-only
 *
 * They convert prices for presentation. They do not decide what a customer is
 * charged — that is `src/lib/payments/currency.ts`, which converts from the
 * books at charge time and records the rate it used on the payment row, so a
 * refund six weeks later still agrees with the original charge.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
}

async function authorise(): Promise<ActionResult | null> {
  try {
    // Settings move prices for every visitor at once. That is a different
    // weight of change from editing one product, so it takes an administrator
    // rather than any signed-in member of staff.
    await requireAdminAction({ elevated: true });
    return null;
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

/**
 * Drop everything downstream of a settings change.
 *
 * Prices, the free-shipping meter and the announcement bar all read these
 * rows, so the whole catalogue view is stale — not just the settings cache.
 * `revalidatePath("/", "layout")` covers the storefront chrome, which is where
 * the announcement bar and the currency switcher live.
 */
async function revalidateSettings() {
  await invalidateTags([
    CacheTags.settings,
    CacheTags.products,
    CacheTags.facets,
  ]);

  revalidatePath("/admin/settings");
  revalidatePath("/", "layout");
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

/** One upsert per key, in a single round trip. */
async function writeSettings(
  entries: { key: string; value: unknown }[]
): Promise<ActionResult | null> {
  const supabase = await createOperatorClient();

  const { error } = await supabase
    .from("site_settings")
    .upsert(
      entries.map(({ key, value }) => ({ key, value })),
      { onConflict: "key" }
    );

  if (error) {
    console.error("[admin] settings write failed:", error);
    return {
      ok: false,
      message: refusalMessage(error, "Could not save those settings."),
    };
  }

  return null;
}

/* --------------------------------------------------------------- currency */

const currencySchema = z
  .object({
    /**
     * Sent so the form is self-describing, and checked rather than trusted:
     * a payload naming a different base would otherwise be accepted and
     * reinterpret every stored amount.
     */
    base: z.string().trim().toUpperCase(),
    defaultCurrency: z
      .string()
      .trim()
      .toUpperCase()
      .refine((code) => SUPPORTED_CURRENCIES.includes(code), "Unsupported currency."),
    enabled: z
      .array(z.string().trim().toUpperCase())
      .min(1, "Enable at least one currency.")
      .max(SUPPORTED_CURRENCIES.length)
      .refine(
        (codes) => codes.every((code) => SUPPORTED_CURRENCIES.includes(code)),
        "That list contains a currency this store cannot format."
      ),
    /**
     * Units per 1 base unit. Bounded on both sides: a rate of 0 would render
     * every price as zero, and one in the millions is a typo rather than a
     * currency.
     */
    rates: z.record(
      z.string(),
      z
        .number()
        .positive("Rates must be greater than zero.")
        .max(1_000_000, "That rate is implausible.")
    ),
  })
  .superRefine((value, ctx) => {
    if (!value.enabled.includes(value.defaultCurrency)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaultCurrency"],
        message: "The default has to be one of the enabled currencies.",
      });
    }

    // Every enabled currency needs a rate, or it would be offered in the
    // switcher and then render at the base amount — a price silently wrong by
    // whatever the rate should have been.
    for (const code of value.enabled) {
      if (code === value.base) continue;
      const rate = value.rates[code];
      if (!Number.isFinite(rate) || rate <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rates"],
          message: `${code} is enabled but has no exchange rate.`,
        });
      }
    }
  });

export async function updateCurrencySettings(
  input: unknown
): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = currencySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const supabase = await createOperatorClient();

  // The stored base wins over anything the form sent. See the header comment:
  // this is the one value that must not be settable from a request.
  const { data: baseRow } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "currency.base")
    .maybeSingle();

  const base =
    typeof baseRow?.value === "string" ? baseRow.value.toUpperCase() : "USD";

  const rates: Record<string, number> = {};
  for (const [code, rate] of Object.entries(parsed.data.rates)) {
    rates[code.toUpperCase()] = rate;
  }
  // Written unconditionally: the base is its own unit, and a stored 0.98 would
  // make every price wrong in its own currency.
  rates[base] = 1;

  const enabled = [...new Set(parsed.data.enabled)];
  if (!enabled.includes(base)) enabled.unshift(base);

  const failed = await writeSettings([
    { key: "currency.default", value: parsed.data.defaultCurrency },
    { key: "currency.enabled", value: enabled },
    { key: "currency.rates", value: rates },
  ]);
  if (failed) return failed;

  await revalidateSettings();
  return {
    ok: true,
    message: `Storefront now shows ${parsed.data.defaultCurrency} by default.`,
  };
}

/* ------------------------------------------------------------- storefront */

const storefrontSchema = z.object({
  /** Base minor units. Accepts the major-unit string the form shows. */
  freeShippingThreshold: z
    .number()
    .int("Use a whole amount.")
    .min(0, "That cannot be negative.")
    .max(100_000_000, "That threshold is implausible."),
  announcements: z
    .array(z.string().trim().min(1).max(160, "Keep each line under 160 characters."))
    .min(1, "Keep at least one announcement.")
    .max(8, "Eight is as many as the bar can rotate through."),
});

export async function updateStorefrontSettings(
  input: unknown
): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = storefrontSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const failed = await writeSettings([
    {
      key: "free_shipping_threshold",
      value: parsed.data.freeShippingThreshold,
    },
    { key: "announcements", value: parsed.data.announcements },
  ]);
  if (failed) return failed;

  await revalidateSettings();
  return { ok: true, message: "Storefront settings saved." };
}

/* --------------------------------------------------------------- FX refresh */

export interface RefreshResult extends ActionResult {
  updatedAt?: string;
  source?: string;
}

/** Pull rates from the FX provider now, rather than waiting for the next sweep. */
export async function refreshExchangeRates(): Promise<RefreshResult> {
  const denied = await authorise();
  if (denied) return denied;

  const settings = await getStoreSettings();
  const result = await refreshStoredRates(
    settings.currency.base,
    settings.currency.rates
  );

  if (!result) {
    return {
      ok: false,
      message: "The rate provider did not answer. Existing rates are unchanged.",
    };
  }

  await revalidateSettings();
  return {
    ok: true,
    message: `Rates updated from ${result.source}.`,
    updatedAt: result.updatedAt,
    source: result.source,
  };
}
