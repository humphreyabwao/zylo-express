import type { Address, Order } from "@/lib/types";
import { PRODUCTS, SHIPPING_METHODS } from "@/data/catalog";

/**
 * Demonstration account data. Replaced by Supabase queries against
 * `profiles`, `addresses` and `orders` once auth is wired.
 */

export const DEMO_CLIENT = {
  firstName: "Amara",
  lastName: "Okonkwo",
  email: "amara.okonkwo@example.com",
  memberSince: "2021-11-04",
  tier: "Private Client",
  advisor: { name: "Jonas Verbeek", boutique: "Paris — Rue Saint-Honoré" },
};

export const DEMO_ADDRESSES: (Address & { id: string; label: string; isDefault: boolean })[] =
  [
    {
      id: "addr-1",
      label: "Home",
      isDefault: true,
      firstName: "Amara",
      lastName: "Okonkwo",
      line1: "18 Rue de Rivoli",
      line2: "Apartment 4B",
      city: "Paris",
      region: "Île-de-France",
      postalCode: "75004",
      country: "FR",
      phone: "+33 1 42 60 30 30",
    },
    {
      id: "addr-2",
      label: "Studio",
      isDefault: false,
      firstName: "Amara",
      lastName: "Okonkwo",
      company: "Okonkwo Atelier",
      line1: "44 Mount Street",
      city: "London",
      region: "Greater London",
      postalCode: "W1K 2RX",
      country: "GB",
      phone: "+44 20 7629 1234",
    },
  ];

function lineFor(slug: string, quantity = 1) {
  const product = PRODUCTS.find((p) => p.slug === slug)!;
  const variant = product.variants[0];
  const image =
    product.images.find((i) => i.id === variant.imageId) ?? product.images[0];

  return {
    id: `${product.id}:${variant.id}`,
    productId: product.id,
    variantId: variant.id,
    slug: product.slug,
    name: product.name,
    variantTitle: variant.title,
    price: variant.price,
    compareAtPrice: variant.compareAtPrice,
    currency: product.currency,
    quantity,
    image: {
      url: image.url,
      alt: image.alt,
      width: image.width,
      height: image.height,
    },
    maxQuantity: 10,
    isGift: false,
  };
}

function totalsFor(lines: ReturnType<typeof lineFor>[], shipping: number) {
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
  const tax = Math.round(subtotal * 0.0825);
  return {
    subtotal,
    discount: 0,
    shipping,
    tax,
    total: subtotal + shipping + tax,
    itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
    currency: "USD" as const,
  };
}

const ORDER_1_LINES = [lineFor("aurelia-top-handle"), lineFor("atelier-candle", 2)];
const ORDER_2_LINES = [lineFor("meridian-chronograph")];
const ORDER_3_LINES = [
  lineFor("carre-silk-scarf"),
  lineFor("marceau-eau-de-parfum"),
];

export const DEMO_ORDERS: Order[] = [
  {
    id: "order-1",
    reference: "ZY-8K42QP",
    status: "in-atelier",
    placedAt: "2026-07-18T10:24:00.000Z",
    lines: ORDER_1_LINES,
    totals: totalsFor(ORDER_1_LINES, 0),
    shippingAddress: DEMO_ADDRESSES[0],
    shippingMethod: SHIPPING_METHODS[0],
  },
  {
    id: "order-2",
    reference: "ZY-6M19TR",
    status: "shipped",
    placedAt: "2026-05-02T15:11:00.000Z",
    lines: ORDER_2_LINES,
    totals: totalsFor(ORDER_2_LINES, 3500),
    shippingAddress: DEMO_ADDRESSES[1],
    shippingMethod: SHIPPING_METHODS[1],
    trackingUrl: "https://example.com/tracking/ZY-6M19TR",
  },
  {
    id: "order-3",
    reference: "ZY-3B77XD",
    status: "delivered",
    placedAt: "2025-12-11T09:02:00.000Z",
    lines: ORDER_3_LINES,
    totals: totalsFor(ORDER_3_LINES, 0),
    shippingAddress: DEMO_ADDRESSES[0],
    shippingMethod: SHIPPING_METHODS[0],
  },
];

export const ORDER_STATUS_COPY: Record<
  Order["status"],
  { label: string; description: string }
> = {
  pending: { label: "Pending", description: "Awaiting payment confirmation." },
  confirmed: { label: "Confirmed", description: "Payment received." },
  "in-atelier": {
    label: "In the atelier",
    description: "Being finished by hand. We will write when it ships.",
  },
  shipped: { label: "Shipped", description: "In transit, insured and tracked." },
  delivered: { label: "Delivered", description: "Signed for on arrival." },
  cancelled: { label: "Cancelled", description: "This order was cancelled." },
  refunded: { label: "Refunded", description: "Refunded to the original method." },
};
