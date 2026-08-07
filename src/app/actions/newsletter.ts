"use server";

import { z } from "zod";

import { createAnonymousClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { RateLimits, clientIdentifier, rateLimit } from "@/lib/rate-limit";

/**
 * Newsletter signups.
 *
 * `newsletter-form.tsx` awaited a 650ms timeout, showed "You are on the list",
 * and threw the address away. `newsletter_subscribers` existed with policies
 * and an email-format constraint, and had never held a row.
 *
 * ## Why an RPC rather than an insert or an upsert
 *
 * A signup has to be idempotent — `email` is unique, and a second signup from
 * the same address is not a failure from the subscriber's point of view. They
 * asked to be on the list and they are on the list.
 *
 * A plain `insert()` 23505s on that second signup. A `.upsert()` is refused
 * outright: PostgREST implements it as `INSERT ... ON CONFLICT DO UPDATE`,
 * which needs UPDATE as well as INSERT, and the `newsletter insertable` policy
 * grants only INSERT. Verified against the live database — the upsert comes
 * back 401 while the plain insert returns 201.
 *
 * So migration 12 exposes one narrow `SECURITY DEFINER` function that does
 * insert-or-reactivate atomically. It returns void, so this endpoint also
 * cannot be used to probe whether an address is already subscribed.
 */

export interface NewsletterResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
}

/** Where a signup came from. A closed set: it drives the admin's filter. */
const SOURCES = ["footer", "campaign", "checkout", "account"] as const;

const subscribeSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "An email address is required.")
    .max(200, "That address is too long.")
    .email("That does not look like an email address.")
    // Stored lowercase so `Ada@example.com` and `ada@example.com` are one
    // subscriber rather than two, and so the unique index actually bites.
    .transform((value) => value.toLowerCase()),
  consent: z
    .boolean()
    .refine((value) => value, "Please accept to continue."),
  source: z.enum(SOURCES).optional().default("footer"),
});

export async function subscribeToNewsletter(
  input: unknown
): Promise<NewsletterResult> {
  const identifier = await clientIdentifier();
  const limit = await rateLimit("newsletter", identifier, RateLimits.submit);

  if (!limit.success) {
    return {
      ok: false,
      message: "That is a lot of signups at once. Try again in a minute.",
    };
  }

  const parsed = subscribeSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }

  if (!isSupabaseConfigured()) {
    console.error("[newsletter] no Supabase configured; signup discarded");
    return {
      ok: false,
      message: "Subscriptions are unavailable right now. Please try later.",
    };
  }

  const supabase = createAnonymousClient();

  /**
   * Through the RPC — see the header comment.
   *
   * `is_confirmed` is deliberately not set here and stays at its `false`
   * default: double opt-in is not wired, because there is no mail provider to
   * send the confirmation. Leaving the column honest is what lets the admin
   * list show exactly which addresses a future confirmation step would have to
   * cover, rather than presenting an unverified list as a verified one.
   */
  const { error } = await supabase.rpc("subscribe_to_newsletter", {
    p_email: parsed.data.email,
    p_source: parsed.data.source,
  });

  if (error) {
    console.error("[newsletter] subscribe failed:", error);
    return {
      ok: false,
      message: "We could not add you just now. Please try again shortly.",
    };
  }

  return {
    ok: true,
    message: "You are on the list.",
  };
}
