import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { resolveSiteUrl } from "@/lib/site-url";
import { getEmailCredentials } from "@/lib/email/credentials";
import { ResendError, sendEmail } from "@/lib/email/resend";
import { renderTrackingEmail, type TrackingEmailEvent } from "@/lib/email/templates";
import type { OrderRow, OrderStatusDb } from "@/lib/supabase/types";

/**
 * Deciding when a customer hears from us, and making sure they hear once.
 *
 * ## The idempotency ledger
 *
 * Every path that sends is re-entrant. A webhook redelivers, an operator
 * double-clicks, a Server Action is retried by the framework, two till
 * terminals act on the same order. "Your order has shipped" arriving four times
 * is the kind of mistake a customer remembers about a shop.
 *
 * So the send is claimed before it is made: an insert into `email_deliveries`
 * with a unique `dedupe_key`. The insert *is* the lock — whoever wins sends, and
 * everyone else takes a duplicate-key error and stops. No advisory lock, no
 * read-then-write race, and the ledger doubles as the record of what went out.
 *
 * The key is derived from what makes the message distinct: order plus status for
 * a status change, order plus event id for a checkpoint. Re-marking an order
 * `shipped` after moving it back therefore does *not* re-send — which is the
 * right default, because the common cause of that sequence is an operator
 * correcting a misclick, not a parcel shipping twice.
 *
 * ## Why nothing here throws
 *
 * These run inside `setOrderStatus` and `addTrackingEvent`. A Resend outage, an
 * unverified domain or a missing key must not fail the operator's action —
 * marking an order shipped has to work whether or not the email does. Every
 * failure is recorded on the delivery row and returned, never raised.
 */

export type NotificationKind = "order_status" | "tracking_update";

export interface NotifyResult {
  /** True only when Resend accepted the message. */
  sent: boolean;
  /** Why not, when it did not. Safe to show an operator. */
  reason?: string;
  /** Set when a previous send already claimed this key. */
  duplicate?: boolean;
}

/**
 * Statuses worth an email.
 *
 * `pending` is where an order starts — the customer is looking at the
 * confirmation page, and a "your order is pending" email racing that page is
 * noise. `confirmed` follows payment by a second or two but is worth sending:
 * it is the receipt people search their inbox for later.
 */
const NOTIFIABLE: OrderStatusDb[] = [
  "confirmed",
  "in-atelier",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
];

export function isNotifiableStatus(status: OrderStatusDb): boolean {
  return NOTIFIABLE.includes(status);
}

/** The absolute link that goes in the email. */
export function trackingUrlFor(token: string): string {
  return `${resolveSiteUrl()}/track/${token}`;
}

/* ------------------------------------------------------------------ sending */

interface ClaimInput {
  kind: NotificationKind;
  orderId: string;
  eventId?: string | null;
  recipient: string;
  subject: string;
  dedupeKey: string;
}

/**
 * Take the ledger row, or discover somebody else already has.
 *
 * Returns the row id on success and null when this send is a duplicate. `23505`
 * is unique_violation — the expected outcome under a retry, not an error worth
 * logging at that level.
 */
async function claim(input: ClaimInput): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from("email_deliveries")
    .insert({
      kind: input.kind,
      order_id: input.orderId,
      event_id: input.eventId ?? null,
      recipient: input.recipient,
      subject: input.subject,
      status: "queued",
      dedupe_key: input.dedupeKey,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return null;
    // 42P01 means migration 24 is not applied. Anything else is a real fault,
    // but either way the safe move is not to send: an unclaimed send is an
    // unbounded one.
    console.warn(`[email] could not claim delivery: ${error.message}`);
    return null;
  }

  return data.id;
}

async function settle(
  id: string,
  patch: { status: "sent" | "failed"; provider_id?: string; error?: string }
): Promise<void> {
  const { error } = await createAdminClient()
    .from("email_deliveries")
    .update({
      ...patch,
      sent_at: patch.status === "sent" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (error) console.warn(`[email] could not settle delivery: ${error.message}`);
}

/* ------------------------------------------------------------- the payload */

/**
 * The recipient's first name, best effort.
 *
 * `orders.shipping_address` is jsonb written by checkout, so nothing here trusts
 * it to have a shape. A greeting is worth having and not worth an exception.
 */
function firstNameFrom(order: OrderRow): string | null {
  const address = order.shipping_address as Record<string, unknown> | null;
  const candidate = address?.firstName ?? address?.first_name ?? address?.name;

  if (typeof candidate !== "string") return null;
  const first = candidate.trim().split(/\s+/)[0];
  return first || null;
}

/** The public checkpoints, newest first — the reason they opened the email. */
async function recentEvents(orderId: string): Promise<TrackingEmailEvent[]> {
  const { data } = await createAdminClient()
    .from("order_tracking_events")
    .select("label, location, detail, occurred_at")
    .eq("order_id", orderId)
    .eq("is_public", true)
    .order("occurred_at", { ascending: false })
    // Enough to show the shape of the journey without pushing a long-running
    // cross-border order past Gmail's 102KB clipping threshold.
    .limit(6);

  return (data ?? []).map((row) => ({
    label: row.label,
    location: row.location,
    detail: row.detail,
    occurredAt: row.occurred_at,
  }));
}

/**
 * Send one tracking email about an order.
 *
 * `dedupeKey` is the caller's decision because only the caller knows what makes
 * this message distinct — see the note at the top of the file.
 */
async function notify(options: {
  kind: NotificationKind;
  order: OrderRow;
  dedupeKey: string;
  eventId?: string | null;
}): Promise<NotifyResult> {
  const { kind, order, dedupeKey } = options;

  const credentials = await getEmailCredentials();
  if (!credentials) {
    return { sent: false, reason: "Email is not configured." };
  }
  if (!credentials.enabled) {
    return { sent: false, reason: "Email notifications are switched off." };
  }
  if (kind === "order_status" && !credentials.notifyOnStatus) {
    return { sent: false, reason: "Status emails are switched off." };
  }
  if (kind === "tracking_update" && !credentials.notifyOnTracking) {
    return { sent: false, reason: "Tracking emails are switched off." };
  }

  const recipient = order.email?.trim();
  if (!recipient) {
    return { sent: false, reason: "That order has no email address." };
  }

  // Written by the migration-24 trigger, so in practice always present. An
  // order somehow missing one would produce a link to /track/undefined, which
  // is worse than no email.
  if (!order.tracking_token) {
    return { sent: false, reason: "That order has no tracking link yet." };
  }

  const events = await recentEvents(order.id);

  const { subject, html, text } = renderTrackingEmail({
    reference: order.reference,
    status: order.status,
    name: firstNameFrom(order),
    trackingUrl: trackingUrlFor(order.tracking_token),
    carrier: order.tracking_carrier,
    trackingNumber: order.tracking_number,
    carrierUrl: order.tracking_url,
    events,
    cancelReason: order.status === "cancelled" ? order.cancel_reason : null,
  });

  const deliveryId = await claim({
    kind,
    orderId: order.id,
    eventId: options.eventId,
    recipient,
    subject,
    dedupeKey,
  });

  if (!deliveryId) {
    return { sent: false, duplicate: true, reason: "Already sent." };
  }

  try {
    const { id } = await sendEmail({
      to: recipient,
      subject,
      html,
      text,
      idempotencyKey: dedupeKey,
    });

    await settle(deliveryId, { status: "sent", provider_id: id });
    return { sent: true };
  } catch (cause) {
    const reason =
      cause instanceof ResendError
        ? cause.message
        : cause instanceof Error
          ? cause.message
          : "Could not send that email.";

    await settle(deliveryId, { status: "failed", error: reason });
    console.warn(`[email] send failed for ${order.reference}: ${reason}`);

    return { sent: false, reason };
  }
}

/* -------------------------------------------------------------- public API */

/**
 * Tell the customer their order reached a new status.
 *
 * Keyed on order plus status, so correcting a misclick by moving an order back
 * and forward again does not send twice.
 */
export async function notifyOrderStatus(
  order: OrderRow
): Promise<NotifyResult> {
  if (!isNotifiableStatus(order.status)) {
    return { sent: false, reason: "That status does not warrant an email." };
  }

  return notify({
    kind: "order_status",
    order,
    dedupeKey: `status:${order.id}:${order.status}`,
  });
}

/**
 * Tell the customer about a checkpoint an operator recorded.
 *
 * Keyed on the event id, so every genuinely new checkpoint sends — two "Departed
 * Guangzhou" entries a week apart are two different facts — while a retry of the
 * same one does not.
 */
export async function notifyTrackingEvent(
  order: OrderRow,
  eventId: string
): Promise<NotifyResult> {
  return notify({
    kind: "tracking_update",
    order,
    eventId,
    dedupeKey: `event:${eventId}`,
  });
}
