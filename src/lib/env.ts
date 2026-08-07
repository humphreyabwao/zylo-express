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

  /*
   * Paystack is no longer read from here.
   *
   * Its keys and settlement currency are resolved by
   * `src/lib/payments/credentials.ts`, which reads the `payment_credentials`
   * table first and falls back to `PAYSTACK_SECRET_KEY` / `PAYSTACK_CURRENCY`
   * only when nothing has been saved in the portal. Getters on this object
   * would answer from the environment alone and therefore contradict what
   * checkout actually uses, so they are deliberately absent.
   */

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

/*
 * `isPaystackConfigured()` and `isPaypalConfigured()` used to live here and
 * have been removed rather than left unused.
 *
 * Both answered "is there an environment variable", which stopped being the
 * question once the portal could store keys: an operator who configures
 * Paystack in Settings has a configured provider and an empty environment, and
 * either helper would have said no. Use `isProviderLive()` from
 * payments/credentials.ts, which consults both sources and also honours the
 * operator's on/off switch.
 */

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
