"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  AdminAuthorizationError,
  createOperatorClient,
  requireAdminAction,
} from "@/lib/admin/guard";
import { refusalMessage } from "@/lib/admin/errors";
import { getSubscriberExport } from "@/lib/admin/queries";

/**
 * Mailing list mutations.
 *
 * ## Unsubscribing sets a timestamp; it does not delete the row
 *
 * A deleted subscriber is indistinguishable from someone who never subscribed,
 * so the next import — or the next time they type their address into the
 * footer — puts them back on a list they asked to leave. `unsubscribed_at` is
 * the record that they asked, and it is the thing that keeps the promise.
 *
 * Delete is still offered, because a typo'd address and a spam signup are real
 * and should not sit in the list forever. It is separate, and it says so.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
}

const idSchema = z.string().uuid("That is not a valid subscriber id.");

function revalidateList() {
  revalidatePath("/admin/subscribers");
  revalidatePath("/admin");
}

async function authorise(): Promise<ActionResult | null> {
  try {
    await requireAdminAction();
    return null;
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

/* ------------------------------------------------------ subscription state */

const stateSchema = z.object({
  id: idSchema,
  subscribed: z.boolean(),
});

export async function setSubscriptionState(input: unknown): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = stateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]!.message };
  }

  const supabase = await createOperatorClient();
  const { data, error } = await supabase
    .from("newsletter_subscribers")
    .update({
      unsubscribed_at: parsed.data.subscribed ? null : new Date().toISOString(),
    })
    .eq("id", parsed.data.id)
    .select("email")
    .maybeSingle();

  if (error) {
    console.error("[admin] subscription state failed:", error);
    return { ok: false, message: refusalMessage(error, "Could not update that subscriber.") };
  }
  if (!data) return { ok: false, message: "That subscriber no longer exists." };

  revalidateList();
  return {
    ok: true,
    message: parsed.data.subscribed
      ? `${data.email} resubscribed.`
      : `${data.email} unsubscribed.`,
  };
}

/**
 * Mark an address confirmed by hand.
 *
 * Double opt-in is not wired — there is no mail provider to send the
 * confirmation — so every signup lands unconfirmed. This exists so an operator
 * who has verified an address another way (a reply, a phone call) can say so,
 * rather than the flag being permanently meaningless.
 */
export async function confirmSubscriber(subscriberId: string): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = idSchema.safeParse(subscriberId);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };

  const supabase = await createOperatorClient();
  const { data, error } = await supabase
    .from("newsletter_subscribers")
    .update({ is_confirmed: true })
    .eq("id", parsed.data)
    .select("email")
    .maybeSingle();

  if (error) {
    console.error("[admin] subscriber confirm failed:", error);
    return { ok: false, message: refusalMessage(error, "Could not confirm that address.") };
  }
  if (!data) return { ok: false, message: "That subscriber no longer exists." };

  revalidateList();
  return { ok: true, message: `${data.email} marked confirmed.` };
}

/* ----------------------------------------------------------------- delete */

export async function deleteSubscriber(subscriberId: string): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = idSchema.safeParse(subscriberId);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };

  const supabase = await createOperatorClient();

  const { data: subscriber } = await supabase
    .from("newsletter_subscribers")
    .select("email")
    .eq("id", parsed.data)
    .maybeSingle();

  if (!subscriber) return { ok: false, message: "That subscriber no longer exists." };

  const { error } = await supabase
    .from("newsletter_subscribers")
    .delete()
    .eq("id", parsed.data);

  if (error) {
    console.error("[admin] subscriber delete failed:", error);
    return { ok: false, message: refusalMessage(error, "The database refused that delete.") };
  }

  revalidateList();
  return { ok: true, message: `${subscriber.email} deleted.` };
}

/* ----------------------------------------------------------------- export */

export interface ExportResult {
  ok: boolean;
  message: string;
  /** CSV text, ready to be turned into a download by the browser. */
  csv?: string;
  filename?: string;
}

/**
 * Export the live list as CSV.
 *
 * Returns the text rather than a file: a Server Action cannot set
 * `Content-Disposition`, so the browser builds the blob. That also keeps the
 * mailing list out of any URL, which a route handler would have put it in.
 *
 * Only subscribed addresses. Exporting people who unsubscribed is how an
 * unsubscribe gets undone by the next import, and it is the one mistake this
 * module exists to prevent.
 */
export async function exportSubscribers(): Promise<ExportResult> {
  const denied = await authorise();
  if (denied) return { ok: false, message: denied.message };

  const rows = await getSubscriberExport();

  if (rows.length === 0) {
    return { ok: false, message: "There is nobody on the list to export." };
  }

  /**
   * RFC 4180 quoting.
   *
   * An address cannot contain a comma, but `source` is a stored string and
   * spreadsheet software treats a leading `=`, `+`, `-` or `@` as a formula —
   * so a crafted value in a CSV is a real injection into whoever opens it. The
   * apostrophe prefix is the standard defusal.
   */
  const cell = (value: string) => {
    const risky = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
    return `"${risky.replace(/"/g, '""')}"`;
  };

  const csv = [
    ["email", "source", "subscribed_at"].join(","),
    ...rows.map((row) =>
      [cell(row.email), cell(row.source), cell(row.created_at)].join(",")
    ),
  ].join("\r\n");

  const stamp = new Date().toISOString().slice(0, 10);

  return {
    ok: true,
    message: `Exported ${rows.length} ${rows.length === 1 ? "address" : "addresses"}.`,
    csv,
    filename: `zylo-subscribers-${stamp}.csv`,
  };
}
