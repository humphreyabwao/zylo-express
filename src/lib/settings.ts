import "server-only";

import { createAnonymousClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { CacheTags, TTL, cached } from "@/lib/cache";
import { SUPPORTED_CURRENCIES, type CurrencyConfig } from "@/lib/currency";
import { FREE_SHIPPING_THRESHOLD } from "@/data/commerce";
import { ANNOUNCEMENTS } from "@/data/navigation";

/**
 * Store settings, read from `site_settings`.
 *
 * The table has existed since migration 3 and held nothing: every value it was
 * meant to carry lived as a constant in `src/data/commerce.ts`, editable only
 * by a deploy.
 *
 * ## Defaults are the bundled constants, not invented values
 *
 * Same pattern as `getCategories()` and `getContentPages()`: database first,
 * bundled constants when there is nothing to read. That means a fresh clone, a
 * preview deployment with no Supabase, and a failed query all render the store
 * exactly as it renders today rather than with a $0 free-shipping threshold or
 * an empty announcement bar.
 *
 * ## Everything here is public
 *
 * The RLS policy is `for select using (true)` — the storefront resolves prices
 * from these rows on every request, so they cannot be admin-gated. Nothing
 * secret belongs in this table, and the migration says so on the table itself.
 */

export interface StoreSettings {
  currency: CurrencyConfig;
  /** Base minor units. Above this, standard delivery is free. */
  freeShippingThreshold: number;
  announcements: string[];
  /** When the FX provider last updated the stored rates. Null if never. */
  ratesUpdatedAt: string | null;
  /** Host the rates came from, for the Settings screen. */
  ratesSource: string | null;
}

/** Read when the database has nothing to say. */
export const SETTINGS_FALLBACK: StoreSettings = {
  currency: {
    base: "USD",
    default: "USD",
    enabled: ["USD"],
    rates: { USD: 1 },
  },
  freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
  announcements: [...ANNOUNCEMENTS],
  ratesUpdatedAt: null,
  ratesSource: null,
};

/* --------------------------------------------------------------- coercion */

/**
 * Every reader below is defensive.
 *
 * `site_settings.value` is `jsonb` with no shape constraint, and an operator
 * editing a row in the Supabase table editor can put anything in it. A store
 * that 500s because someone typed a string where a number belonged is a worse
 * outcome than one that quietly uses its default, so each of these narrows and
 * falls back rather than throwing.
 */

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const strings = value.filter(
    (entry): entry is string => typeof entry === "string" && entry.trim() !== ""
  );
  return strings.length > 0 ? strings : fallback;
}

function asRates(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const rates: Record<string, number> = {};
  for (const [code, rate] of Object.entries(value as Record<string, unknown>)) {
    if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
      rates[code.toUpperCase()] = rate;
    }
  }
  return rates;
}

/* ------------------------------------------------------------------- read */

export async function getStoreSettings(): Promise<StoreSettings> {
  if (!isSupabaseConfigured()) return SETTINGS_FALLBACK;

  return cached(
    "settings:store",
    async () => {
      const supabase = createAnonymousClient();
      const { data, error } = await supabase
        .from("site_settings")
        .select("key, value");

      if (error) {
        console.error("[settings] fetch failed:", error);
        return SETTINGS_FALLBACK;
      }

      const rows = data as { key: string; value: unknown }[];
      if (rows.length === 0) return SETTINGS_FALLBACK;

      const byKey = new Map(rows.map((row) => [row.key, row.value]));
      const get = (key: string) => byKey.get(key);

      const base = asString(
        get("currency.base"),
        SETTINGS_FALLBACK.currency.base
      ).toUpperCase();

      const rates = asRates(get("currency.rates"));
      // The base is its own unit by definition. Written unconditionally so a
      // stored `{"USD": 0.98}` — a typo, or a stale row — cannot make every
      // price on the site two per cent wrong in its own currency.
      rates[base] = 1;

      const enabled = asStringArray(get("currency.enabled"), [base])
        .map((code) => code.toUpperCase())
        // Only currencies this app can actually format. An unknown code would
        // reach `Intl.NumberFormat` and throw a RangeError mid-render.
        .filter((code) => SUPPORTED_CURRENCIES.includes(code))
        // And only ones with a usable rate, so the switcher can never offer a
        // currency that would silently render at the base amount.
        .filter((code) => code === base || (rates[code] ?? 0) > 0);

      // The base is always offered, even if someone removes it from the list:
      // it is the only currency guaranteed to be exact.
      if (!enabled.includes(base)) enabled.unshift(base);

      const preferredDefault = asString(get("currency.default"), base).toUpperCase();

      return {
        currency: {
          base,
          default: enabled.includes(preferredDefault) ? preferredDefault : base,
          enabled,
          rates,
        },
        freeShippingThreshold: asNumber(
          get("free_shipping_threshold"),
          SETTINGS_FALLBACK.freeShippingThreshold
        ),
        announcements: asStringArray(
          get("announcements"),
          SETTINGS_FALLBACK.announcements
        ),
        ratesUpdatedAt:
          typeof get("currency.rates_updated_at") === "string"
            ? (get("currency.rates_updated_at") as string)
            : null,
        ratesSource:
          typeof get("currency.rates_source") === "string"
            ? (get("currency.rates_source") as string)
            : null,
      } satisfies StoreSettings;
    },
    { ttl: TTL.settings, tags: [CacheTags.settings] }
  );
}

/** Just the currency block — the hot path, called on every storefront render. */
export async function getCurrencyConfig(): Promise<CurrencyConfig> {
  return (await getStoreSettings()).currency;
}

/** Rates older than this trigger a background refresh on the next read. */
const RATE_STALE_HOURS = 12;

export function ratesAreStale(updatedAt: string | null): boolean {
  if (!updatedAt) return true;
  const age = Date.now() - Date.parse(updatedAt);
  return !Number.isFinite(age) || age > RATE_STALE_HOURS * 3_600_000;
}

/**
 * Settings, refreshing the FX rates in the background when they are stale.
 *
 * The refresh is deliberately not awaited. A shopper loading a product page
 * should never wait on a third-party FX host — they get the rates already
 * stored, and the next request gets the new ones. If the provider is down the
 * only consequence is that yesterday's rates stay in place, which is the right
 * failure.
 *
 * Guarded by an in-process flag so a burst of concurrent requests fires one
 * fetch rather than fifty. That is per instance, not global — a few duplicate
 * refreshes across serverless instances are harmless, and coordinating them
 * would mean a lock for something idempotent.
 */
let refreshInFlight = false;

export async function getStoreSettingsWithLiveRates(): Promise<StoreSettings> {
  const settings = await getStoreSettings();

  if (
    isSupabaseConfigured() &&
    !refreshInFlight &&
    ratesAreStale(settings.ratesUpdatedAt)
  ) {
    refreshInFlight = true;

    // Imported lazily so the FX module — and its `createAdminClient` — is not
    // pulled into every render that only reads settings.
    void import("@/lib/fx")
      .then(({ refreshStoredRates }) =>
        refreshStoredRates(settings.currency.base, settings.currency.rates)
      )
      .catch((error) => console.error("[settings] rate refresh failed:", error))
      .finally(() => {
        refreshInFlight = false;
      });
  }

  return settings;
}
