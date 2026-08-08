import type { OrderStatusDb, ShippingSpeedDb } from "@/lib/supabase/types";

/**
 * Customer-facing order vocabulary.
 *
 * Pure and type-only in its imports, so a Client Component may read it — which
 * is the reason it is not in `account.ts`. That module is `server-only`, and the
 * account page's realtime listener needs to name the status a parcel has just
 * moved to without dragging the Supabase client into the browser bundle.
 *
 * The words differ from the database enum on purpose. `in-atelier` is a term
 * from the shop's own workflow, `pending` alone does not say what is pending,
 * and `shipped` is less use to somebody waiting than "In transit". The portal
 * shows the raw status; this is what a customer reads.
 */

export type OrderTone = "neutral" | "active" | "good" | "warn";

export const ORDER_STATUS: Record<
  OrderStatusDb,
  { label: string; tone: OrderTone }
> = {
  pending: { label: "Payment pending", tone: "warn" },
  confirmed: { label: "Confirmed", tone: "active" },
  "in-atelier": { label: "Being prepared", tone: "active" },
  shipped: { label: "In transit", tone: "active" },
  delivered: { label: "Delivered", tone: "good" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  refunded: { label: "Refunded", tone: "neutral" },
};

export const SHIPPING_LABEL: Record<ShippingSpeedDb, string> = {
  standard: "Standard delivery",
  express: "Express",
  "same-day": "Same-day courier",
};

/**
 * What to tell a customer when an order reaches a status while they are
 * watching. Only the transitions worth interrupting somebody for.
 *
 * `pending` is absent because it is where an order starts — announcing it would
 * fire on the customer's own checkout. `confirmed` is absent for the same
 * reason: it follows payment by a second or two, on a page that already says so.
 */
export const ORDER_STATUS_NEWS: Partial<Record<OrderStatusDb, string>> = {
  "in-atelier": "is being prepared",
  shipped: "is on its way",
  delivered: "has been delivered",
  cancelled: "has been cancelled",
  refunded: "has been refunded",
};
