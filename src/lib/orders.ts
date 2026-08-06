import "server-only";

import {
  FREE_SHIPPING_THRESHOLD,
  SHIPPING_METHODS,
  TAX_RATE,
} from "@/data/commerce";
import { isSupabaseConfigured } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { storageUrl } from "@/lib/storage";
import type { Address, CartTotals, ShippingSpeed } from "@/lib/types";
import type { OrderItemRow, OrderRow } from "@/lib/supabase/types";

/**
 * Order creation.
 *
 * This is the only place an order row is written, and it is the pricing
 * authority for the whole application. The browser sends variant ids and
 * quantities; it does not send prices, and any it did send would be ignored.
 * A checkout that trusts a browser-supplied total is a checkout that can be
 * bought from for a penny.
 *
 * Orders are written `pending` and hold their stock. Only a verified provider
 * confirmation promotes one to `confirmed` — see `settle_payment` in
 * migration 7. The window between the two is what `expire_pending_payments`
 * cleans up.
 *
 * The rate constants come from `@/data/commerce`, the same module the cart's
 * client-side preview reads. Promotions are re-read from Postgres instead,
 * because a code's usage limit and validity window are state, not config, and
 * the seed list in that module is only there to drive the optimistic preview.
 */

const MAX_LINES = 50;
const MAX_QUANTITY_PER_LINE = 20;

export interface OrderLineInput {
  variantId: string;
  quantity: number;
}

export interface CreateOrderInput {
  email: string;
  lines: OrderLineInput[];
  shippingAddress: Address;
  billingAddress?: Address | null;
  shippingMethod: ShippingSpeed;
  promotionCode?: string | null;
  giftMessage?: string | null;
  /** From the verified session, never from the payload. */
  userId?: string | null;
}

export interface CreatedOrder {
  id: string;
  reference: string;
  totals: CartTotals;
  /** Kept so a failed payment can hand the exact quantities back. */
  reservedLines: { variantId: string; quantity: number }[];
}

/**
 * A failure the customer should see verbatim.
 *
 * Distinct from an unexpected throw: "the last one sold while you were
 * checking out" is information, whereas a Postgres error is not something to
 * put in front of a shopper.
 */
export class OrderError extends Error {
  constructor(
    message: string,
    readonly code:
      | "unavailable"
      | "sold-out"
      | "invalid"
      | "not-configured"
      | "failed"
  ) {
    super(message);
    this.name = "OrderError";
  }
}

type VariantJoin = {
  id: string;
  sku: string;
  title: string;
  price: number;
  inventory_quantity: number;
  product_id: string;
  products: {
    id: string;
    slug: string;
    name: string;
    currency: "USD" | "EUR" | "GBP";
    is_active: boolean;
    origin_country_code: string | null;
    product_images: { storage_path: string; position: number }[];
  } | null;
};

function validate(input: CreateOrderInput): void {
  if (!input.lines.length) throw new OrderError("Your bag is empty.", "invalid");
  if (input.lines.length > MAX_LINES) {
    throw new OrderError("Too many items in one order.", "invalid");
  }

  for (const line of input.lines) {
    if (!line.variantId) {
      throw new OrderError("An item is missing its option.", "invalid");
    }
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > MAX_QUANTITY_PER_LINE
    ) {
      throw new OrderError("Invalid quantity on one of the items.", "invalid");
    }
  }
}

/**
 * Collapse repeats before pricing.
 *
 * The same variant sent as two lines of 15 is one line of 30, and has to be
 * capped as such — otherwise the per-line limit is trivially bypassed by
 * splitting.
 */
function mergeLines(lines: OrderLineInput[]): Map<string, number> {
  const merged = new Map<string, number>();

  for (const line of lines) {
    merged.set(line.variantId, (merged.get(line.variantId) ?? 0) + line.quantity);
  }

  for (const [, quantity] of merged) {
    if (quantity > MAX_QUANTITY_PER_LINE) {
      throw new OrderError("Quantity limit exceeded for an item.", "invalid");
    }
  }

  return merged;
}

/** Discount from the promotions table, or none. Never throws on a bad code. */
async function resolveDiscount(
  supabase: ReturnType<typeof createAdminClient>,
  code: string | null | undefined,
  subtotal: number
): Promise<{ discount: number; freeShipping: boolean; code: string | null }> {
  const none = { discount: 0, freeShipping: false, code: null };
  if (!code) return none;

  const { data: promotion } = await supabase
    .from("promotions")
    .select("*")
    .eq("code", code.trim().toUpperCase())
    .eq("is_active", true)
    .maybeSingle();

  if (!promotion) return none;

  const now = Date.now();
  const started = !promotion.starts_at || Date.parse(promotion.starts_at) <= now;
  const notEnded = !promotion.ends_at || Date.parse(promotion.ends_at) > now;
  const underLimit =
    !promotion.usage_limit || promotion.usage_count < promotion.usage_limit;

  if (
    !started ||
    !notEnded ||
    !underLimit ||
    subtotal < promotion.minimum_subtotal
  ) {
    // An expired or unmet code is dropped silently rather than failing the
    // order. The cart preview already told the shopper whether it applied.
    return none;
  }

  switch (promotion.kind) {
    case "percentage":
      return {
        discount: Math.round((subtotal * promotion.value) / 100),
        freeShipping: false,
        code: promotion.code,
      };
    case "fixed":
      return {
        discount: Math.min(promotion.value, subtotal),
        freeShipping: false,
        code: promotion.code,
      };
    case "free-shipping":
      return { discount: 0, freeShipping: true, code: promotion.code };
  }
}

/**
 * Price and write a pending order, claiming its stock.
 *
 * Ordering matters: stock is claimed *before* the order row exists, so a
 * failed reservation writes nothing at all. If the insert then fails, the
 * claim is handed straight back — an order that does not exist must not hold
 * inventory.
 */
export async function createPendingOrder(
  input: CreateOrderInput
): Promise<CreatedOrder> {
  if (!isSupabaseConfigured()) {
    throw new OrderError(
      "Checkout is not available yet. Please try again shortly.",
      "not-configured"
    );
  }

  validate(input);
  const merged = mergeLines(input.lines);
  const variantIds = [...merged.keys()];

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("product_variants")
    .select(
      `id, sku, title, price, inventory_quantity, product_id,
       products ( id, slug, name, currency, is_active, origin_country_code,
                  product_images ( storage_path, position ) )`
    )
    .in("id", variantIds);

  if (error) {
    console.error("[orders] variant lookup failed:", error);
    throw new OrderError("Could not price this order.", "failed");
  }

  // Cast rather than infer, matching `@/lib/catalog` — `Relationships` is
  // empty in our hand-maintained Database type, so nested selects come back
  // untyped and each join shape is declared alongside its query instead.
  const variants = (data ?? []) as unknown as VariantJoin[];
  if (variants.length !== variantIds.length) {
    throw new OrderError(
      "One or more items are no longer available.",
      "unavailable"
    );
  }
  if (variants.some((variant) => !variant.products?.is_active)) {
    throw new OrderError(
      "One or more items are no longer available.",
      "unavailable"
    );
  }

  /* -------- authoritative pricing. Nothing below reads a client amount. */

  let subtotal = 0;
  const items = variants.map((variant) => {
    const product = variant.products!;
    const quantity = merged.get(variant.id)!;
    const lineTotal = variant.price * quantity;
    subtotal += lineTotal;

    const image = [...product.product_images].sort(
      (a, b) => a.position - b.position
    )[0];

    return {
      variant_id: variant.id,
      product_id: variant.product_id,
      product_slug: product.slug,
      product_name: product.name,
      variant_title: variant.title,
      sku: variant.sku,
      image_url: image ? storageUrl(image.storage_path) : null,
      origin_country_code: product.origin_country_code,
      unit_price: variant.price,
      quantity,
      line_total: lineTotal,
    };
  });

  const {
    discount,
    freeShipping,
    code: promotionCode,
  } = await resolveDiscount(supabase, input.promotionCode, subtotal);

  const discounted = Math.max(0, subtotal - discount);
  const method =
    SHIPPING_METHODS.find((m) => m.id === input.shippingMethod) ??
    SHIPPING_METHODS[0];

  const shipping =
    freeShipping ||
    (method.id === "standard" && discounted >= FREE_SHIPPING_THRESHOLD)
      ? 0
      : method.price;

  // Tax applies after the discount, never to it.
  const tax = Math.round(discounted * TAX_RATE);
  const total = discounted + shipping + tax;

  if (total <= 0) {
    throw new OrderError("This order has nothing to charge.", "invalid");
  }

  /* ------------------------------------------------------ claim stock */

  const reservedLines = items.map((item) => ({
    variantId: item.variant_id,
    quantity: item.quantity,
  }));

  const { error: reserveError } = await supabase.rpc("reserve_inventory", {
    p_lines: items.map((item) => ({
      variant_id: item.variant_id,
      quantity: item.quantity,
    })),
  });

  if (reserveError) {
    throw new OrderError(
      "One or more items sold out while you were checking out.",
      "sold-out"
    );
  }

  /* ------------------------------------------------------- write rows */

  const { data: reference, error: referenceError } = await supabase.rpc(
    "generate_order_reference"
  );

  if (referenceError || !reference) {
    await releaseStock(reservedLines);
    console.error("[orders] reference generation failed:", referenceError);
    throw new OrderError("Could not place the order.", "failed");
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      reference,
      user_id: input.userId ?? null,
      email: input.email,
      status: "pending",
      subtotal,
      discount,
      shipping,
      tax,
      total,
      currency: "USD",
      promotion_code: promotionCode,
      shipping_address: input.shippingAddress as unknown as Record<string, unknown>,
      billing_address: (input.billingAddress ??
        input.shippingAddress) as unknown as Record<string, unknown>,
      shipping_method: input.shippingMethod,
      notes: input.giftMessage?.trim() || null,
    })
    .select("id, reference")
    .single();

  if (orderError || !order) {
    await releaseStock(reservedLines);
    console.error("[orders] insert failed after reserving stock:", orderError);
    throw new OrderError(
      "Could not place the order. You have not been charged.",
      "failed"
    );
  }

  const { error: itemsError } = await supabase
    .from("order_items")
    .insert(items.map((item) => ({ ...item, order_id: order.id })));

  if (itemsError) {
    // The order row exists but has no lines, so it cannot be fulfilled and
    // `fail_payment` would find nothing to release. Undo both explicitly.
    await releaseStock(reservedLines);
    await supabase.from("orders").delete().eq("id", order.id);
    console.error("[orders] item insert failed:", itemsError);
    throw new OrderError(
      "Could not place the order. You have not been charged.",
      "failed"
    );
  }

  return {
    id: order.id,
    reference: order.reference,
    totals: {
      subtotal,
      discount,
      shipping,
      tax,
      total,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      currency: "USD",
    },
    reservedLines,
  };
}

/** Hand claimed stock back. Best effort — never throws into a failure path. */
export async function releaseStock(
  lines: { variantId: string; quantity: number }[]
): Promise<void> {
  if (!lines.length) return;

  try {
    const supabase = createAdminClient();
    await supabase.rpc("release_inventory", {
      p_lines: lines.map((line) => ({
        variant_id: line.variantId,
        quantity: line.quantity,
      })),
    });
  } catch (error) {
    console.error("[orders] stock release failed:", error);
  }
}

/**
 * Cancel an order that never got as far as having a payment row.
 *
 * `fail_payment` handles the ordinary case — it cancels the order alongside
 * releasing its stock. This covers the narrow window before a payment row
 * exists at all, where an order would otherwise sit `pending` forever with
 * nothing for the expiry sweep to find, since that sweep walks payments.
 */
export async function cancelOrder(orderId: string): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", orderId)
      .eq("status", "pending");
  } catch (error) {
    console.error("[orders] cancel failed:", error);
  }
}

/** Bump a promotion's redemption count. Called once, on settlement. */
export async function countPromotionRedemption(code: string): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.rpc("increment_promotion_usage", { p_code: code });
  } catch (error) {
    console.error("[orders] promotion counter failed:", error);
  }
}

/* ------------------------------------------------------------------ reads */

export interface OrderWithItems extends OrderRow {
  order_items: OrderItemRow[];
}

/**
 * An order and its lines, read past RLS.
 *
 * The admin client is required rather than convenient: guest orders have a
 * null `user_id`, so the "readable by owner" policy matches nothing and a
 * session-scoped client returns an empty set for the one person entitled to
 * see it. Callers are responsible for proving entitlement first — the
 * confirmation page does it with the httpOnly cookie the payment callback set.
 */
export async function getOrderById(
  orderId: string
): Promise<OrderWithItems | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items (*)")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    console.error("[orders] read failed:", error);
    return null;
  }

  return (data as unknown as OrderWithItems | null) ?? null;
}
