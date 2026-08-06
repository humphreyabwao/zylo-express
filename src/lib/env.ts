import "server-only";

import { resolveSiteUrl } from "./site-url";

/**
 * Validated server environment.
 *
 * `server-only` makes importing this from a Client Component a build error, so
 * a stray import can't quietly ship a secret to the browser. Nothing here is
 * `NEXT_PUBLIC_`-prefixed, which is the mechanism that would inline a value
 * into the client bundle.
 *
 * Values are read lazily. Reading at module scope would run during `next build`
 * and fail collection for anyone building without a populated `.env.local`.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy .env.example to .env.local and fill it in.`
    );
  }
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const env = {
  get supabaseUrl() {
    return required("SUPABASE_URL");
  },
  get supabaseProjectId() {
    return required("SUPABASE_PROJECT_ID");
  },
  /** Subject to Row Level Security. Used for all end-user requests. */
  get supabasePublishableKey() {
    return required("SUPABASE_PUBLISHABLE_KEY");
  },
  /** BYPASSES Row Level Security. Only for trusted server-side operations. */
  get supabaseSecretKey() {
    return required("SUPABASE_SECRET_KEY");
  },
  get redisUrl() {
    return optional("UPSTASH_REDIS_REST_URL");
  },
  get redisToken() {
    return optional("UPSTASH_REDIS_REST_TOKEN");
  },
  get siteUrl() {
    return resolveSiteUrl();
  },

  /* ------------------------------------------------------------ payments */

  /**
   * Paystack secret key (`sk_test_…` / `sk_live_…`).
   *
   * The matching *public* key is deliberately absent from this file and from
   * the app. It only exists to authenticate Paystack's browser-side Inline
   * popup, and we do not use Inline: transactions are initialised server-side
   * and the customer is redirected to Paystack's hosted page. That keeps card
   * entry off this origin entirely — no PAN, no PCI scope, no key to inline.
   */
  get paystackSecretKey() {
    return required("PAYSTACK_SECRET_KEY");
  },
  /**
   * Currency Paystack settles in — the one your Paystack account is registered
   * for. M-Pesa exists only on Kenyan accounts, so KES is the default.
   */
  get paystackCurrency() {
    return (optional("PAYSTACK_CURRENCY") ?? "KES").toUpperCase();
  },

  get paypalClientId() {
    return required("PAYPAL_CLIENT_ID");
  },
  get paypalClientSecret() {
    return required("PAYPAL_CLIENT_SECRET");
  },
  /** Set once the account is live; anything else stays on sandbox. */
  get paypalApiBase() {
    return optional("PAYPAL_ENVIRONMENT") === "live"
      ? "https://api-m.paypal.com"
      : "https://api-m.sandbox.paypal.com";
  },
  /**
   * Webhook id from the PayPal dashboard. Without it a webhook payload cannot
   * be verified, so the handler rejects everything — see payments/paypal.ts.
   */
  get paypalWebhookId() {
    return optional("PAYPAL_WEBHOOK_ID");
  },
} as const;

export function isPaystackConfigured(): boolean {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

export function isPaypalConfigured(): boolean {
  return Boolean(
    process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET
  );
}

/**
 * Whether Supabase is wired up. The catalogue falls back to the local seed
 * data when it isn't, so the storefront renders on a fresh clone with no
 * credentials — which also keeps `next build` working in CI.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY
  );
}

export function isRedisConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}
