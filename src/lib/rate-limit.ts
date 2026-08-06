import "server-only";

import { headers } from "next/headers";

import { rawIncrement } from "@/lib/cache";

/**
 * Fixed-window rate limiting.
 *
 * Backed by Redis when configured, so limits hold across serverless instances.
 * On the in-memory fallback each instance counts separately — fine for local
 * development, not a real limit in production. Set the Upstash vars.
 *
 * Fails OPEN: if the counter store is unreachable the request is allowed. For
 * a storefront, dropping real traffic during a cache outage is worse than
 * briefly under-enforcing a limit. Anything protecting money or credentials
 * should also be behind auth or a captcha, not this alone.
 */

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets. */
  reset: number;
}

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
}

/** Sensible defaults per surface, so call sites don't invent numbers. */
export const RateLimits = {
  /** Typing-speed search. Generous — a fast typist is not an attacker. */
  search: { limit: 40, windowSeconds: 60 },
  /** Anything that writes a row from an anonymous visitor. */
  submit: { limit: 8, windowSeconds: 60 },
  /** Credential endpoints. Tight, and paired with Supabase's own throttling. */
  auth: { limit: 6, windowSeconds: 300 },
  /** Long-lived streams; the cost is the connection, not the request. */
  stream: { limit: 12, windowSeconds: 60 },
  /**
   * Payment status polling. A live M-Pesa prompt is checked every 3 seconds,
   * so the honest ceiling is 20/minute — this leaves room for a retry and a
   * second tab without letting anyone grind through payment references.
   */
  poll: { limit: 60, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitOptions>;

/**
 * Best-effort client identity.
 *
 * Header order matters: on Vercel `x-forwarded-for` is set by the platform and
 * a client-supplied one is overwritten, but behind other proxies it can be
 * spoofed. The leftmost entry is the original client.
 */
export async function clientIdentifier(): Promise<string> {
  const headerList = await headers();

  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  return headerList.get("x-real-ip") ?? "anonymous";
}

export async function rateLimit(
  bucket: string,
  identifier: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const { limit, windowSeconds } = options;
  const key = `ratelimit:${bucket}:${identifier}`;

  try {
    const { count, ttl } = await rawIncrement(key, windowSeconds);

    return {
      success: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      reset: ttl,
    };
  } catch (error) {
    console.error("[rate-limit] counter unavailable, allowing request:", error);
    return { success: true, limit, remaining: limit, reset: windowSeconds };
  }
}

/** Standard headers so clients can back off intelligently. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.reset),
    ...(result.success ? {} : { "Retry-After": String(result.reset) }),
  };
}
