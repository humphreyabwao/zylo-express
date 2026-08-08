"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  AdminAuthorizationError,
  createOperatorClient,
  requireAdminAction,
} from "@/lib/admin/guard";
import { CacheTags, invalidateTags } from "@/lib/cache";
import { describeError, refusalMessage } from "@/lib/admin/errors";
import { getOrderDetail, type OrderDetail } from "@/lib/admin/queries";
import { ORDER_ELEVATED_STATUSES } from "@/lib/admin/status";
import {
  notifyOrderStatus,
  notifyTrackingEvent,
} from "@/lib/email/notifications";
import { createAdminClient } from "@/lib/supabase/admin";
import type { OrderRow, OrderTrackingEventRow } from "@/lib/supabase/types";

/**
 * Order state changes.
 *
 * Every mutation here goes through an RPC rather than an update, for the same
 * reason `sales.ts` does: a status change can move stock, and doing that as two
 * statements from a Server Action leaves a cancelled order whose units never
 * came back the moment anything fails between them. See migration 23.
 *
 * ## Who may do what
 *
 * Advancing an order — confirmed, in-atelier, shipped, delivered — and recording
 * tracking are ordinary counter work, so they need the `orders` module and
 * nothing more. Cancelling, refunding and deleting need an administrator:
 * cancelling rewrites inventory and the customer's account page, refunding
 * asserts that money went back, and deletion is the one operation with no undo.
 *
 * The database re-checks `is_admin()` on top of all of this. The split here is
 * about which member of staff, not about whether the caller is staff at all.
 */

export interface OrderActionResult {
  ok: boolean;
  message: string;
  order?: OrderRow;
  /** Whether a customer email went out as part of this action. */
  emailed?: boolean;
  /**
   * Why it did not, when the action itself succeeded.
   *
   * Kept apart from `message` so a Resend outage shows as a warning beside a
   * green toast rather than making a completed status change look failed.
   */
  emailNote?: string;
}

async function authorise(
  elevated: boolean
): Promise<OrderActionResult | null> {
  try {
    await requireAdminAction({ elevated, module: "orders" });
    return null;
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

/**
 * Drop the caches an order change invalidates.
 *
 * `products` and `facets` because cancelling returns units to stock, which
 * changes availability everywhere the catalogue is rendered. `/account/orders`
 * because that is the customer's copy of what just changed — the realtime
 * channel wakes tabs that are already open, but a customer who navigates there
 * a second later must not be handed a cached page from before the change.
 */
function done(): void {
  void invalidateTags([CacheTags.products, CacheTags.facets]);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/customers");
  revalidatePath("/admin");
  revalidatePath("/account/orders");
  revalidatePath("/account");
}

/**
 * `insufficient_inventory:<uuid>` from `reserve_inventory`.
 *
 * Raised when reinstating an order whose units have since been sold. The raw
 * text names a variant id, which means nothing to an operator, so it is
 * translated rather than passed through.
 */
function readableRefusal(
  error: { code?: string; message?: string } | null,
  fallback: string
): string {
  if (error?.message?.includes("insufficient_inventory")) {
    return "Not enough stock to put this order back. Restock the items first, or leave it cancelled.";
  }
  return refusalMessage(error, error?.message || fallback);
}

/* ---------------------------------------------------------------- status */

const statusSchema = z.object({
  orderId: z.string().uuid("Unknown order."),
  status: z.enum([
    "pending",
    "confirmed",
    "in-atelier",
    "shipped",
    "delivered",
    "cancelled",
    "refunded",
  ]),
  reason: z
    .string()
    .trim()
    .max(240, "Keep the reason under 240 characters.")
    .optional(),
});

export async function setOrderStatus(input: unknown): Promise<OrderActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Unknown order.",
    };
  }

  // Parsed before authorising, uniquely in this file, because *which* status is
  // being set decides how much authority the call needs.
  const refusal = await authorise(
    ORDER_ELEVATED_STATUSES.includes(parsed.data.status)
  );
  if (refusal) return refusal;

  const supabase = await createOperatorClient();

  const { data, error } = await supabase.rpc("set_order_status", {
    p_order_id: parsed.data.orderId,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason ?? "",
  });

  if (error) {
    console.error("[admin] set order status failed:", describeError(error));
    return {
      ok: false,
      message: readableRefusal(error, "Could not change that order's status."),
    };
  }

  done();

  const order = data as unknown as OrderRow;

  // Awaited, not fired and forgotten. A serverless function is frozen the
  // instant its response is returned, so a floating promise here is a send that
  // usually never happens and fails invisibly when it does. The cost is the
  // round trip to Resend on the operator's click; the alternative is email that
  // works locally and silently does not in production.
  const mail = await notifyOrderStatus(order);

  const base =
    parsed.data.status === "cancelled"
      ? "Order cancelled and stock returned."
      : "Order updated. The customer sees this on their account.";

  return {
    ok: true,
    message: mail.sent ? `${base} Customer emailed.` : base,
    // Surfaced separately so a failed send is visible without turning a
    // successful status change into a red toast — the status *did* change.
    emailed: mail.sent,
    emailNote: mail.sent || mail.duplicate ? undefined : mail.reason,
    order,
  };
}

/** Cancelling is a status change with a reason, exposed under its own name. */
export async function cancelOrder(input: unknown): Promise<OrderActionResult> {
  const parsed = z
    .object({
      orderId: z.string().uuid("Unknown order."),
      reason: z.string().trim().max(240).optional(),
    })
    .safeParse(input);

  if (!parsed.success) return { ok: false, message: "Unknown order." };

  return setOrderStatus({
    orderId: parsed.data.orderId,
    status: "cancelled",
    reason: parsed.data.reason,
  });
}

/* -------------------------------------------------------------- tracking */

const trackingSchema = z.object({
  orderId: z.string().uuid("Unknown order."),
  carrier: z.string().trim().max(80, "Carrier name is too long.").optional(),
  number: z.string().trim().max(120, "Tracking number is too long.").optional(),
  url: z
    .string()
    .trim()
    .max(2000, "That link is too long.")
    .optional()
    // Empty clears the field, so it has to survive the URL check.
    .refine(
      (value) => !value || /^https?:\/\//i.test(value),
      "The tracking link must start with http:// or https://."
    ),
});

/**
 * Record how the parcel can be followed.
 *
 * The URL is validated as http(s) rather than accepted as free text because the
 * storefront renders it as a link the customer clicks. A `javascript:` URL in
 * that column would be stored XSS with an operator as the vector — Next's Link
 * does not sanitise the href for you.
 */
export async function setOrderTracking(
  input: unknown
): Promise<OrderActionResult> {
  const refusal = await authorise(false);
  if (refusal) return refusal;

  const parsed = trackingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check those details.",
    };
  }

  const supabase = await createOperatorClient();

  const { data, error } = await supabase.rpc("set_order_tracking", {
    p_order_id: parsed.data.orderId,
    p_carrier: parsed.data.carrier ?? null,
    p_number: parsed.data.number ?? null,
    p_url: parsed.data.url ?? null,
  });

  if (error) {
    console.error("[admin] set order tracking failed:", describeError(error));
    return {
      ok: false,
      message: refusalMessage(error, "Could not save those tracking details."),
    };
  }

  done();
  return {
    ok: true,
    message: parsed.data.number || parsed.data.url
      ? "Tracking saved. It is on the customer's account now."
      : "Tracking cleared.",
    order: data as unknown as OrderRow,
  };
}

/* ---------------------------------------------------------------- delete */

export async function deleteOrder(input: unknown): Promise<OrderActionResult> {
  const refusal = await authorise(true);
  if (refusal) return refusal;

  const parsed = z
    .object({ orderId: z.string().uuid("Unknown order.") })
    .safeParse(input);

  if (!parsed.success) return { ok: false, message: "Unknown order." };

  const supabase = await createOperatorClient();

  const { error } = await supabase.rpc("delete_order", {
    p_order_id: parsed.data.orderId,
  });

  if (error) {
    console.error("[admin] delete order failed:", describeError(error));
    return {
      ok: false,
      // The settled-payment refusal is raised with a sentence written for an
      // operator, so it is shown rather than replaced.
      message: refusalMessage(error, error.message || "Could not delete that order."),
    };
  }

  done();
  return { ok: true, message: "Order deleted." };
}

/* -------------------------------------------------------------- checkpoint */

const checkpointSchema = z.object({
  orderId: z.string().uuid("Unknown order."),
  label: z
    .string()
    .trim()
    .min(1, "Say what happened.")
    .max(120, "Keep the description under 120 characters."),
  location: z.string().trim().max(120, "That location is too long.").optional(),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Use a two-letter country code.")
    .optional()
    .or(z.literal("")),
  detail: z.string().trim().max(400, "Keep the note under 400 characters.").optional(),
  /** Optional: a checkpoint may advance the order in the same action. */
  status: z
    .enum([
      "pending",
      "confirmed",
      "in-atelier",
      "shipped",
      "delivered",
      "cancelled",
      "refunded",
    ])
    .optional(),
  /** ISO. Defaults to now — a scan at 03:00 typed in at 09:00 belongs at 03:00. */
  occurredAt: z.string().trim().optional(),
  isPublic: z.boolean().default(true),
  /** Whether to email the customer about this checkpoint. */
  notify: z.boolean().default(true),
});

export interface CheckpointResult extends OrderActionResult {
  event?: OrderTrackingEventRow;
}

/**
 * Record where the parcel has got to.
 *
 * Elevation is *not* required: telling a customer their order left the warehouse
 * is counter work, the same as marking it shipped. The one case that needs more
 * authority is a checkpoint that also moves the status to `cancelled` or
 * `refunded`, and `set_order_status` — which `add_tracking_event` calls
 * internally — is not what enforces that, so it is checked here.
 */
export async function addTrackingEvent(input: unknown): Promise<CheckpointResult> {
  const parsed = checkpointSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check those details.",
    };
  }

  const values = parsed.data;

  const refusal = await authorise(
    values.status ? ORDER_ELEVATED_STATUSES.includes(values.status) : false
  );
  if (refusal) return refusal;

  const supabase = await createOperatorClient();

  const { data, error } = await supabase.rpc("add_tracking_event", {
    p_order_id: values.orderId,
    p_label: values.label,
    p_location: values.location || null,
    p_country_code: values.countryCode || null,
    p_detail: values.detail || null,
    p_status: values.status ?? null,
    p_occurred_at: values.occurredAt || null,
    p_is_public: values.isPublic,
  });

  if (error) {
    console.error("[admin] add tracking event failed:", describeError(error));
    return {
      ok: false,
      message: readableRefusal(error, "Could not record that checkpoint."),
    };
  }

  done();

  const event = data as unknown as OrderTrackingEventRow;

  /*
   * An internal note is never emailed, whatever the operator ticked. The whole
   * point of `is_public = false` is that it is a message to the next member of
   * staff, and "supplier says two more days, do not promise" reaching the
   * customer is the exact failure the flag exists to prevent.
   */
  if (!values.notify || !values.isPublic) {
    return {
      ok: true,
      message: values.isPublic
        ? "Checkpoint added."
        : "Internal note added. The customer will not see it.",
      event,
    };
  }

  // The row as it now stands — the RPC may have moved the status, and the email
  // has to describe the order rather than the order as it was.
  const { data: order } = await createAdminClient()
    .from("orders")
    .select("*")
    .eq("id", values.orderId)
    .maybeSingle();

  if (!order) {
    return { ok: true, message: "Checkpoint added.", event };
  }

  const mail = await notifyTrackingEvent(order as OrderRow, event.id);

  return {
    ok: true,
    message: mail.sent
      ? "Checkpoint added and the customer emailed."
      : "Checkpoint added.",
    emailed: mail.sent,
    emailNote: mail.sent || mail.duplicate ? undefined : mail.reason,
    event,
  };
}

/* ------------------------------------------------------------------ read */

/**
 * One order in full, fetched when the view drawer opens.
 *
 * Kept out of the list query on purpose — a page of twenty orders carries every
 * line and every payment attempt, and almost none are ever opened.
 */
export async function getOrder(orderId: string): Promise<OrderDetail | null> {
  try {
    await requireAdminAction({ module: "orders" });
  } catch (error) {
    if (error instanceof AdminAuthorizationError) return null;
    throw error;
  }

  return getOrderDetail(orderId);
}
