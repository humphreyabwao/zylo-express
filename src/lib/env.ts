import "server-only";

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
    return (process.env.SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  },
} as const;

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
