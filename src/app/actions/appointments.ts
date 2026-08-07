"use server";

import { z } from "zod";

import { createAnonymousClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { RateLimits, clientIdentifier, rateLimit } from "@/lib/rate-limit";
import { BOUTIQUES } from "@/data/content";

/**
 * Public appointment requests.
 *
 * The storefront has advertised private appointments since it was written —
 * /services#appointments, "Book in {city}" on every boutique card, "Arrange a
 * video appointment" on /boutiques — and every one of those buttons linked to
 * the generic contact form. A booking arrived as prose with no date, no
 * boutique and nothing to distinguish it from a sizing question.
 *
 * ## Why the anonymous client
 *
 * Same shape as `contact.ts`: the requester is a member of the public, and
 * `appointments` has policies for exactly that — insert allowed, select
 * admin-only. Using the service key here would disable RLS on one of the two
 * endpoints anonymous visitors can POST to.
 *
 * ## Why the insert has no `.select()`
 *
 * Reading the row back is a read, and the select policy is admin-only. A
 * `.select()` here would append `Prefer: return=representation`, PostgREST
 * would issue `INSERT ... RETURNING`, and the RETURNING would be refused —
 * leaving a booking that was written and a request that reported failure.
 * Verified against the live policies; the same trap is documented on
 * `contact_messages`.
 *
 * The cost is that the server cannot tell the customer their reference, since
 * the trigger assigns it and we never see the row. That is the right trade:
 * the alternative is a booking silently lost to a policy error, and the
 * reference is in the confirmation email a human sends anyway.
 */

export interface AppointmentResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
}

const BOUTIQUE_CITIES = BOUTIQUES.map((boutique) => boutique.city);

/** How far ahead a request may be made. Two working days, and a year out. */
const MIN_LEAD_HOURS = 48;
const MAX_LEAD_DAYS = 365;

const appointmentSchema = z
  .object({
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
      .email("That does not look like an email address."),
    phone: z
      .string()
      .trim()
      .max(40, "That number is too long.")
      .optional()
      .default(""),
    mode: z.enum(["in-person", "video"], {
      errorMap: () => ({ message: "Choose in person or video." }),
    }),
    /**
     * Validated against the boutiques the site actually lists, not accepted as
     * free text. A booking for a city with no boutique is one nobody can keep.
     */
    boutique: z.string().trim().max(80).optional().default(""),
    preferredAt: z
      .string()
      .trim()
      .min(1, "Please choose a date and time.")
      .refine((v) => !Number.isNaN(Date.parse(v)), "That date is not valid."),
    alternateAt: z
      .string()
      .trim()
      .optional()
      .default("")
      .refine(
        (v) => v === "" || !Number.isNaN(Date.parse(v)),
        "That second date is not valid."
      ),
    partySize: z
      .number()
      .int("Party size must be a whole number.")
      .min(1, "At least one guest.")
      .max(8, "For more than eight, please call the boutique."),
    interest: z.string().trim().max(300, "Keep this under 300 characters."),
    notes: z.string().trim().max(2000, "Please keep it under 2000 characters."),
  })
  // Mirrors `appointments_boutique_matches_mode`. Checked here so the customer
  // gets a sentence on the right field instead of a constraint violation.
  .superRefine((value, ctx) => {
    if (value.mode === "in-person") {
      if (!value.boutique) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["boutique"],
          message: "Choose which boutique.",
        });
      } else if (!BOUTIQUE_CITIES.includes(value.boutique)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["boutique"],
          message: "We do not have a boutique there.",
        });
      }
    }

    const preferred = Date.parse(value.preferredAt);
    const earliest = Date.now() + MIN_LEAD_HOURS * 3600_000;
    const latest = Date.now() + MAX_LEAD_DAYS * 86_400_000;

    if (preferred < earliest) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["preferredAt"],
        message: "Please allow at least two days' notice.",
      });
    } else if (preferred > latest) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["preferredAt"],
        message: "That is more than a year away.",
      });
    }

    if (value.alternateAt && value.alternateAt === value.preferredAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["alternateAt"],
        message: "Choose a different second time, or leave it blank.",
      });
    }
  });

export async function requestAppointment(
  input: unknown
): Promise<AppointmentResult> {
  // Rate limited before validation and keyed on the client: this is an
  // unauthenticated endpoint that writes a row, and a limit keyed on the
  // submitted email would be defeated by changing it.
  const identifier = await clientIdentifier();
  const limit = await rateLimit("appointment", identifier, RateLimits.submit);

  if (!limit.success) {
    return {
      ok: false,
      message: "That is a lot of requests at once. Try again in a minute.",
    };
  }

  const parsed = appointmentSchema.safeParse(input);
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
    console.error("[appointments] no Supabase configured; request discarded");
    return {
      ok: false,
      message: "Booking is unavailable right now. Please call the boutique.",
    };
  }

  const supabase = createAnonymousClient();

  // No `.select()` — see the header comment.
  const { error } = await supabase.from("appointments").insert({
    name: parsed.data.name,
    email: parsed.data.email,
    phone: parsed.data.phone || null,
    mode: parsed.data.mode,
    // Null for video, matching the check constraint.
    boutique: parsed.data.mode === "in-person" ? parsed.data.boutique : null,
    preferred_at: new Date(parsed.data.preferredAt).toISOString(),
    alternate_at: parsed.data.alternateAt
      ? new Date(parsed.data.alternateAt).toISOString()
      : null,
    party_size: parsed.data.partySize,
    interest: parsed.data.interest,
    notes: parsed.data.notes,
    // Pinned, and pinned again by the insert policy's `with check`. A request
    // must never be able to create itself as an agreed booking.
    status: "requested",
  });

  if (error) {
    console.error("[appointments] request insert failed:", error);
    return {
      ok: false,
      message: "We could not record that just now. Please try again shortly.",
    };
  }

  return {
    ok: true,
    message:
      "Thank you — a client advisor will confirm your appointment within one business day.",
  };
}
