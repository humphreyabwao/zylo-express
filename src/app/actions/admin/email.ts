"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AdminAuthorizationError, requireAdminAction } from "@/lib/admin/guard";
import { createAdminClient } from "@/lib/supabase/admin";
import { describeError } from "@/lib/admin/errors";
import {
  forgetEmailCredentials,
  getEmailCredentials,
} from "@/lib/email/credentials";
import { ResendError, sendEmail } from "@/lib/email/resend";
import { renderTestEmail } from "@/lib/email/templates";
import type { EmailCredentialRow } from "@/lib/supabase/types";

/**
 * Resend configuration.
 *
 * ## Why the service-role client
 *
 * `email_credentials` has RLS enabled and no policies, exactly like
 * `payment_credentials`, so the operator client cannot see it — that is the
 * table's security model rather than an oversight. The authorisation RLS would
 * have provided is done here instead, before the client is constructed.
 *
 * ## Why superadmin
 *
 * An API key that can send mail as this shop's domain is a spoofing tool: it can
 * write to every customer the shop has, from an address they trust. That is a
 * different order of authority from editing copy or prices, and it belongs with
 * whoever holds the payment keys rather than with the Settings module.
 *
 * ## What comes back
 *
 * Never the key. `getMaskedEmailCredentials()` returns a hint; these actions
 * return a result. A secret goes in and does not come out.
 */

export interface EmailActionResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Blank means "leave this alone".
 *
 * The form only ever shows `re_••••a91f`, so it has nothing real to submit back.
 * Treating blank as a deletion would wipe the key every time somebody edited the
 * From name. Clearing is explicit — see `clearEmailKey`.
 */
const optionalKey = z
  .string()
  .trim()
  .max(200, "That does not look like an API key.")
  .optional()
  .transform((value) => (value ? value : undefined));

const settingsSchema = z.object({
  apiKey: optionalKey,
  fromEmail: z
    .string()
    .trim()
    .email("That is not a valid email address.")
    .max(200),
  fromName: z
    .string()
    .trim()
    .min(1, "Give the sender a name.")
    .max(80, "That name is too long."),
  replyTo: z
    .string()
    .trim()
    .max(200)
    .optional()
    .refine(
      (value) => !value || z.string().email().safeParse(value).success,
      "That is not a valid email address."
    ),
  enabled: z.boolean(),
  notifyOnStatus: z.boolean(),
  notifyOnTracking: z.boolean(),
});

async function authorise(): Promise<EmailActionResult | null> {
  try {
    await requireAdminAction({ module: "settings", superadmin: true });
    return null;
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

function done(): void {
  // The memo in credentials.ts is process-local and 30s; a save should take
  // effect on the next request rather than half a minute later.
  forgetEmailCredentials();
  revalidatePath("/admin/settings");
}

/* ----------------------------------------------------------------- save */

export async function updateEmailSettings(
  input: unknown
): Promise<EmailActionResult> {
  const refusal = await authorise();
  if (refusal) return refusal;

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message: "Please check the fields and try again.",
      fieldErrors: Object.fromEntries(
        Object.entries(flat)
          .filter(([, messages]) => messages?.length)
          .map(([field, messages]) => [field, messages![0]])
      ),
    };
  }

  const values = parsed.data;

  // Catches the paste that silently fails: a Resend key reads `re_…`, and
  // anything else here means a key from another dashboard.
  if (values.apiKey && !values.apiKey.startsWith("re_")) {
    return {
      ok: false,
      message: "That does not look like a Resend key.",
      fieldErrors: { apiKey: "A Resend API key starts with re_." },
    };
  }

  const patch: Partial<EmailCredentialRow> = {
    from_email: values.fromEmail,
    from_name: values.fromName,
    reply_to: values.replyTo || null,
    enabled: values.enabled,
    notify_on_status: values.notifyOnStatus,
    notify_on_tracking: values.notifyOnTracking,
  };

  // Only written when actually supplied, so saving the form does not blank the
  // key it never displayed.
  if (values.apiKey) patch.api_key = values.apiKey;

  const { error } = await createAdminClient()
    .from("email_credentials")
    .update(patch)
    .eq("provider", "resend");

  if (error) {
    console.error(`[admin] email settings save failed: ${describeError(error)}`);
    return {
      ok: false,
      message:
        error.code === "42P01"
          ? "The email settings table is missing. Run the database migrations first."
          : "Could not save those settings.",
    };
  }

  done();

  const sandbox = values.fromEmail.trim().toLowerCase() === "onboarding@resend.dev";

  return {
    ok: true,
    message: !values.enabled
      ? "Saved. Customer email is switched off."
      : sandbox
        ? "Saved — but the sender is still Resend's sandbox address, which only delivers to your own account. Verify a domain to reach customers."
        : "Saved. Customers will be emailed as their orders move.",
  };
}

/* ---------------------------------------------------------------- clear */

export async function clearEmailKey(): Promise<EmailActionResult> {
  const refusal = await authorise();
  if (refusal) return refusal;

  const { error } = await createAdminClient()
    .from("email_credentials")
    .update({ api_key: null, enabled: false })
    .eq("provider", "resend");

  if (error) {
    console.error(`[admin] email key clear failed: ${describeError(error)}`);
    return { ok: false, message: "Could not remove that key." };
  }

  done();
  // Switched off alongside, because a key-less "enabled" is a setting that
  // promises mail and sends none.
  return { ok: true, message: "Key removed and email switched off." };
}

/* ----------------------------------------------------------------- test */

/**
 * Send one real email to a nominated address.
 *
 * Uses the *saved* key rather than one typed into the form, because what matters
 * is whether order mail will work and order mail reads the saved one.
 */
export async function sendTestEmail(input: unknown): Promise<EmailActionResult> {
  const refusal = await authorise();
  if (refusal) return refusal;

  const parsed = z
    .object({ to: z.string().trim().email("That is not a valid email address.") })
    .safeParse(input);

  if (!parsed.success) {
    return { ok: false, message: "Enter an address to send to." };
  }

  const credentials = await getEmailCredentials();
  if (!credentials) {
    return {
      ok: false,
      message: "Save a Resend API key first.",
    };
  }

  const { subject, html, text } = renderTestEmail(parsed.data.to);

  try {
    await sendEmail({
      to: parsed.data.to,
      subject,
      html,
      text,
      // Deliberately unique per attempt: pressing "send test" twice should send
      // twice. This is the one path where a duplicate is the intent.
      idempotencyKey: `test:${Date.now()}:${parsed.data.to}`,
    });

    return { ok: true, message: `Sent to ${parsed.data.to}.` };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof ResendError ? error.message : "Could not send that email.",
    };
  }
}
