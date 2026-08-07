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
