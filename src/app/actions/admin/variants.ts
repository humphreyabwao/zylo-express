"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  AdminAuthorizationError,
  createOperatorClient,
  requireAdminAction,
} from "@/lib/admin/guard";
import { CacheTags, invalidateTags } from "@/lib/cache";
import { nextSku } from "@/lib/admin/sku";

/**
 * Variant mutations.
 *
 * A variant is the thing actually bought: it holds the SKU, the price charged,
 * and the stock that `reserve_inventory` decrements at checkout. The product
 * row above it is merchandising.
 *
 * Two schema facts shape everything here:
 *
 *   - `available` is derived, not set. A trigger
 *     (`sync_variant_availability`) recomputes it from `inventory_quantity` on
 *     every write, and a second trigger rolls that up to the product. Offering
 *     it as an editable field would show operators a switch the database
 *     immediately overrides.
 *   - `sku` is globally unique, not per-product. A collision is a 23505 and is
 *     reported against the field rather than as a generic failure.
 */

export interface VariantResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
}

async function authorise(elevated = false): Promise<VariantResult | null> {
  try {
    await requireAdminAction({ elevated });
    return null;
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

async function revalidateFor(productId: string) {
  const supabase = await createOperatorClient();
  const { data } = await supabase
    .from("products")
    .select("slug")
    .eq("id", productId)
    .maybeSingle();

  await invalidateTags([
    CacheTags.products,
    CacheTags.facets,
    ...(data?.slug ? [CacheTags.product(data.slug)] : []),
  ]);

  revalidatePath(`/admin/products/${productId}`);
  revalidatePath("/admin/products");
  revalidatePath("/admin/inventory");
  if (data?.slug) revalidatePath(`/products/${data.slug}`);
}

const priceField = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, `${label} must be a number, e.g. 249.00`)
    .transform((value) => Math.round(Number(value) * 100));

// Not exported — see the note in `products.ts`. Every export from a
// "use server" module has to be an async function.
const variantSchema = z.object({
  id: z.string().uuid(),
  sku: z
    .string()
    .trim()
    .min(1, "SKU is required")
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/, "Use letters, numbers, dots, dashes or underscores"),
  title: z.string().trim().min(1, "Title is required").max(120),
  price: priceField("Price"),
  compareAtPrice: z.union([priceField("Compare-at price"), z.literal("")]).optional(),
  inventoryQuantity: z
    .number({ invalid_type_error: "Stock must be a whole number" })
    .int("Stock must be a whole number")
    .min(0, "Stock cannot be negative")
    .max(1_000_000),
  imageId: z.union([z.string().uuid(), z.literal("")]).optional(),
});

/**
 * A free SKU for another option of this product.
 *
 * The counterpart to the create form's auto mode, for the two places a SKU is
 * edited rather than issued. Takes a product id rather than a name because
 * that is what both call sites have, and the name is what the stem derives
 * from — so it is read here instead of being passed through the browser, where
 * it could be anything.
 *
 * Changing an existing variant's SKU is safe with respect to history:
 * `order_items` snapshots the SKU at purchase, so past orders keep the value
 * they were picked under.
 */
export async function suggestVariantSku(
  productId: string
): Promise<{ ok: boolean; sku?: string }> {
  const denied = await authorise();
  if (denied) return { ok: false };

  const parsed = z.string().uuid().safeParse(productId);
  if (!parsed.success) return { ok: false };

  const supabase = await createOperatorClient();
  const { data: product } = await supabase
    .from("products")
    .select("name")
    .eq("id", parsed.data)
    .maybeSingle();

  if (!product) return { ok: false };

  return { ok: true, sku: await nextSku(supabase, product.name) };
}

export async function updateVariant(input: unknown): Promise<VariantResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = variantSchema.safeParse(input);
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: Object.fromEntries(
        Object.entries(flat)
          .filter(([, messages]) => messages?.length)
          .map(([field, messages]) => [field, messages![0]!])
      ),
    };
  }

  const values = parsed.data;
  const compareAt =
    values.compareAtPrice === "" || values.compareAtPrice === undefined
      ? null
      : values.compareAtPrice;

  if (compareAt !== null && compareAt <= values.price) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: {
        compareAtPrice:
          "The compare-at price is what it used to cost, so it must be higher than the price.",
      },
    };
  }

  const supabase = await createOperatorClient();

  const { data, error } = await supabase
    .from("product_variants")
    .update({
      sku: values.sku,
      title: values.title,
      price: values.price,
      compare_at_price: compareAt,
      inventory_quantity: values.inventoryQuantity,
      image_id: values.imageId || null,
      // `available` is omitted on purpose — the trigger owns it.
    })
    .eq("id", values.id)
    .select("product_id, title")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        message: "Check the highlighted fields.",
        fieldErrors: { sku: "Another variant already uses this SKU." },
      };
    }
    console.error("[admin] variant update failed:", error);
    return {
      ok: false,
      message: "The database refused that change. You may not have permission.",
    };
  }

  if (!data) return { ok: false, message: "That variant no longer exists." };

  await revalidateFor(data.product_id);
  return { ok: true, message: `${data.title} was updated.` };
}

/* ------------------------------------------------------------------ stock */

const stockSchema = z.object({
  id: z.string().uuid(),
  quantity: z.number().int().min(0).max(1_000_000),
});

/**
 * Set stock on its own.
 *
 * Separate from `updateVariant` because restocking is the operation an
 * operator performs most often and least deliberately — from a delivery note,
 * a dozen rows at a time. Making it a full form edit means loading a modal to
 * change one integer.
 *
 * Absolute, not a delta. "Set to 12" is what a stock count produces; "+3"
 * requires knowing what it was, and two operators counting the same shelf then
 * add six.
 */
export async function setVariantStock(input: unknown): Promise<VariantResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = stockSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Enter a whole number of units, 0 or more." };
  }

  const supabase = await createOperatorClient();
  const { data, error } = await supabase
    .from("product_variants")
    .update({ inventory_quantity: parsed.data.quantity })
    .eq("id", parsed.data.id)
    .select("product_id, title")
    .maybeSingle();

  if (error || !data) {
    console.error("[admin] stock update failed:", error);
    return { ok: false, message: "Could not update that stock level." };
  }

  await revalidateFor(data.product_id);
  return {
    ok: true,
    message: `${data.title} set to ${parsed.data.quantity} in stock.`,
  };
}

const adjustSchema = z.object({
  id: z.string().uuid(),
  // `.refine` produces a ZodEffects, which has no `.min`/`.max` — so the
  // bounds go on the number and the non-zero check comes last.
  delta: z
    .number()
    .int("Adjustments must be whole units")
    .min(-10_000)
    .max(10_000)
    .refine((value) => value !== 0, "Adjustment cannot be zero"),
});

/**
 * Move stock by a relative amount.
 *
 * The counterpart to `setVariantStock`, and the distinction is the point:
 *
 *   set    "the shelf holds 12"        — a stock count
 *   adjust "three arrived" / "one broke" — an event
 *
 * Adjustments go through the `adjust_variant_stock` RPC rather than a
 * read-modify-write here, because this is the one table where a lost update is
 * guaranteed rather than theoretical: `reserve_inventory` decrements the same
 * rows on every checkout. Reading 8, adding 3, and writing 11 silently
 * restores any unit sold in between.
 */
export async function adjustVariantStock(input: unknown): Promise<VariantResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]!.message };
  }

  const supabase = await createOperatorClient();

  const { data: quantity, error } = await supabase.rpc("adjust_variant_stock", {
    p_variant_id: parsed.data.id,
    p_delta: parsed.data.delta,
  });

  if (error) {
    console.error("[admin] stock adjust failed:", error);
    return {
      ok: false,
      message: error.message.includes("variant_not_found")
        ? "That variant no longer exists."
        : "Could not adjust that stock level.",
    };
  }

  const { data: variant } = await supabase
    .from("product_variants")
    .select("product_id, title")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (variant) await revalidateFor(variant.product_id);

  const sign = parsed.data.delta > 0 ? "+" : "";
  return {
    ok: true,
    message: `${variant?.title ?? "Variant"} ${sign}${parsed.data.delta} → ${quantity} in stock.`,
  };
}

/* ----------------------------------------------------------------- delete */

/**
 * Remove a variant.
 *
 * Elevated, and refused in two cases:
 *
 *   - it has sold. `order_items.variant_id` is `on delete set null`, so
 *     history survives, but those lines lose their link to the catalogue for
 *     good. Setting stock to zero achieves what was almost certainly meant.
 *   - it is the last one. A product with no variants cannot be added to a bag
 *     and shows no price, so it is broken rather than unavailable — and the
 *     honest way to withdraw a product is to unpublish it.
 */
export async function deleteVariant(variantId: string): Promise<VariantResult> {
  const denied = await authorise(true);
  if (denied) return denied;

  const parsed = z.string().uuid().safeParse(variantId);
  if (!parsed.success) return { ok: false, message: "That is not a valid variant." };

  const supabase = await createOperatorClient();

  const { data: variant } = await supabase
    .from("product_variants")
    .select("product_id, title")
    .eq("id", parsed.data)
    .maybeSingle();

  if (!variant) return { ok: false, message: "That variant no longer exists." };

  const [{ count: soldCount }, { count: siblingCount }] = await Promise.all([
    supabase
      .from("order_items")
      .select("*", { count: "exact", head: true })
      .eq("variant_id", parsed.data),
    supabase
      .from("product_variants")
      .select("*", { count: "exact", head: true })
      .eq("product_id", variant.product_id),
  ]);

  if ((soldCount ?? 0) > 0) {
    return {
      ok: false,
      message: `${variant.title} appears on ${soldCount} order line${
        soldCount === 1 ? "" : "s"
      }. Set its stock to zero instead — deleting would cut those orders off from the catalogue.`,
    };
  }

  if ((siblingCount ?? 0) <= 1) {
    return {
      ok: false,
      message:
        "This is the product's only variant. A product with none cannot be bought or priced — unpublish the product instead.",
    };
  }

  const { error } = await supabase
    .from("product_variants")
    .delete()
    .eq("id", parsed.data);

  if (error) {
    console.error("[admin] variant delete failed:", error);
    return { ok: false, message: "The database refused that delete." };
  }

  await revalidateFor(variant.product_id);
  return { ok: true, message: `${variant.title} was deleted.` };
}
