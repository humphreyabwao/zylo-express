import type { PromotionCode, ShippingMethod } from "@/lib/types";

/**
 * Checkout configuration.
 *
 * Split out of `@/data/catalog` deliberately. The cart store and its
 * components are Client Components and need these constants; when they lived
 * alongside `PRODUCTS`, importing one shipping rate dragged the entire seed
 * catalogue — every description, story and variant — into the browser bundle.
 * A bundler cannot tree-shake `PRODUCTS` away because it is built by a
 * module-level `SEEDS.map(...)` call it must preserve.
 *
 * Keep this module free of anything that touches the product catalogue.
 *
 * These values move to the `site_settings` and `promotions` tables when the
 * admin dashboard lands; the shapes already match those rows.
 */

export const SHIPPING_METHODS: ShippingMethod[] = [
  {
    id: "standard",
    name: "Complimentary Delivery",
    description: "Signature required on arrival.",
    price: 0,
    estimate: "3–5 business days",
  },
  {
    id: "express",
    name: "Express",
    description: "Priority handling, insured in transit.",
    price: 3500,
    estimate: "1–2 business days",
  },
  {
    id: "same-day",
    name: "Same-Day Courier",
    description: "Selected metropolitan areas. Ordered before 12:00.",
    price: 9500,
    estimate: "Today, before 20:00",
  },
];

/**
 * Promotion codes the client preview can evaluate.
 *
 * Order totals are recomputed server-side at checkout against the `promotions`
 * table — this list only drives the optimistic preview in the cart, so a
 * tampered client can mis-display a discount but cannot be charged one.
 */
export const PROMOTIONS: PromotionCode[] = [
  {
    code: "MAISON10",
    label: "10% — Maison welcome",
    kind: "percentage",
    value: 10,
    minimumSubtotal: 0,
  },
  {
    code: "ATELIER250",
    label: "$250 off orders over $2,500",
    kind: "fixed",
    value: 25000,
    minimumSubtotal: 250000,
  },
  {
    code: "PRIVATE",
    label: "Complimentary express delivery",
    kind: "free-shipping",
    value: 0,
    minimumSubtotal: 0,
  },
];

/** Orders above this threshold ship free on the standard service. */
export const FREE_SHIPPING_THRESHOLD = 50000;

/** Flat rate applied at checkout; a real tax engine replaces this later. */
export const TAX_RATE = 0.0825;
