import type { MessageStatusDb, OrderStatusDb, UserRoleDb } from "@/lib/supabase/types";

/**
 * Status → badge tone.
 *
 * Kept as exhaustive records rather than an if-chain so that adding a value to
 * one of the database enums fails the build here, at the one place that has to
 * decide what colour it is, instead of silently rendering as neutral grey
 * wherever it happens to appear.
 *
 * Type-only imports, so this is safe in both Server and Client Components.
 */

export type Tone = "neutral" | "positive" | "warning" | "critical" | "accent";

export const ORDER_STATUS_TONE: Record<OrderStatusDb, Tone> = {
  pending: "warning",
  confirmed: "accent",
  "in-atelier": "accent",
  shipped: "positive",
  delivered: "positive",
  cancelled: "neutral",
  refunded: "critical",
};

/**
 * What an operator calls each status.
 *
 * The portal's words, not the customer's — `@/lib/order-status` has those, and
 * they differ deliberately. Staff read `in-atelier` as a workflow stage they
 * work in; a customer reads "Being prepared".
 */
export const ORDER_STATUS_LABEL: Record<OrderStatusDb, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  "in-atelier": "In atelier",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

/**
 * The forward path through fulfilment, in order.
 *
 * Anything not in here is a reversal, and a reversal needs an administrator —
 * see `ORDER_ELEVATED_STATUSES`. The row menu offers these as one click each
 * because advancing an order is the most common action on that screen and a
 * submenu would bury it.
 */
export const ORDER_ROUTINE_STATUSES: OrderStatusDb[] = [
  "pending",
  "confirmed",
  "in-atelier",
  "shipped",
  "delivered",
];

/**
 * Statuses that rewrite what already happened.
 *
 * Cancelling moves inventory and changes the customer's account page; marking
 * refunded asserts that money went back. Both need elevation, and the split is
 * declared here rather than inside the Server Action so the menu can grey out
 * what it is about to be refused for.
 *
 * `src/app/actions/admin/orders.ts` re-derives authority from this same list —
 * the client not offering an item is a courtesy, not the check.
 */
export const ORDER_ELEVATED_STATUSES: OrderStatusDb[] = ["cancelled", "refunded"];

export const ORDER_STATUSES: OrderStatusDb[] = [
  ...ORDER_ROUTINE_STATUSES,
  ...ORDER_ELEVATED_STATUSES,
];

export const MESSAGE_STATUS_TONE: Record<MessageStatusDb, Tone> = {
  new: "warning",
  "in-progress": "accent",
  resolved: "positive",
};

export const ROLE_TONE: Record<UserRoleDb, Tone> = {
  customer: "neutral",
  staff: "accent",
  admin: "warning",
  superadmin: "critical",
};

export const ROLE_LABEL: Record<UserRoleDb, string> = {
  customer: "Customer",
  staff: "Staff",
  admin: "Administrator",
  superadmin: "Super administrator",
};

/** What each role may actually do, stated in the interface rather than implied. */
export const ROLE_DESCRIPTION: Record<UserRoleDb, string> = {
  customer: "Shops the storefront. No portal access.",
  staff: "Reaches only the modules granted to them.",
  admin:
    "Reaches only the modules granted to them, and may delete and edit within those.",
  superadmin:
    "Every module, always. Grants and revokes access for everyone else.",
};

/* -------------------------------------------------------------- POS tender */

/**
 * Payment-method colours, matching the till's buttons.
 *
 * Solid brand tones rather than the semantic badge palette: these identify a
 * method, they do not rank one. A colour learnt while ringing up should mean
 * the same thing when reading the day's takings back.
 */
export const SALE_METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  mpesa: "M-Pesa",
  other: "Other",
};

export const SALE_METHOD_CLASS: Record<string, string> = {
  cash: "border-forest/30 bg-forest/10 text-forest",
  card: "border-midnight/30 bg-midnight/10 text-midnight",
  mpesa: "border-champagne/40 bg-champagne/15 text-champagne-dark",
  other: "border-wine/30 bg-wine/10 text-wine",
};

export const SALE_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * Cancelled is the only one that shouts.
 *
 * Completed is the overwhelming majority of rows, so it is deliberately quiet
 * — a wall of green ticks is noise, and what an operator scans this column for
 * is the exception.
 */
export const SALE_STATUS_CLASS: Record<string, string> = {
  pending: "border-champagne-dark/40 bg-champagne/10 text-champagne-dark",
  completed: "border-admin-line text-admin-muted",
  cancelled: "border-destructive/30 bg-destructive/10 text-destructive",
};
