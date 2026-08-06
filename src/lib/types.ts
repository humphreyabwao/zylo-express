/**
 * Domain model for the storefront.
 *
 * Every monetary value is an integer in the currency's minor unit (cents).
 * Field names mirror the Postgres schema so the Supabase layer can map rows
 * onto these types without a translation step.
 */

export type Currency = "USD" | "EUR" | "GBP";

export type OptionType = "color" | "size" | "material" | "text";

/**
 * A sourcing origin.
 *
 * ZYLO Express ships from many countries, so origin is merchandising
 * information a shopper filters and decides on — not a footnote. Every product
 * card surfaces it, which is why lead times live here rather than being
 * inferred from the shipping method at checkout.
 */
export interface Country {
  /** ISO 3166-1 alpha-2, uppercase. */
  code: string;
  name: string;
  /** Emoji flag — renders everywhere without an image request. */
  flag: string;
  leadTimeMinDays: number;
  leadTimeMaxDays: number;
}

export interface ProductImage {
  id: string;
  url: string;
  alt: string;
  width: number;
  height: number;
  position: number;
}

export interface ProductOptionValue {
  value: string;
  label: string;
  /** Swatch fill, present for `color` options. */
  hex?: string;
  available: boolean;
}

export interface ProductOption {
  id: string;
  name: string;
  type: OptionType;
  values: ProductOptionValue[];
}

export interface ProductVariant {
  id: string;
  sku: string;
  title: string;
  /** Keyed by option name, e.g. `{ Colour: "onyx", Size: "38" }`. */
  selectedOptions: Record<string, string>;
  price: number;
  compareAtPrice: number | null;
  inventoryQuantity: number;
  available: boolean;
  imageId: string | null;
}

export type ProductFlag =
  | "new"
  | "exclusive"
  | "limited"
  | "made-to-order"
  | "final-sale"
  | "archive";

export interface Product {
  id: string;
  slug: string;
  name: string;
  /** One-line merchandising hook shown under the name. */
  tagline: string;
  /** Short copy for cards and meta descriptions. */
  excerpt: string;
  /** Long-form copy for the product page. */
  description: string;
  /** Editorial paragraph — the maison's voice. */
  story: string;
  details: string[];
  care: string[];
  composition: string;
  /** Human-facing line, e.g. "Made in Florence, Italy". */
  origin: string;
  /** ISO 3166-1 alpha-2. What the origin filter and card badge key on. */
  originCountry: string;
  originCity: string | null;
  categorySlug: string;
  collectionSlugs: string[];
  /** Denormalised from the default variant for fast list rendering. */
  price: number;
  compareAtPrice: number | null;
  currency: Currency;
  images: ProductImage[];
  options: ProductOption[];
  variants: ProductVariant[];
  rating: number;
  reviewCount: number;
  flags: ProductFlag[];
  isFeatured: boolean;
  available: boolean;
  publishedAt: string;
}

export interface Category {
  slug: string;
  name: string;
  /** Nav grouping, e.g. "Women", "Men", "Maison". */
  group: string;
  description: string;
}

export interface Collection {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  image: ProductImage;
  /** Ordering weight for the collections grid. */
  position: number;
  isFeatured: boolean;
}

export interface EditorialArticle {
  slug: string;
  title: string;
  kicker: string;
  excerpt: string;
  body: string[];
  image: ProductImage;
  readingMinutes: number;
  publishedAt: string;
  author: string;
}

/* ------------------------------------------------------------------- cart */

export interface CartLine {
  /** Stable line key — `productId:variantId`, so repeats merge. */
  id: string;
  productId: string;
  variantId: string;
  slug: string;
  name: string;
  variantTitle: string;
  price: number;
  compareAtPrice: number | null;
  currency: Currency;
  quantity: number;
  image: Pick<ProductImage, "url" | "alt" | "width" | "height">;
  /** Snapshot so an out-of-stock line can still be shown and flagged. */
  maxQuantity: number;
  isGift: boolean;
  giftMessage?: string;
}

export interface CartTotals {
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  itemCount: number;
  currency: Currency;
}

export interface PromotionCode {
  code: string;
  label: string;
  kind: "percentage" | "fixed" | "free-shipping";
  value: number;
  minimumSubtotal: number;
}

/* ----------------------------------------------------------------- orders */

export interface Address {
  firstName: string;
  lastName: string;
  company?: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  phone: string;
}

export type ShippingSpeed = "standard" | "express" | "same-day";

export interface ShippingMethod {
  id: ShippingSpeed;
  name: string;
  description: string;
  price: number;
  estimate: string;
}

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "in-atelier"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

export interface Order {
  id: string;
  reference: string;
  status: OrderStatus;
  placedAt: string;
  lines: CartLine[];
  totals: CartTotals;
  shippingAddress: Address;
  shippingMethod: ShippingMethod;
  trackingUrl?: string;
}

/* ---------------------------------------------------------------- filters */

export type SortKey =
  | "featured"
  | "newest"
  | "price-asc"
  | "price-desc"
  | "name-asc";

export interface CatalogFilters {
  categories: string[];
  collections: string[];
  /** ISO 3166-1 alpha-2 codes. */
  countries: string[];
  colors: string[];
  sizes: string[];
  flags: ProductFlag[];
  minPrice?: number;
  maxPrice?: number;
  inStockOnly: boolean;
  query?: string;
  sort: SortKey;
}

export interface FacetCount {
  value: string;
  label: string;
  count: number;
  hex?: string;
}

export interface CountryFacetCount extends FacetCount {
  flag: string;
  leadTimeMinDays: number;
  leadTimeMaxDays: number;
}

export interface CatalogFacets {
  categories: FacetCount[];
  collections: FacetCount[];
  countries: CountryFacetCount[];
  colors: FacetCount[];
  sizes: FacetCount[];
  flags: FacetCount[];
  priceRange: { min: number; max: number };
}
