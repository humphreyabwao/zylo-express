import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";
import type { EmailCredentialRow } from "@/lib/supabase/types";

/**
 * Where the Resend API key comes from.
 *
 * Deliberately the same two-source shape as `lib/payments/credentials.ts`:
 * `email_credentials` first, the environment second, so the portal is in charge
 * once it has been used and an install that never opens Settings keeps running
 * on `RESEND_API_KEY` with nothing to migrate.
 *
 * ## Why not Supabase
 *
 * Supabase's email is Auth-only — confirmation, magic link, password reset —
 * sent through its own SMTP configuration for those specific flows. There is no
 * API for "send this customer an arbitrary message", so order mail needs an
 * external provider. Resend is the one wired up here; the shape below is
 * provider-agnostic enough that a second could be added beside it.
 *
 * ## Two rules, same as the payment keys
 *
 * **The key never leaves the server.** Everything here is `server-only` and the
 * portal is handed `MaskedEmailCredentials` — a hint, never the key.
 *
 * **The key never enters the shared cache.** `lib/cache.ts` writes to Upstash
 * when configured, and an API key that can send mail as this shop's domain does
 * not belong in a third-party key/value store. The memo below is process-local.
 */

export interface ResolvedEmailCredentials {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyTo: string | null;
  enabled: boolean;
  notifyOnStatus: boolean;
  notifyOnTracking: boolean;
  source: "portal" | "environment";
}

/** What Settings renders. By construction, no field here carries the key. */
export interface MaskedEmailCredentials {
  configured: boolean;
  enabled: boolean;
  fromEmail: string;
  fromName: string;
  replyTo: string | null;
  notifyOnStatus: boolean;
  notifyOnTracking: boolean;
  /** e.g. "re_••••a91f", or null when no key is stored. */
  apiKeyHint: string | null;
  source: "portal" | "environment" | "none";
  updatedAt: string | null;
  /**
   * True while the sender is Resend's shared sandbox address.
   *
   * Worth surfacing in the UI rather than leaving to be discovered: on
   * `onboarding@resend.dev` Resend accepts the request and then only delivers to
   * the account's own address, so every customer email silently goes nowhere.
   * The symptom is "the API says 200 and nobody gets anything".
   */
  usingSandboxSender: boolean;
}

const SANDBOX_SENDER = "onboarding@resend.dev";

/* ------------------------------------------------------------------- memo */

const MEMO_MS = 30_000;

let memo: { row: EmailCredentialRow | null; at: number } | null = null;

/** Called by the settings action after a write, so a save takes effect now. */
export function forgetEmailCredentials(): void {
  memo = null;
}

async function readRow(): Promise<EmailCredentialRow | null> {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.row;

  // No database on a fresh clone — fall through to the environment rather than
  // throwing, which is what keeps `next build` working without secrets.
  if (!isSupabaseConfigured()) return null;

  let row: EmailCredentialRow | null = null;

  try {
    const { data, error } = await createAdminClient()
      .from("email_credentials")
      .select("*")
      .eq("provider", "resend")
      .maybeSingle();

    // 42P01 is migration 24 not applied yet. Normal during a deploy, and the
    // environment still answers, so it is not worth an exception on a path that
    // runs while somebody is trying to mark an order shipped.
    if (error) {
      if (error.code !== "42P01") {
        console.warn(`[email] could not read credentials: ${error.message}`);
      }
    } else {
      row = data;
    }
  } catch (cause) {
    console.warn(
      "[email] could not read credentials:",
      cause instanceof Error ? cause.message : cause
    );
  }

  memo = { row, at: Date.now() };
  return row;
}

/* --------------------------------------------------------------- resolving */

function fromEnvironment(): ResolvedEmailCredentials | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;

  return {
    apiKey,
    fromEmail: process.env.RESEND_FROM_EMAIL?.trim() || SANDBOX_SENDER,
    fromName: process.env.RESEND_FROM_NAME?.trim() || "ZYLO Express",
    replyTo: process.env.RESEND_REPLY_TO?.trim() || null,
    // An operator who set the variable meant to send mail; there is no second
    // switch in the environment to consult.
    enabled: true,
    notifyOnStatus: true,
    notifyOnTracking: true,
    source: "environment",
  };
}

function fromRow(row: EmailCredentialRow): ResolvedEmailCredentials | null {
  const apiKey = row.api_key?.trim();
  // A row with no key is the seeded placeholder, not a configuration. Returning
  // null lets the environment answer instead.
  if (!apiKey) return null;

  return {
    apiKey,
    fromEmail: row.from_email.trim() || SANDBOX_SENDER,
    fromName: row.from_name.trim() || "ZYLO Express",
    replyTo: row.reply_to?.trim() || null,
    enabled: row.enabled,
    notifyOnStatus: row.notify_on_status,
    notifyOnTracking: row.notify_on_tracking,
    source: "portal",
  };
}

/**
 * Usable Resend credentials, or null when email is not set up.
 *
 * Returns the row even when `enabled` is false — the caller decides. Sending
 * paths check `enabled`; the settings screen and a connection test do not.
 */
export async function getEmailCredentials(): Promise<ResolvedEmailCredentials | null> {
  const row = await readRow();
  return (row ? fromRow(row) : null) ?? fromEnvironment();
}

/* ----------------------------------------------------------------- masking */

function hint(value: string | null | undefined): string | null {
  const key = value?.trim();
  if (!key) return null;
  if (key.length <= 8) return "••••";

  // Resend keys read `re_…`. The prefix is not the secret part, and showing it
  // is how an operator recognises that something is stored at all.
  const prefix = key.startsWith("re_") ? "re_" : "";
  return `${prefix}••••${key.slice(-4)}`;
}

export async function getMaskedEmailCredentials(): Promise<MaskedEmailCredentials> {
  const row = await readRow();
  const resolved = await getEmailCredentials();

  const fromEmail = row?.from_email ?? resolved?.fromEmail ?? SANDBOX_SENDER;

  return {
    configured: Boolean(resolved),
    enabled: row?.enabled ?? resolved?.enabled ?? false,
    fromEmail,
    fromName: row?.from_name ?? resolved?.fromName ?? "ZYLO Express",
    replyTo: row?.reply_to ?? resolved?.replyTo ?? null,
    notifyOnStatus: row?.notify_on_status ?? true,
    notifyOnTracking: row?.notify_on_tracking ?? true,
    apiKeyHint: hint(row?.api_key),
    source: resolved?.source ?? "none",
    updatedAt: row?.updated_at ?? null,
    usingSandboxSender: fromEmail.trim().toLowerCase() === SANDBOX_SENDER,
  };
}

export { SANDBOX_SENDER };
