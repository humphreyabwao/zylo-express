/**
 * Database types.
 *
 * Hand-maintained to match supabase/migrations/. Regenerate with:
 *   npx supabase gen types typescript --project-id gwddqngawlooldswsxey > src/lib/supabase/types.ts
 *
 * Type-only — safe to import anywhere, including Client Components.
 */

export type ProductFlagDb =
  | "new"
  | "exclusive"
  | "limited"
  | "made-to-order"
  | "final-sale"
  | "archive";

export type CurrencyDb = "USD" | "EUR" | "GBP";
export type OptionTypeDb = "color" | "size" | "material" | "text";
export type UserRoleDb = "customer" | "staff" | "admin";
export type ShippingSpeedDb = "standard" | "express" | "same-day";
export type PromotionKindDb = "percentage" | "fixed" | "free-shipping";
export type MessageStatusDb = "new" | "in-progress" | "resolved";

export type OrderStatusDb =
  | "pending"
  | "confirmed"
  | "in-atelier"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

export type PaymentProviderDb = "paystack" | "paypal";
export type PaymentMethodDb = "card" | "mpesa" | "paypal";
export type PaymentStatusDb =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "abandoned"
  | "refunded";

export type CountryRow = {
  code: string;
  name: string;
  flag_emoji: string;
  lead_time_min_days: number;
  lead_time_max_days: number;
  is_active: boolean;
  position: number;
}

export type CategoryRow = {
  id: string;
  slug: string;
  name: string;
  group: string;
  description: string;
  position: number;
  is_active: boolean;
}

export type CollectionRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  image_url: string | null;
  image_alt: string;
  image_width: number;
  image_height: number;
  position: number;
  is_featured: boolean;
  is_active: boolean;
}

export type ProductRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  excerpt: string;
  description: string;
  story: string;
  details: string[];
  care: string[];
  composition: string;
  origin_label: string;
  origin_country_code: string | null;
  origin_city: string | null;
  category_id: string | null;
  category_slug: string | null;
  price: number;
  compare_at_price: number | null;
  currency: CurrencyDb;
  rating: number;
  review_count: number;
  flags: ProductFlagDb[];
  is_featured: boolean;
  available: boolean;
  is_active: boolean;
  published_at: string;
}

export type ProductImageRow = {
  id: string;
  product_id: string;
  storage_path: string;
  alt: string;
  width: number;
  height: number;
  position: number;
}

export type ProductOptionRow = {
  id: string;
  product_id: string;
  name: string;
  type: OptionTypeDb;
  position: number;
}

export type ProductOptionValueRow = {
  id: string;
  option_id: string;
  value: string;
  label: string;
  hex: string | null;
  available: boolean;
  position: number;
}

export type ProductVariantRow = {
  id: string;
  product_id: string;
  sku: string;
  title: string;
  selected_options: Record<string, string>;
  price: number;
  compare_at_price: number | null;
  inventory_quantity: number;
  available: boolean;
  image_id: string | null;
}

export type ProfileRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  role: UserRoleDb;
  marketing_opt_in: boolean;
  created_at: string;
}

export type AddressRow = {
  id: string;
  user_id: string;
  label: string | null;
  first_name: string;
  last_name: string;
  company: string | null;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  phone: string;
  is_default: boolean;
}

export type OrderRow = {
  id: string;
  reference: string;
  user_id: string | null;
  email: string;
  status: OrderStatusDb;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  currency: CurrencyDb;
  promotion_code: string | null;
  shipping_address: Record<string, unknown>;
  billing_address: Record<string, unknown> | null;
  shipping_method: ShippingSpeedDb;
  tracking_url: string | null;
  /** Free text kept with the order — the checkout writes the gift message here. */
  notes: string | null;
  placed_at: string;
}

export type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  product_slug: string;
  product_name: string;
  variant_title: string;
  sku: string;
  image_url: string | null;
  origin_country_code: string | null;
  unit_price: number;
  quantity: number;
  line_total: number;
}

export type PaymentRow = {
  id: string;
  order_id: string;
  provider: PaymentProviderDb;
  method: PaymentMethodDb;
  status: PaymentStatusDb;
  /** Our idempotency key, sent to the provider as their `reference`. */
  reference: string;
  provider_reference: string | null;
  /** Store books: minor units of `currency`, equal to the order total. */
  amount: number;
  currency: CurrencyDb;
  /** Presentment: what the provider was actually asked to move. */
  charge_amount: number;
  charge_currency: string;
  exchange_rate: number;
  authorization_url: string | null;
  phone: string | null;
  failure_reason: string | null;
  paid_at: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export type PaymentEventRow = {
  id: string;
  provider: PaymentProviderDb;
  event_id: string;
  event_type: string;
  payment_id: string | null;
  payload: Record<string, unknown>;
  received_at: string;
}

export type ArticleRow = {
  id: string;
  slug: string;
  title: string;
  kicker: string;
  excerpt: string;
  body: string[];
  image_url: string | null;
  image_alt: string;
  image_width: number;
  image_height: number;
  reading_minutes: number;
  author: string;
  is_published: boolean;
  published_at: string;
}

export type PromotionRow = {
  id: string;
  code: string;
  label: string;
  kind: PromotionKindDb;
  value: number;
  minimum_subtotal: number;
  usage_limit: number | null;
  usage_count: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
}

export type SiteSettingRow = {
  key: string;
  value: unknown;
  description: string | null;
}

/** Shape returned by the `inventory_summary` RPC. */
export type InventorySummaryRpcResult = {
  variant_count: number;
  unit_count: number;
  out_of_stock: number;
  low_stock: number;
  /** Stock at asking price, in minor units. Not cost — the schema has none. */
  retail_value: number;
  /** Out-of-stock variants belonging to published products only. */
  live_out_of_stock: number;
};

/** Shape returned by the `catalog_facets` RPC. */
export type FacetsRpcResult = {
  categories: { value: string; label: string; count: number }[];
  countries: {
    value: string;
    label: string;
    flag: string;
    lead_min: number;
    lead_max: number;
    count: number;
  }[];
  collections: { value: string; label: string; count: number }[];
  colors: { value: string; label: string; hex: string | null; count: number }[];
  sizes: { value: string; label: string; count: number }[];
  flags: { value: ProductFlagDb; count: number }[];
  priceRange: { min: number; max: number };
}

/**
 * `Relationships` is required by postgrest's `GenericTable` constraint. Left
 * empty because we spell joins out in the select strings rather than relying
 * on inferred relationship types — but it must be present, or `Database`
 * silently fails the constraint and every query degrades to `never`.
 */
type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      countries: Table<CountryRow>;
      categories: Table<CategoryRow>;
      collections: Table<CollectionRow>;
      products: Table<ProductRow>;
      product_images: Table<ProductImageRow>;
      product_options: Table<ProductOptionRow>;
      product_option_values: Table<ProductOptionValueRow>;
      product_variants: Table<ProductVariantRow>;
      product_collections: Table<{
        product_id: string;
        collection_id: string;
        position: number;
      }>;
      profiles: Table<ProfileRow>;
      addresses: Table<AddressRow>;
      orders: Table<OrderRow>;
      order_items: Table<OrderItemRow>;
      payments: Table<PaymentRow>;
      payment_events: Table<PaymentEventRow>;
      wishlist_items: Table<{
        user_id: string;
        product_id: string;
        created_at: string;
      }>;
      promotions: Table<PromotionRow>;
      articles: Table<ArticleRow>;
      site_settings: Table<SiteSettingRow>;
      newsletter_subscribers: Table<{
        id: string;
        email: string;
        source: string;
        is_confirmed: boolean;
      }>;
      contact_messages: Table<{
        id: string;
        name: string;
        email: string;
        subject: string;
        message: string;
        order_reference: string | null;
        status: MessageStatusDb;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      search_products: {
        Args: { p_query: string; p_limit?: number };
        Returns: ProductRow[];
      };
      catalog_facets: {
        Args: { p_category_slug?: string | null; p_collection_slug?: string | null };
        Returns: FacetsRpcResult;
      };
      reserve_inventory: {
        Args: { p_lines: { variant_id: string; quantity: number }[] };
        Returns: boolean;
      };
      release_inventory: {
        Args: { p_lines: { variant_id: string; quantity: number }[] };
        Returns: undefined;
      };
      adjust_variant_stock: {
        Args: { p_variant_id: string; p_delta: number };
        /** The resulting quantity, clamped at zero. */
        Returns: number;
      };
      inventory_summary: {
        Args: { p_low_threshold?: number };
        Returns: InventorySummaryRpcResult;
      };
      settle_payment: {
        Args: {
          p_reference: string;
          p_provider_reference: string | null;
          p_charge_amount: number | null;
        };
        /** False when the payment was already settled — a duplicate webhook. */
        Returns: boolean;
      };
      fail_payment: {
        Args: {
          p_reference: string;
          p_reason: string | null;
          p_status?: PaymentStatusDb;
        };
        Returns: boolean;
      };
      expire_pending_payments: {
        Args: Record<string, never>;
        Returns: number;
      };
      increment_promotion_usage: { Args: { p_code: string }; Returns: undefined };
      generate_order_reference: { Args: Record<string, never>; Returns: string };
      is_admin: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: {
      product_flag: ProductFlagDb;
      currency_code: CurrencyDb;
      option_type: OptionTypeDb;
      user_role: UserRoleDb;
      order_status: OrderStatusDb;
      shipping_speed: ShippingSpeedDb;
      promotion_kind: PromotionKindDb;
      message_status: MessageStatusDb;
    };
    CompositeTypes: Record<string, never>;
  };
}
