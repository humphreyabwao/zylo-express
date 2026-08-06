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
 * Product mutations.
 *
 * Server Actions, not a REST surface — the browser holds no Supabase key, so
 * there is no admin API to find and every call carries the framework's own
 * origin check. See `src/lib/admin/guard.ts` for the three layers behind this.
 *
 * Two rules every action here follows:
 *
 *   1. Authorise before parsing. An unauthorised caller must never learn
 *      whether their payload was well-formed; validation errors are themselves
 *      information about the schema.
 *   2. Write through the RLS-bound operator client, never the service key. The
 *      `is_admin()` policy on `products` is what actually authorises the write.
 *      The guard above exists to turn a refusal into a sentence rather than a
 *      Postgres error.
 *
 * Every mutation drops the catalogue cache tags. Without that the storefront
 * keeps serving an unpublished product from Redis for up to an hour, and the
 * operator's reasonable conclusion is that unpublishing is broken.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
}

const idSchema = z.string().uuid("That is not a valid product id.");

/** Called after any write. Cheap, and the alternative is a stale storefront. */
async function revalidateCatalogue(productSlug?: string) {
  await invalidateTags([
    CacheTags.products,
    CacheTags.facets,
    ...(productSlug ? [CacheTags.product(productSlug)] : []),
  ]);

  revalidatePath("/admin/products");
  revalidatePath("/admin");
  revalidatePath("/shop");
  if (productSlug) revalidatePath(`/products/${productSlug}`);
}

async function authorise(elevated = false): Promise<ActionResult | null> {
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

/* ---------------------------------------------------------- publish state */

/**
 * Publish or unpublish.
 *
 * `is_active` is the storefront's visibility switch: the RLS read policy on
 * `products` is `using (is_active)`, so flipping this to false removes the
 * product from every anonymous read at the database level rather than by
 * filtering it out in application code.
 *
 * Deliberately not paired with `available`, which is a different idea — a
 * published product can be legitimately out of stock, and collapsing the two
 * would make restocking republish something an operator had deliberately
 * pulled.
 */
export async function setProductPublished(
  productId: string,
  published: boolean
): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = idSchema.safeParse(productId);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]!.message };
  }

  const supabase = await createOperatorClient();
  const { data, error } = await supabase
    .from("products")
    .update({ is_active: published })
    .eq("id", parsed.data)
    .select("slug, name")
    .maybeSingle();

  if (error) {
    console.error("[admin] publish toggle failed:", error);
    return {
      ok: false,
      message: "The database refused that change. You may not have permission.",
    };
  }
  if (!data) {
    return { ok: false, message: "That product no longer exists." };
  }

  await revalidateCatalogue(data.slug);

  return {
    ok: true,
    message: published
      ? `${data.name} is live on the storefront.`
      : `${data.name} is hidden from the storefront.`,
  };
}

/* ----------------------------------------------------------------- delete */

/**
 * Permanently remove a product.
 *
 * Elevated: staff run the shop, administrators destroy things.
 *
 * The refusal below is the important part. `order_items.product_id` is
 * `on delete set null` and snapshots its own name, price and SKU, so deleting
 * a sold product does not corrupt order history — but it does sever every
 * line's link back to the catalogue, and no amount of restoring brings that
 * back. Unpublishing achieves what the operator almost always means, so a
 * product that has ever sold has to be unpublished instead.
 */
export async function deleteProduct(productId: string): Promise<ActionResult> {
  const denied = await authorise(true);
  if (denied) return denied;

  const parsed = idSchema.safeParse(productId);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]!.message };
  }

  const supabase = await createOperatorClient();

  const { data: product } = await supabase
    .from("products")
    .select("slug, name")
    .eq("id", parsed.data)
    .maybeSingle();

  if (!product) return { ok: false, message: "That product no longer exists." };

  const { count: soldCount } = await supabase
    .from("order_items")
    .select("*", { count: "exact", head: true })
    .eq("product_id", parsed.data);

  if ((soldCount ?? 0) > 0) {
    return {
      ok: false,
      message: `${product.name} appears on ${soldCount} order line${
        soldCount === 1 ? "" : "s"
      }. Unpublish it instead — deleting would cut those orders off from the catalogue.`,
    };
  }

  // Images, options, variants and collection links all cascade from here; see
  // the foreign keys in migration 1.
  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", parsed.data);

  if (error) {
    console.error("[admin] product delete failed:", error);
    return {
      ok: false,
      message: "The database refused that delete. You may not have permission.",
    };
  }

  await revalidateCatalogue(product.slug);
  return { ok: true, message: `${product.name} was deleted.` };
}

/* -------------------------------------------------------------- duplicate */

/**
 * Copy a product as a draft.
 *
 * The fastest honest way to create the fifth colourway of something. Copies the
 * parent's own row only — not its images or variants, which are the parts an
 * operator is about to replace anyway, and copying them would produce duplicate
 * SKUs that the unique index rejects.
 *
 * Always lands as a draft. A duplicate appearing live on the storefront under a
 * placeholder name, before anyone has edited it, is the failure mode worth
 * designing out.
 */
export async function duplicateProduct(
  productId: string
): Promise<ActionResult & { id?: string }> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = idSchema.safeParse(productId);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]!.message };
  }

  const supabase = await createOperatorClient();
  const { data: source } = await supabase
    .from("products")
    .select("*")
    .eq("id", parsed.data)
    .maybeSingle();

  if (!source) return { ok: false, message: "That product no longer exists." };

  // Strip the identity and the derived reputation: a copy has not been rated,
  // and inheriting the original's stars would be a fabricated review count.
  const {
    id: _id,
    slug: _slug,
    published_at: _publishedAt,
    rating: _rating,
    review_count: _reviewCount,
    ...fields
  } = source;
  void [_id, _slug, _publishedAt, _rating, _reviewCount];

  // Suffix rather than a random string: an operator scanning the list needs to
  // recognise which original this came from. The counter only grows if an
  // earlier copy is still sitting unedited, which is itself worth seeing.
  const baseSlug = `${source.slug}-copy`;
  const { data: clashes } = await supabase
    .from("products")
    .select("slug")
    .like("slug", `${baseSlug}%`);

  const taken = new Set((clashes ?? []).map((row) => row.slug));
  let slug = baseSlug;
  let n = 2;
  while (taken.has(slug)) slug = `${baseSlug}-${n++}`;

  const { data: created, error } = await supabase
    .from("products")
    .insert({
      ...fields,
      slug,
      name: `${source.name} (copy)`,
      is_active: false,
      is_featured: false,
      rating: 0,
      review_count: 0,
    })
    .select("id, name")
    .single();

  if (error || !created) {
    console.error("[admin] duplicate failed:", error);
    return { ok: false, message: "Could not duplicate that product." };
  }

  await revalidateCatalogue();
  return {
    ok: true,
    id: created.id,
    message: `Created ${created.name} as a draft.`,
  };
}

/* ------------------------------------------------------------ money field */

/**
 * Prices arrive as decimal strings because that is what a person types into a
 * money field, and become integer minor units here — the one place that
 * conversion happens, so a rounding decision cannot drift between two forms.
 *
 * Declared above its first use rather than beside it: `const` is in the
 * temporal dead zone until evaluated, and both `createSchema` and
 * `productEditSchema` are built at module scope. Defining it lower down makes
 * importing this module throw.
 */
const priceField = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, `${label} must be a number, e.g. 249.00`)
    .transform((value) => Math.round(Number(value) * 100));


/* ----------------------------------------------------------------- create */

const PRODUCT_FLAGS = [
  "new",
  "exclusive",
  "limited",
  "made-to-order",
  "final-sale",
  "archive",
] as const;

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .max(160)
    // Mirrors the `products_slug_format` check constraint. Enforced here so a
    // typo is a field error rather than a raw 23514 from Postgres.
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers and hyphens"
    ),
  tagline: z.string().trim().max(200).optional().or(z.literal("")),
  excerpt: z.string().trim().max(400).optional().or(z.literal("")),
  description: z.string().trim().max(4000).optional().or(z.literal("")),
  // Slug, not id: that is the identifier the storefront and every filter use,
  // and `Category` in the domain model has no id at all. The uuid is resolved
  // below, where it is needed for the foreign key.
  categorySlug: z.string().trim().max(80).optional().or(z.literal("")),
  originCountryCode: z
    .union([z.string().trim().length(2), z.literal("")])
    .optional(),
  originCity: z.string().trim().max(80).optional().or(z.literal("")),
  price: priceField("Price"),
  compareAtPrice: z.union([priceField("Compare-at price"), z.literal("")]).optional(),
  flags: z.array(z.enum(PRODUCT_FLAGS)).max(6).optional(),
  isActive: z.boolean(),
  isFeatured: z.boolean(),

  // The first variant. A product without one has no SKU, no stock and no
  // purchasable price — the storefront cannot add it to a bag and the admin's
  // own `deleteVariant` guard calls that state broken. So creating a product
  // creates one, and the form asks for it rather than inventing a placeholder
  // someone has to find and fix later.
  //
  // On "auto" the SKU is generated here, at insert time, and anything the
  // client sent in `sku` is ignored. Generating it in the browser would mean
  // trusting a value that was checked for collisions before the operator
  // spent two minutes filling in the rest of the form.
  skuMode: z.enum(["auto", "manual"]),
  sku: z
    .string()
    .trim()
    .max(64)
    .regex(
      /^[A-Za-z0-9._-]*$/,
      "Use letters, numbers, dots, dashes or underscores"
    )
    .optional()
    .or(z.literal("")),
  variantTitle: z.string().trim().min(1, "Option name is required").max(120),
  stock: z.number().int().min(0).max(1_000_000),
}).refine(
  (values) => values.skuMode === "auto" || Boolean(values.sku?.trim()),
  { message: "SKU is required", path: ["sku"] }
);

/**
 * What an auto-generated SKU would be for this name, right now.
 *
 * Exists so the form can show the operator the value before they commit to it
 * — an "auto" mode that reveals its result only after saving is a mode nobody
 * trusts. It is a preview and nothing more: the SKU actually written is
 * generated again at insert time, because this one may be taken by then.
 */
export async function previewSku(
  productName: string
): Promise<{ ok: boolean; sku?: string }> {
  const denied = await authorise();
  if (denied) return { ok: false };

  const name = String(productName ?? "").trim();
  if (!name) return { ok: false };

  const supabase = await createOperatorClient();
  return { ok: true, sku: await nextSku(supabase, name) };
}

/**
 * Create a product and its first variant.
 *
 * Deliberately not a full editor. Imagery needs a product id to upload
 * against, and further variants are easier to reason about next to the ones
 * that exist — so this collects what the database genuinely requires, then
 * hands the operator to the detail page to finish. A single form that tried to
 * do everything would have to invent a client-side draft of a product that
 * does not exist yet, and reconcile it on submit.
 */
export async function createProduct(
  input: unknown
): Promise<ActionResult & { id?: string }> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = createSchema.safeParse(input);
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
          "The compare-at price is what the item used to cost, so it must be higher than the price.",
      },
    };
  }

  const supabase = await createOperatorClient();

  // The FK wants a uuid. An unrecognised slug becomes "uncategorised" rather
  // than an error: the category list came from this same database moments ago,
  // so a miss means it was deleted mid-form, and losing the whole submission
  // over that would be worse than filing the product without a category.
  let categoryId: string | null = null;
  if (values.categorySlug) {
    const { data: category } = await supabase
      .from("categories")
      .select("id")
      .eq("slug", values.categorySlug)
      .maybeSingle();

    categoryId = category?.id ?? null;
  }

  // `origin_label` is the human line on the product card. Composed here from
  // the parts rather than being a third field to keep consistent with them.
  let originLabel = "";
  if (values.originCountryCode) {
    const { data: country } = await supabase
      .from("countries")
      .select("name")
      .eq("code", values.originCountryCode)
      .maybeSingle();

    originLabel = [values.originCity, country?.name].filter(Boolean).join(", ");
  }

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      name: values.name,
      slug: values.slug,
      tagline: values.tagline || "",
      excerpt: values.excerpt || "",
      description: values.description || "",
      // `category_slug` is not set here: a trigger derives it from
      // `category_id`, and writing both invites them to disagree.
      category_id: categoryId,
      origin_country_code: values.originCountryCode || null,
      origin_city: values.originCity || null,
      origin_label: originLabel,
      price: values.price,
      compare_at_price: compareAt,
      currency: "USD",
      flags: values.flags ?? [],
      is_active: values.isActive,
      is_featured: values.isFeatured,
    })
    .select("id, slug, name")
    .single();

  if (error || !product) {
    if (error?.code === "23505") {
      return {
        ok: false,
        message: "Check the highlighted fields.",
        fieldErrors: { slug: "Another product already uses this slug." },
      };
    }
    console.error("[admin] product create failed:", error);
    return {
      ok: false,
      message: "The database refused that. You may not have permission.",
    };
  }

  /**
   * Insert the first variant, retrying a generated SKU that lost a race.
   *
   * `nextSku` checks what is taken, but check-then-insert is not atomic — two
   * operators creating products from the same stem in the same second both see
   * 0101 free. The unique index is the real guard, so a 23505 on a *generated*
   * SKU means "someone took it, pick the next one", not "tell the operator
   * their input was wrong". A manual SKU gets no retry: regenerating over
   * something the operator typed would be worse than saying it is taken.
   */
  let variantError: { code?: string } | null = null;
  let attempt = 0;

  while (attempt < 5) {
    const sku =
      values.skuMode === "auto"
        ? await nextSku(supabase, values.name)
        : values.sku!.trim();

    const { error } = await supabase.from("product_variants").insert({
      product_id: product.id,
      sku,
      title: values.variantTitle,
      price: values.price,
      compare_at_price: compareAt,
      inventory_quantity: values.stock,
      // `available` is derived from stock by a trigger, so it is not set here.
    });

    if (!error) {
      variantError = null;
      break;
    }

    variantError = error;
    if (error.code !== "23505" || values.skuMode !== "auto") break;
    attempt++;
  }

  if (variantError) {
    // Roll back rather than leaving a product nobody can buy. The alternative
    // — keeping it and telling the operator to add a variant — produces a row
    // that looks finished in the list and fails silently on the storefront.
    await supabase.from("products").delete().eq("id", product.id);

    if (variantError.code === "23505") {
      return {
        ok: false,
        message: "Check the highlighted fields.",
        fieldErrors: {
          sku:
            values.skuMode === "auto"
              ? "Could not find a free SKU for that name. Enter one manually."
              : "Another variant already uses this SKU.",
        },
      };
    }
    console.error("[admin] first variant insert failed:", variantError);
    return { ok: false, message: "Could not create the product's first option." };
  }

  await revalidateCatalogue(product.slug);
  return { ok: true, id: product.id, message: `${product.name} was created.` };
}

/* ------------------------------------------------------------------- edit */

/**
 * The fields worth editing without leaving the list.
 *
 * Prices arrive as decimal strings because that is what a human types into a
 * money field, and are converted to integer minor units here — the one place
 * that conversion happens, so a rounding decision cannot drift between the
 * form and the database.
 */
// Not exported. A "use server" module may only export async functions — every
// export becomes a callable server endpoint, so a Zod schema or a constant is
// a build error rather than a style issue. Nothing outside this file needs it.
const productEditSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1, "Name is required").max(160),
  slug: z
    .string()
    .trim()
    .min(1, "Slug is required")
    .max(160)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers and hyphens"
    ),
  tagline: z.string().trim().max(200).optional().or(z.literal("")),
  price: priceField("Price"),
  compareAtPrice: z
    .union([priceField("Compare-at price"), z.literal("")])
    .optional(),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
});

export async function updateProduct(input: unknown): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = productEditSchema.safeParse(input);
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

  // A strike-through price below the asking price reads as a price *rise* on
  // the product card. Refused here rather than silently dropped, because the
  // operator meant something by it and should be told which way round it goes.
  if (compareAt !== null && compareAt <= values.price) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: {
        compareAtPrice:
          "The compare-at price is what the item used to cost, so it must be higher than the price.",
      },
    };
  }

  const supabase = await createOperatorClient();

  const { data, error } = await supabase
    .from("products")
    .update({
      name: values.name,
      slug: values.slug,
      tagline: values.tagline || "",
      price: values.price,
      compare_at_price: compareAt,
      is_active: values.isActive,
      is_featured: values.isFeatured,
    })
    .eq("id", values.id)
    .select("slug, name")
    .maybeSingle();

  if (error) {
    // 23505 — the slug is taken. Every other failure is genuinely unexpected.
    if (error.code === "23505") {
      return {
        ok: false,
        message: "Check the highlighted fields.",
        fieldErrors: { slug: "Another product already uses this slug." },
      };
    }
    console.error("[admin] product update failed:", error);
    return {
      ok: false,
      message: "The database refused that change. You may not have permission.",
    };
  }

  if (!data) return { ok: false, message: "That product no longer exists." };

  await revalidateCatalogue(data.slug);
  return { ok: true, message: `${data.name} was updated.` };
}
