import "server-only";

import type { User } from "@supabase/supabase-js";

import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { getCountry } from "@/lib/countries";
import type { Country } from "@/lib/types";
import type { AddressRow, OrderItemRow, OrderRow, UserRoleDb } from "@/lib/supabase/types";

/**
 * The signed-in customer's data.
 *
 * Server-only, and every read runs through the cookie-bound client so Row
 * Level Security applies — a bug here returns nothing rather than someone
 * else's orders.
 *
 * Each function degrades rather than throws. The `profiles` table only exists
 * once the migrations are applied, but Supabase Auth works without them, so
 * the profile falls back to the metadata stored on `auth.users`. That is what
 * lets a customer sign in and see their account before the schema is live.
 */

export interface AccountProfile {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: UserRoleDb;
  marketingOptIn: boolean;
  memberSince: string;
  /** Display name, or the email local-part when no name is set. */
  displayName: string;
  initials: string;
  /**
   * False when this came from `auth.users` metadata because the `profiles`
   * table was unavailable. The settings page surfaces this rather than
   * pretending the data round-tripped.
   */
  persisted: boolean;
}

export interface AccountAddress {
  id: string;
  label: string | null;
  firstName: string;
  lastName: string;
  company: string | null;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  phone: string;
  isDefault: boolean;
}

export interface AccountOrderLine {
  id: string;
  productSlug: string;
  productName: string;
  variantTitle: string;
  imageUrl: string | null;
  originCountry: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface AccountOrder {
  id: string;
  reference: string;
  status: OrderRow["status"];
  placedAt: string;
  total: number;
  currency: OrderRow["currency"];
  shippingMethod: OrderRow["shipping_method"];
  trackingUrl: string | null;
  /** Who is carrying it, and under what number. Set from the portal. */
  trackingCarrier: string | null;
  trackingNumber: string | null;
  /** Populated when an operator cancels; the reason is written for the customer. */
  cancelledAt: string | null;
  cancelReason: string | null;
  lines: AccountOrderLine[];
  /** Distinct origins across the order — what a ZYLO Express parcel splits by. */
  origins: Country[];
  itemCount: number;
}

/* --------------------------------------------------------------- helpers */

/**
 * Best available name from auth metadata, whichever way the customer signed up.
 *
 * Our own form writes `first_name`/`last_name`; Google writes `given_name`/
 * `family_name` and a pre-joined `full_name`. This mirrors the
 * `names_from_metadata` function the profile trigger uses, so the fallback
 * path below and the persisted row agree on the same name.
 */
function nameFrom(user: User): { first: string | null; last: string | null } {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const str = (key: string) => {
    const value = meta[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };

  const first = str("first_name") ?? str("given_name");
  const last = str("last_name") ?? str("family_name");
  if (first || last) return { first, last };

  const display = str("full_name") ?? str("name");
  if (!display) return { first: null, last: null };

  const gap = display.indexOf(" ");
  return gap === -1
    ? { first: display, last: null }
    : { first: display.slice(0, gap), last: display.slice(gap + 1).trim() || null };
}

function buildDisplay(
  email: string,
  first: string | null,
  last: string | null
): { displayName: string; initials: string } {
  const full = [first, last].filter(Boolean).join(" ").trim();

  if (full) {
    const initials = [first, last]
      .filter(Boolean)
      .map((part) => part![0]!.toUpperCase())
      .join("");
    return { displayName: full, initials };
  }

  // No name on file — the email local-part is friendlier than a blank header.
  const local = email.split("@")[0] ?? "there";
  return { displayName: local, initials: local.slice(0, 2).toUpperCase() };
}

/* --------------------------------------------------------------- profile */

export async function getAccountProfile(): Promise<AccountProfile | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const email = user.email ?? "";
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!error && data) {
    const { displayName, initials } = buildDisplay(
      data.email || email,
      data.first_name,
      data.last_name
    );
    return {
      id: data.id,
      email: data.email || email,
      firstName: data.first_name,
      lastName: data.last_name,
      phone: data.phone,
      role: data.role,
      marketingOptIn: data.marketing_opt_in,
      memberSince: data.created_at,
      displayName,
      initials,
      persisted: true,
    };
  }

  // No profiles table (or no row yet) — derive from the auth user so the
  // account is still usable. Not an error worth surfacing to the customer.
  if (error) {
    console.warn(
      "[account] profiles unavailable, using auth metadata:",
      error.message
    );
  }

  const { first, last } = nameFrom(user);
  const { displayName, initials } = buildDisplay(email, first, last);

  return {
    id: user.id,
    email,
    firstName: first,
    lastName: last,
    phone: user.phone || null,
    role: "customer",
    marketingOptIn: Boolean(user.user_metadata?.marketing_opt_in),
    memberSince: user.created_at,
    displayName,
    initials,
    persisted: false,
  };
}

/* ------------------------------------------------------------- addresses */

function mapAddress(row: AddressRow): AccountAddress {
  return {
    id: row.id,
    label: row.label,
    firstName: row.first_name,
    lastName: row.last_name,
    company: row.company,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    region: row.region,
    postalCode: row.postal_code,
    country: row.country,
    phone: row.phone,
    isDefault: row.is_default,
  };
}

export async function getAccountAddresses(): Promise<AccountAddress[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("addresses")
    .select("*")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("[account] addresses unavailable:", error.message);
    return [];
  }
  return data.map(mapAddress);
}

/* ---------------------------------------------------------------- orders */

type OrderJoin = OrderRow & { order_items: OrderItemRow[] };

function mapOrder(row: OrderJoin): AccountOrder {
  const items = row.order_items ?? [];

  const origins: Country[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const code = item.origin_country_code;
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const country = getCountry(code);
    if (country) origins.push(country);
  }

  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    placedAt: row.placed_at,
    total: row.total,
    currency: row.currency,
    shippingMethod: row.shipping_method,
    trackingUrl: row.tracking_url,
    // `?? null` rather than a bare read: these columns arrived in migration 23,
    // and the catalogue falls back to seed data on an un-migrated database, so
    // a row without them must render as "no tracking" rather than `undefined`.
    trackingCarrier: row.tracking_carrier ?? null,
    trackingNumber: row.tracking_number ?? null,
    cancelledAt: row.cancelled_at ?? null,
    cancelReason: row.cancel_reason ?? null,
    origins,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    lines: items.map((item) => ({
      id: item.id,
      productSlug: item.product_slug,
      productName: item.product_name,
      variantTitle: item.variant_title,
      imageUrl: item.image_url,
      originCountry: item.origin_country_code,
      unitPrice: item.unit_price,
      quantity: item.quantity,
      lineTotal: item.line_total,
    })),
  };
}

export async function getAccountOrders(limit = 20): Promise<AccountOrder[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .order("placed_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[account] orders unavailable:", error.message);
    return [];
  }
  return (data as unknown as OrderJoin[]).map(mapOrder);
}

/**
 * Reference and status for the customer's orders, and nothing else.
 *
 * Seeds the realtime listener in the account shell so it can tell a status
 * change from a change that merely touched the row — adding a tracking number
 * updates `orders` too, and announcing "your order is Confirmed" because an
 * operator typed a courier reference would be wrong every time.
 *
 * Deliberately not `getAccountOrders`: this runs on every page in the account
 * area, and pulling every line and image to compare seven-character strings
 * would be an expensive way to do nothing.
 */
export interface OrderStatusSeed {
  id: string;
  reference: string;
  status: OrderRow["status"];
}

export async function getAccountOrderStatuses(
  limit = 50
): Promise<OrderStatusSeed[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("orders")
    .select("id, reference, status")
    .order("placed_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[account] order statuses unavailable:", error.message);
    return [];
  }
  return data as OrderStatusSeed[];
}

/** Orders still on their way — the panel a cross-border shopper opens for. */
export function selectInTransit(orders: AccountOrder[]): AccountOrder[] {
  return orders.filter(
    (order) =>
      order.status === "confirmed" ||
      order.status === "in-atelier" ||
      order.status === "shipped"
  );
}

export function selectLifetimeValue(orders: AccountOrder[]): number {
  return orders
    .filter((order) => order.status !== "cancelled" && order.status !== "refunded")
    .reduce((sum, order) => sum + order.total, 0);
}

/* -------------------------------------------------------------- wishlist */

/** Product ids the customer has saved, newest first. */
export async function getWishlistProductIds(): Promise<string[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("wishlist_items")
    .select("product_id")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[account] wishlist unavailable:", error.message);
    return [];
  }
  return data.map((row) => row.product_id);
}

/* ------------------------------------------------------- display helpers */

/**
 * Re-exported rather than defined here.
 *
 * They moved to `@/lib/order-status`, which imports nothing but types, when the
 * account page grew a realtime listener: a Client Component cannot import from
 * this module at all — it is `server-only` — and two copies of the same seven
 * labels would drift the first time one of them was reworded.
 */
export {
  ORDER_STATUS,
  ORDER_STATUS_NEWS,
  SHIPPING_LABEL,
  type OrderTone,
} from "@/lib/order-status";
