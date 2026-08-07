import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { CacheTags, invalidateTags } from "@/lib/cache";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";

/**
 * Live exchange rates.
 *
 * Server-side only. The browser CSP allows connections to our own origin and
 * Supabase and nothing else, so a client-side fetch to an FX host would be
 * blocked — and a rate the client could set is a price the client could set.
 *
 * Default provider is exchangerate-api's open endpoint: free, no key, one
 * update a day, and it covers every currency in `SUPPORTED_CURRENCIES`. Set
 * `FX_API_URL` to move to a paid feed with intraday rates; the response shape
 * below (`{ rates: { CODE: number } }`) is what almost all of them return.
 */

const DEFAULT_ENDPOINT = "https://open.er-api.com/v6/latest";

/** Refuse to store a fetch older than this — a stale feed is worse than none. */
const MAX_AGE_HOURS = 48;

export interface FxResult {
  rates: Record<string, number>;
  /** ISO timestamp of when the provider last updated, not when we fetched. */
  updatedAt: string;
  source: string;
}

/**
 * Fetch rates for the currencies this store can display.
 *
 * Returns null rather than throwing on any failure. A rate refresh is a
 * best-effort improvement on what is already stored — if the provider is down,
 * the correct behaviour is to keep serving yesterday's rates, not to break
 * every price on the site.
 */
export async function fetchLiveRates(base: string): Promise<FxResult | null> {
  const code = base.toUpperCase();
  const configured = process.env.FX_API_URL?.trim();
  const endpoint = configured
    ? `${configured.replace(/\/$/, "")}/${code}`
    : `${DEFAULT_ENDPOINT}/${code}`;

  try {
    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        ...(process.env.FX_API_KEY
          ? { Authorization: `Bearer ${process.env.FX_API_KEY}` }
          : {}),
      },
      // Never cached by Next: the whole point is freshness, and a cached rate
      // response would make the refresh button a no-op.
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      console.error(`[fx] provider returned ${response.status}`);
      return null;
    }

    const payload = (await response.json()) as {
      result?: string;
      base_code?: string;
      base?: string;
      rates?: Record<string, unknown>;
      time_last_update_utc?: string;
    };

    if (payload.result && payload.result !== "success") {
      console.error("[fx] provider reported failure:", payload.result);
      return null;
    }

    // A provider quoting a different base would silently invert every price.
    const returnedBase = (payload.base_code ?? payload.base ?? code).toUpperCase();
    if (returnedBase !== code) {
      console.error(`[fx] asked for ${code}, provider answered in ${returnedBase}`);
      return null;
    }

    const raw = payload.rates ?? {};
    const rates: Record<string, number> = {};

    for (const currency of SUPPORTED_CURRENCIES) {
      const value = raw[currency];
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        rates[currency] = value;
      }
    }

    // The base is its own unit whatever the provider says.
    rates[code] = 1;

    // One rate is the base itself — that is not a usable feed.
    if (Object.keys(rates).length < 2) {
      console.error("[fx] provider returned no usable rates");
      return null;
    }

    const updatedAt = payload.time_last_update_utc
      ? new Date(payload.time_last_update_utc).toISOString()
      : new Date().toISOString();

    const ageHours = (Date.now() - Date.parse(updatedAt)) / 3_600_000;
    if (Number.isFinite(ageHours) && ageHours > MAX_AGE_HOURS) {
      console.error(`[fx] provider data is ${Math.round(ageHours)}h old; ignoring`);
      return null;
    }

    return {
      rates,
      updatedAt,
      source: configured ? new URL(configured).host : new URL(DEFAULT_ENDPOINT).host,
    };
  } catch (error) {
    console.error("[fx] fetch failed:", error);
    return null;
  }
}

/**
 * Fetch and store, preserving any rate the provider does not quote.
 *
 * Uses the service-role client deliberately: this runs from a background
 * refresh with no operator session behind it, and `site_settings` writes are
 * admin-only under RLS.
 */
export async function refreshStoredRates(
  base: string,
  existing: Record<string, number>
): Promise<FxResult | null> {
  const live = await fetchLiveRates(base);
  if (!live) return null;

  const merged = { ...existing, ...live.rates };

  const supabase = createAdminClient();
  const { error } = await supabase.from("site_settings").upsert(
    [
      { key: "currency.rates", value: merged },
      { key: "currency.rates_updated_at", value: live.updatedAt },
      { key: "currency.rates_source", value: live.source },
    ],
    { onConflict: "key" }
  );

  if (error) {
    console.error("[fx] could not store rates:", error);
    return null;
  }

  await invalidateTags([CacheTags.settings, CacheTags.products, CacheTags.facets]);
  return { ...live, rates: merged };
}
