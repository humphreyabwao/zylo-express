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
import type { OrderRow } from "@/lib/supabase/types";

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
  return {
    ok: true,
    message:
      parsed.data.status === "cancelled"
        ? "Order cancelled and stock returned."
        : "Order updated. The customer sees this on their account.",
    order: data as unknown as OrderRow,
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
