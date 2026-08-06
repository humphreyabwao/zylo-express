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
};

export const ROLE_LABEL: Record<UserRoleDb, string> = {
  customer: "Customer",
  staff: "Staff",
  admin: "Administrator",
};

/** What each role may actually do, stated in the interface rather than implied. */
export const ROLE_DESCRIPTION: Record<UserRoleDb, string> = {
  customer: "Shops the storefront. No portal access.",
  staff: "Full portal access. Cannot change roles or remove staff.",
  admin: "Full portal access, including staff and role management.",
};
