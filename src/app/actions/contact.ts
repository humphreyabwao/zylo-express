"use server";

import { z } from "zod";

import { createAnonymousClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { RateLimits, clientIdentifier, rateLimit } from "@/lib/rate-limit";

/**
 * The public contact form.
 *
 * Before this existed, `contact-form.tsx` awaited a 900ms timeout and reported
 * success. Every enquiry a customer sent was discarded in the browser — the
 * admin inbox read a table nothing had ever written to, and would have stayed
 * empty forever.
 *
 * ## Why the anonymous client, not the operator or service client
 *
 * The sender is a member of the public. `contact_messages` has exactly the
 * policies for that shape (migration 4): `for insert with check (true)` so
 * anyone may write, and an admin-only select so nobody may read the list back.
 * Using the service key here would work and would also mean the one endpoint
 * anonymous visitors can POST to is running with RLS disabled.
 *
 * ## Why the insert must not be followed by `.select()`
 *
 * Reading a row back is a *read*, and the select policy on this table is
 * admin-only. Chaining `.select()` here would append `Prefer:
 * return=representation`, PostgREST would issue `INSERT ... RETURNING`, and
 * the RETURNING would be refused — leaving a row that was written and a
 * request that reported failure, which is the most confusing shape a failure
 * can take.
 *
 * A bare `insert()` sends no such header (postgrest-js only adds it in
 * `.select()`), so nothing is read back and the write stands on its own. That
 * is why this call ends where it does, and why it must stay that way.
 */

export interface ContactResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
}

const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Please tell us your name.")
    .max(120, "That name is too long."),
  email: z
    .string()
    .trim()
    .min(1, "An email address is required.")
    .max(200, "That address is too long.")
    // Mirrors `contact_email_format` in migration 3. The database check is the
    // one that is load-bearing; this exists to say so in a sentence.
    .email("That does not look like an email address."),
  subject: z
    .string()
    .trim()
    .min(1, "Please choose a subject.")
    .max(200, "That subject is too long."),
  message: z
    .string()
    .trim()
    .min(10, "Please tell us a little more.")
    .max(5000, "Please keep it under 5000 characters."),
  orderReference: z
    .string()
    .trim()
    .max(60, "That reference is too long.")
    .optional()
    .default(""),
});

export async function submitContactMessage(
  input: unknown
): Promise<ContactResult> {
  /**
   * Rate limited before validation, and keyed on the client rather than on
   * anything in the payload. This is an unauthenticated endpoint that writes a
   * row: without a ceiling it is a way to fill a table for free, and a limit
   * keyed on the submitted email address would be defeated by changing it.
   */
  const identifier = await clientIdentifier();
  const limit = await rateLimit("contact", identifier, RateLimits.submit);

  if (!limit.success) {
    return {
      ok: false,
      message: "That is a lot of messages at once. Try again in a minute.",
    };
  }

  const parsed = contactSchema.safeParse(input);
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

  // Without Supabase the form has nowhere to write. Saying so is better than
  // the previous behaviour, which was to claim success regardless.
  if (!isSupabaseConfigured()) {
    console.error("[contact] no Supabase configured; message discarded");
    return {
      ok: false,
      message: "Messaging is unavailable right now. Please email us directly.",
    };
  }

  const supabase = createAnonymousClient();

  // No `.select()` — see the header comment. RETURNING would be refused by the
  // admin-only select policy on a row that had, in fact, been written.
  const { error } = await supabase.from("contact_messages").insert({
    name: parsed.data.name,
    email: parsed.data.email,
    subject: parsed.data.subject,
    message: parsed.data.message,
    order_reference: parsed.data.orderReference || null,
    status: "new",
  });

  if (error) {
    // The sender is not shown the database's reasoning — it would tell them
    // about the schema, and there is nothing they could do with it.
    console.error("[contact] message insert failed:", error);
    return {
      ok: false,
      message: "We could not send that just now. Please try again shortly.",
    };
  }

  return {
    ok: true,
    message: "Thank you — a client advisor will reply within one business day.",
  };
}
