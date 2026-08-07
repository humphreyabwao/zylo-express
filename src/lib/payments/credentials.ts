import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";
import type { PaymentCredentialRow } from "@/lib/supabase/types";

/**
 * Where a provider's API keys come from.
 *
 * Two sources, in order:
 *
 *   1. `payment_credentials` — edited in Settings, so rotating a key or moving
 *      from sandbox to production is a form submission.
 *   2. the environment — `PAYSTACK_SECRET_KEY` and friends.
 *
 * The environment is the fallback rather than the override so that the portal
 * is the thing in charge once it has been used. An install that has never
 * opened Settings keeps running on its env vars with nothing to migrate; the
 * moment a key is saved in the portal, that is the key.
 *
 * ## Two rules this module exists to enforce
 *
 * **A secret never leaves the server.** Everything here is `server-only`, and
 * the portal is given `MaskedCredentials` — last four characters and nothing
 * else. There is no code path that puts `secretKey` into a props object.
 *
 * **A secret never enters the shared cache.** `lib/cache.ts` writes to Upstash
 * when it is configured, and a payment key does not belong in a third-party
 * key/value store. The memo below is process-local and short, which is enough:
 * it exists to keep a checkout from making four round trips to Postgres, not
 * to survive a deploy.
 */

export type PaymentProvider = "paystack" | "paypal";
export type PaymentMode = "test" | "live";

export interface ResolvedCredentials {
  provider: PaymentProvider;
  mode: PaymentMode;
  /** Never send this to a client. */
  secretKey: string;
  /** Paystack's public key. Unused today — the card flow is a redirect. */
  publicKey: string | null;
  settlementCurrency: string;
  enabled: boolean;
  source: "portal" | "environment";
}

/** What the portal is allowed to see. */
export interface MaskedCredentials {
  provider: PaymentProvider;
  mode: PaymentMode;
  enabled: boolean;
  settlementCurrency: string;
  /** e.g. "sk_test_…a91f", or null when that slot is empty. */
  testSecretHint: string | null;
  testPublicHint: string | null;
  liveSecretHint: string | null;
  livePublicHint: string | null;
  /** True when the *selected* mode has a usable secret from either source. */
  configured: boolean;
  source: "portal" | "environment" | "none";
  updatedAt: string | null;
}

/* ------------------------------------------------------------------- memo */

const MEMO_MS = 30_000;

type Memo = { row: PaymentCredentialRow | null; at: number };
const memo = new Map<PaymentProvider, Memo>();

/** Called by the settings action after a write, so a save takes effect now. */
export function forgetCredentials(provider?: PaymentProvider): void {
  if (provider) memo.delete(provider);
  else memo.clear();
}

async function readRow(
  provider: PaymentProvider
): Promise<PaymentCredentialRow | null> {
  const hit = memo.get(provider);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.row;

  // No database on a fresh clone — fall through to the environment rather
  // than throwing, which is what keeps `next build` working without secrets.
  if (!isSupabaseConfigured()) return null;

  let row: PaymentCredentialRow | null = null;

  try {
    const { data, error } = await createAdminClient()
      .from("payment_credentials")
      .select("*")
      .eq("provider", provider)
      .maybeSingle();

    // A missing table means migration 19 has not been applied yet. That is a
    // normal state during a deploy, and the environment still answers, so it
    // is worth one line rather than an exception on the checkout path.
    if (error) {
      if (error.code !== "42P01") {
        console.warn(
          `[payments] could not read ${provider} credentials: ${error.message}`
        );
      }
    } else {
      row = data;
    }
  } catch (cause) {
    console.warn(
      `[payments] could not read ${provider} credentials:`,
      cause instanceof Error ? cause.message : cause
    );
  }

  memo.set(provider, { row, at: Date.now() });
  return row;
}

/* --------------------------------------------------------------- resolving */

function fromEnvironment(provider: PaymentProvider): ResolvedCredentials | null {
  if (provider === "paystack") {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) return null;

    return {
      provider,
      // A Paystack key names its own mode, so an operator running on env vars
      // does not have to declare it twice.
      mode: secretKey.startsWith("sk_live") ? "live" : "test",
      secretKey,
      publicKey: process.env.PAYSTACK_PUBLIC_KEY ?? null,
      settlementCurrency: (process.env.PAYSTACK_CURRENCY ?? "KES").toUpperCase(),
      enabled: true,
      source: "environment",
    };
  }

  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  return {
    provider,
    mode: process.env.PAYPAL_ENVIRONMENT === "live" ? "live" : "test",
    secretKey: clientSecret,
    publicKey: clientId,
    settlementCurrency: "USD",
    enabled: true,
    source: "environment",
  };
}

function fromRow(row: PaymentCredentialRow): ResolvedCredentials | null {
  const secretKey =
    row.mode === "live" ? row.live_secret_key : row.test_secret_key;
  const publicKey =
    row.mode === "live" ? row.live_public_key : row.test_public_key;

  // A row whose selected mode has no key is not a configuration — it is the
  // seeded placeholder. Returning null lets the environment answer instead.
  if (!secretKey?.trim()) return null;

  return {
    provider: row.provider,
    mode: row.mode,
    secretKey: secretKey.trim(),
    publicKey: publicKey?.trim() || null,
    settlementCurrency: row.settlement_currency.toUpperCase(),
    enabled: row.enabled,
    source: "portal",
  };
}

/**
 * Usable keys for a provider, or null when it is not set up.
 *
 * `enabled: false` still resolves — an operator who switches a provider off
 * should stop being *offered* it at checkout, while a payment already in
 * flight can still be verified and settled. Callers that decide what to offer
 * check `enabled`; callers that reconcile do not.
 */
export async function getCredentials(
  provider: PaymentProvider
): Promise<ResolvedCredentials | null> {
  const row = await readRow(provider);
  return (row ? fromRow(row) : null) ?? fromEnvironment(provider);
}

/** Configured, switched on, and therefore offerable at checkout. */
export async function isProviderLive(
  provider: PaymentProvider
): Promise<boolean> {
  const resolved = await getCredentials(provider);
  return Boolean(resolved?.enabled);
}

/* ----------------------------------------------------------------- masking */

/** Last four characters, with the (non-secret) prefix kept for recognisability. */
function hint(value: string | null | undefined): string | null {
  const key = value?.trim();
  if (!key) return null;
  if (key.length <= 8) return "••••";

  // Paystack keys read sk_test_… / pk_live_…; showing which one is stored is
  // the whole point of the hint, and the prefix is not the secret part.
  const prefix = /^[sp]k_(test|live)_/.exec(key)?.[0] ?? "";
  return `${prefix}••••${key.slice(-4)}`;
}

/**
 * What Settings renders. Safe to pass to a Client Component — by construction
 * this type has no field that carries a key.
 */
export async function getMaskedCredentials(
  provider: PaymentProvider
): Promise<MaskedCredentials> {
  const row = await readRow(provider);
  const resolved = await getCredentials(provider);

  const fallbackCurrency = provider === "paypal" ? "USD" : "KES";

  return {
    provider,
    mode: row?.mode ?? resolved?.mode ?? "test",
    enabled: row?.enabled ?? true,
    settlementCurrency:
      row?.settlement_currency ?? resolved?.settlementCurrency ?? fallbackCurrency,
    testSecretHint: hint(row?.test_secret_key),
    testPublicHint: hint(row?.test_public_key),
    liveSecretHint: hint(row?.live_secret_key),
    livePublicHint: hint(row?.live_public_key),
    configured: Boolean(resolved),
    source: resolved?.source ?? "none",
    updatedAt: row?.updated_at ?? null,
  };
}
