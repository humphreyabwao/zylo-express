/**
 * create-order — Supabase Edge Function (Deno).
 *
 * Deploy:  supabase functions deploy create-order
 *
 * The client sends variant ids and quantities. It does NOT send prices, and
 * any it did send would be ignored: every amount is recomputed here from the
 * catalogue. A checkout that trusts a browser-supplied total is a checkout
 * that can be bought from for a penny.
 *
 * Stock is claimed through the `reserve_inventory` RPC, whose conditional
 * UPDATE is what prevents two simultaneous checkouts overselling the last
 * unit. If reservation fails, no order row is written.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

interface OrderLineInput {
  variantId: string;
  quantity: number;
}

interface CreateOrderRequest {
  email: string;
  lines: OrderLineInput[];
  shippingAddress: Record<string, unknown>;
  billingAddress?: Record<string, unknown>;
  shippingMethod: "standard" | "express" | "same-day";
  promotionCode?: string;
}

const SHIPPING_RATES: Record<string, number> = {
  standard: 0,
  express: 3500,
  "same-day": 9500,
};

const FREE_SHIPPING_THRESHOLD = 50_000;
const TAX_RATE = 0.0825;
const MAX_LINES = 50;
const MAX_QUANTITY_PER_LINE = 20;

const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("SITE_URL") ?? "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function isEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

function validate(body: CreateOrderRequest): string | null {
  if (!isEmail(body.email)) return "A valid email address is required.";
  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return "The order has no items.";
  }
  if (body.lines.length > MAX_LINES) return "Too many items in one order.";

  for (const line of body.lines) {
    if (typeof line.variantId !== "string" || !line.variantId) {
      return "A line is missing its variant.";
    }
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > MAX_QUANTITY_PER_LINE
    ) {
      return "Invalid quantity on one of the items.";
    }
  }

  if (!SHIPPING_RATES[body.shippingMethod]) {
    if (body.shippingMethod !== "standard") return "Unknown shipping method.";
  }
  if (!body.shippingAddress || typeof body.shippingAddress !== "object") {
    return "A shipping address is required.";
  }
  return null;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: CreateOrderRequest;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Malformed request body." }, 400);
  }

  const invalid = validate(body);
  if (invalid) return json({ error: invalid }, 400);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // Attribute the order to a signed-in user when the caller forwarded their
  // token. Absent or invalid means guest checkout, not an error.
  let userId: string | null = null;
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const { data } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    userId = data.user?.id ?? null;
  }

  // Collapse duplicate lines before pricing, so the same variant sent twice
  // cannot slip past the per-line quantity cap.
  const merged = new Map<string, number>();
  for (const line of body.lines) {
    merged.set(line.variantId, (merged.get(line.variantId) ?? 0) + line.quantity);
  }
  for (const [, quantity] of merged) {
    if (quantity > MAX_QUANTITY_PER_LINE) {
      return json({ error: "Quantity limit exceeded for an item." }, 400);
    }
  }

  const variantIds = [...merged.keys()];

  const { data: variants, error: variantError } = await supabase
    .from("product_variants")
    .select(
      `id, sku, title, price, inventory_quantity, product_id,
       products ( id, slug, name, currency, is_active, origin_country_code )`
    )
    .in("id", variantIds);

  if (variantError) {
    console.error("variant lookup failed", variantError);
    return json({ error: "Could not price this order." }, 500);
  }
  if (!variants || variants.length !== variantIds.length) {
    return json({ error: "One or more items are no longer available." }, 409);
  }

  // ---- Authoritative pricing. Nothing below reads a client-supplied amount.
  let subtotal = 0;
  const items = variants.map((variant) => {
    // deno-lint-ignore no-explicit-any
    const product = (variant as any).products;
    const quantity = merged.get(variant.id)!;
    const lineTotal = variant.price * quantity;
    subtotal += lineTotal;

    return {
      variant_id: variant.id,
      product_id: variant.product_id,
      product_slug: product?.slug ?? "",
      product_name: product?.name ?? "",
      variant_title: variant.title,
      sku: variant.sku,
      origin_country_code: product?.origin_country_code ?? null,
      unit_price: variant.price,
      quantity,
      line_total: lineTotal,
    };
  });

  if (variants.some((v) => {
    // deno-lint-ignore no-explicit-any
    return !(v as any).products?.is_active;
  })) {
    return json({ error: "One or more items are no longer available." }, 409);
  }

  // ---- Promotion, re-read from the database rather than trusted.
  let discount = 0;
  let promotionCode: string | null = null;
  let freeShipping = false;

  if (body.promotionCode) {
    const { data: promotion } = await supabase
      .from("promotions")
      .select("*")
      .eq("code", body.promotionCode.toUpperCase())
      .eq("is_active", true)
      .maybeSingle();

    const now = Date.now();
    const started = !promotion?.starts_at || Date.parse(promotion.starts_at) <= now;
    const notEnded = !promotion?.ends_at || Date.parse(promotion.ends_at) > now;
    const underLimit =
      !promotion?.usage_limit || promotion.usage_count < promotion.usage_limit;

    if (
      promotion &&
      started &&
      notEnded &&
      underLimit &&
      subtotal >= promotion.minimum_subtotal
    ) {
      promotionCode = promotion.code;
      if (promotion.kind === "percentage") {
        discount = Math.round((subtotal * promotion.value) / 100);
      } else if (promotion.kind === "fixed") {
        discount = Math.min(promotion.value, subtotal);
      } else if (promotion.kind === "free-shipping") {
        freeShipping = true;
      }
    }
  }

  const baseShipping = SHIPPING_RATES[body.shippingMethod] ?? 0;
  const shipping =
    freeShipping || subtotal - discount >= FREE_SHIPPING_THRESHOLD
      ? 0
      : baseShipping;

  // Tax applies after the discount, never to it.
  const tax = Math.round((subtotal - discount) * TAX_RATE);
  const total = subtotal - discount + shipping + tax;

  // ---- Claim stock. Nothing is written if this raises.
  const { error: reserveError } = await supabase.rpc("reserve_inventory", {
    p_lines: items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })),
  });

  if (reserveError) {
    return json(
      { error: "One or more items sold out while you were checking out." },
      409
    );
  }

  const { data: reference } = await supabase.rpc("generate_order_reference");

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      reference,
      user_id: userId,
      email: body.email,
      status: "confirmed",
      subtotal,
      discount,
      shipping,
      tax,
      total,
      currency: "USD",
      promotion_code: promotionCode,
      shipping_address: body.shippingAddress,
      billing_address: body.billingAddress ?? body.shippingAddress,
      shipping_method: body.shippingMethod,
    })
    .select("id, reference")
    .single();

  if (orderError || !order) {
    console.error("order insert failed after reserving stock", orderError);
    // Stock was already claimed; releasing it keeps inventory honest rather
    // than stranding units behind an order that does not exist.
    for (const item of items) {
      await supabase.rpc("reserve_inventory", {
        p_lines: [{ variant_id: item.variant_id, quantity: -item.quantity }],
      });
    }
    return json({ error: "Could not place the order. You have not been charged." }, 500);
  }

  const { error: itemsError } = await supabase
    .from("order_items")
    .insert(items.map((item) => ({ ...item, order_id: order.id })));

  if (itemsError) {
    console.error("order items insert failed", itemsError);
    return json({ error: "Order partially recorded. Contact support." }, 500);
  }

  if (promotionCode) {
    await supabase.rpc("increment_promotion_usage", { p_code: promotionCode });
  }

  return json({
    orderId: order.id,
    reference: order.reference,
    totals: { subtotal, discount, shipping, tax, total, currency: "USD" },
  });
});
