"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  AdminAuthorizationError,
  createOperatorClient,
  requireAdminAction,
} from "@/lib/admin/guard";
import { CacheTags, invalidateTags } from "@/lib/cache";
import { isUniqueViolation, refusalMessage } from "@/lib/admin/errors";

/**
 * Collection mutations.
 *
 * A collection is an editorial grouping — "The Winter Edit" — and unlike a
 * category it is many-to-many with products, through `product_collections`.
 * That difference is most of this file: membership is its own set of
 * operations, and deleting a collection is safe in a way deleting a category
 * is not, because the join rows cascade and the products themselves are
 * untouched.
 *
 * Same two rules as everywhere else in this directory: authorise before
 * parsing, and write through the RLS-bound operator client.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
}

const idSchema = z.string().uuid("That is not a valid collection id.");
const productIdSchema = z.string().uuid("That is not a valid product id.");

async function revalidateCollections(slug?: string | null) {
  await invalidateTags([CacheTags.collections, CacheTags.products]);

  revalidatePath("/admin/collections");
  revalidatePath("/collections");
  // Featured collections render on the homepage.
  revalidatePath("/");
  if (slug) revalidatePath(`/collections/${slug}`);
}

async function authorise(): Promise<ActionResult | null> {
  try {
    await requireAdminAction();
    return null;
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}


/* ------------------------------------------------------------------ shared */

/** Mirrors `collections_slug_format` in migration 1. */
const slugSchema = z
  .string()
  .trim()
  .min(1, "A slug is required.")
  .max(80, "That slug is too long.")
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "Lowercase letters, numbers and single hyphens only."
  );

const collectionFields = {
  name: z.string().trim().min(1, "A name is required.").max(120, "That name is too long."),
  slug: slugSchema,
  tagline: z.string().trim().max(200, "Keep the tagline under 200 characters."),
  description: z.string().trim().max(1000, "Keep the description under 1000 characters."),
  /**
   * Either a storage object path or an absolute URL — `storageUrl()` accepts
   * both, which is what lets seeded `/media/...` files and uploaded objects
   * coexist. Empty clears it back to null.
   */
  imageUrl: z.string().trim().max(500, "That path is too long."),
  imageAlt: z.string().trim().max(200, "Keep the description under 200 characters."),
  position: z
    .number()
    .int("Position must be a whole number.")
    .min(0, "Position cannot be negative.")
    .max(32_767, "That position is too large."),
  isFeatured: z.boolean(),
  isActive: z.boolean(),
};

/* ----------------------------------------------------------------- create */

const createSchema = z.object(collectionFields);

export async function createCollection(input: unknown): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const supabase = await createOperatorClient();

  const { error } = await supabase.from("collections").insert({
    name: parsed.data.name,
    slug: parsed.data.slug,
    tagline: parsed.data.tagline,
    description: parsed.data.description,
    image_url: parsed.data.imageUrl || null,
    image_alt: parsed.data.imageAlt,
    position: parsed.data.position,
    is_featured: parsed.data.isFeatured,
    is_active: parsed.data.isActive,
  });

  if (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        message: "That slug is already taken.",
        fieldErrors: { slug: "Another collection already uses this slug." },
      };
    }
    console.error("[admin] collection create failed:", error);
    return { ok: false, message: refusalMessage(error, "Could not create that collection.") };
  }

  await revalidateCollections(parsed.data.slug);
  return { ok: true, message: `${parsed.data.name} created.` };
}

/* ------------------------------------------------------------------- edit */

const updateSchema = z.object({ id: idSchema, ...collectionFields });

export async function updateCollection(input: unknown): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrorsFrom(parsed.error),
    };
  }

  const supabase = await createOperatorClient();

  // Read the old slug before writing: if the slug changed, the storefront's
  // cached page for the *previous* URL also has to be dropped, and after the
  // update there is no longer any record of what it was.
  const { data: before } = await supabase
    .from("collections")
    .select("slug")
    .eq("id", parsed.data.id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("collections")
    .update({
      name: parsed.data.name,
      slug: parsed.data.slug,
      tagline: parsed.data.tagline,
      description: parsed.data.description,
      image_url: parsed.data.imageUrl || null,
      image_alt: parsed.data.imageAlt,
      position: parsed.data.position,
      is_featured: parsed.data.isFeatured,
      is_active: parsed.data.isActive,
    })
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        message: "That slug is already taken.",
        fieldErrors: { slug: "Another collection already uses this slug." },
      };
    }
    console.error("[admin] collection update failed:", error);
    return { ok: false, message: refusalMessage(error, "Could not save those changes.") };
  }

  if (!data) return { ok: false, message: "That collection no longer exists." };

  await revalidateCollections(parsed.data.slug);
  if (before?.slug && before.slug !== parsed.data.slug) {
    revalidatePath(`/collections/${before.slug}`);
  }

  return { ok: true, message: "Collection saved." };
}

/* --------------------------------------------------------- publish state */

export async function setCollectionPublished(
  collectionId: string,
  isActive: boolean
): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = idSchema.safeParse(collectionId);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };

  const supabase = await createOperatorClient();
  const { data, error } = await supabase
    .from("collections")
    .update({ is_active: isActive })
    .eq("id", parsed.data)
    .select("name, slug")
    .maybeSingle();

  if (error || !data) {
    console.error("[admin] collection publish failed:", error);
    return { ok: false, message: refusalMessage(error, "Could not change that collection's visibility.") };
  }

  await revalidateCollections(data.slug);
  return {
    ok: true,
    message: `${data.name} ${isActive ? "is now visible" : "is now hidden"}.`,
  };
}

/**
 * Feature or unfeature.
 *
 * Separate from publishing because they answer different questions: `is_active`
 * is whether the collection exists for shoppers at all, `is_featured` is
 * whether the homepage leads with it. A collection can be live and unfeatured,
 * which is the normal state for most of them.
 */
export async function setCollectionFeatured(
  collectionId: string,
  isFeatured: boolean
): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = idSchema.safeParse(collectionId);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };

  const supabase = await createOperatorClient();
  const { data, error } = await supabase
    .from("collections")
    .update({ is_featured: isFeatured })
    .eq("id", parsed.data)
    .select("name, slug")
    .maybeSingle();

  if (error || !data) {
    console.error("[admin] collection feature failed:", error);
    return { ok: false, message: refusalMessage(error, "Could not change that collection.") };
  }

  await revalidateCollections(data.slug);
  return {
    ok: true,
    message: `${data.name} ${isFeatured ? "is now featured" : "is no longer featured"}.`,
  };
}

/* ---------------------------------------------------------------- reorder */

const reorderSchema = z.object({
  orderedIds: z.array(idSchema).min(1).max(200),
});

export async function reorderCollections(input: unknown): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That reorder was not valid." };

  const supabase = await createOperatorClient();

  const { data: existing } = await supabase.from("collections").select("id");
  const known = new Set((existing ?? []).map((row) => row.id));

  if (
    known.size !== parsed.data.orderedIds.length ||
    !parsed.data.orderedIds.every((id) => known.has(id))
  ) {
    return { ok: false, message: "That list is out of date. Refresh and retry." };
  }

  const results = await Promise.all(
    parsed.data.orderedIds.map((id, position) =>
      supabase.from("collections").update({ position }).eq("id", id)
    )
  );

  const failed = results.find((result) => result.error);
  if (failed) {
    console.error("[admin] collection reorder failed:", failed.error);
    return { ok: false, message: refusalMessage(failed.error, "Could not save the new order.") };
  }

  await revalidateCollections();
  return { ok: true, message: "Order saved." };
}

/* -------------------------------------------------------------- membership */

const membershipSchema = z.object({
  collectionId: idSchema,
  productId: productIdSchema,
});

/**
 * Add a product to a collection.
 *
 * Appends. The join table's primary key is `(product_id, collection_id)`, so a
 * product added twice is a 23505 rather than a duplicate row — reported as a
 * success, because the operator's intent ("this should be in here") is already
 * satisfied and an error would be pedantry.
 */
export async function addProductToCollection(input: unknown): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = membershipSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };

  const supabase = await createOperatorClient();

  const { data: last } = await supabase
    .from("product_collections")
    .select("position")
    .eq("collection_id", parsed.data.collectionId)
    .order("position", { ascending: false })
    .limit(1);

  const nextPosition = (last?.[0]?.position ?? -1) + 1;

  const { error } = await supabase.from("product_collections").insert({
    collection_id: parsed.data.collectionId,
    product_id: parsed.data.productId,
    position: nextPosition,
  });

  if (error && !isUniqueViolation(error)) {
    console.error("[admin] collection add failed:", error);
    return { ok: false, message: refusalMessage(error, "Could not add that product.") };
  }

  const { data: collection } = await supabase
    .from("collections")
    .select("slug")
    .eq("id", parsed.data.collectionId)
    .maybeSingle();

  await revalidateCollections(collection?.slug);
  return {
    ok: true,
    message: isUniqueViolation(error) ? "Already in this collection." : "Product added.",
  };
}

export async function removeProductFromCollection(
  input: unknown
): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = membershipSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };

  const supabase = await createOperatorClient();

  const { error } = await supabase
    .from("product_collections")
    .delete()
    .eq("collection_id", parsed.data.collectionId)
    .eq("product_id", parsed.data.productId);

  if (error) {
    console.error("[admin] collection remove failed:", error);
    return { ok: false, message: refusalMessage(error, "Could not remove that product.") };
  }

  const { data: collection } = await supabase
    .from("collections")
    .select("slug")
    .eq("id", parsed.data.collectionId)
    .maybeSingle();

  await revalidateCollections(collection?.slug);
  return { ok: true, message: "Product removed." };
}

/* ----------------------------------------------------------------- delete */

/**
 * Delete a collection.
 *
 * Unlike a category this needs no usage check. `product_collections` is
 * `on delete cascade` on both sides, so the join rows go and the products
 * themselves are untouched — they simply stop being members of a grouping that
 * no longer exists. Nothing is orphaned and nothing is silently uncategorised.
 *
 * The count is still surfaced in the confirmation, because "this removes 24
 * products from this edit" is worth reading before agreeing to it.
 */
export async function deleteCollection(collectionId: string): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = idSchema.safeParse(collectionId);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };

  const supabase = await createOperatorClient();

  const { data: collection } = await supabase
    .from("collections")
    .select("name, slug")
    .eq("id", parsed.data)
    .maybeSingle();

  if (!collection) return { ok: false, message: "That collection no longer exists." };

  const { error } = await supabase
    .from("collections")
    .delete()
    .eq("id", parsed.data);

  if (error) {
    console.error("[admin] collection delete failed:", error);
    return { ok: false, message: refusalMessage(error, "The database refused that delete.") };
  }

  await revalidateCollections(collection.slug);
  return { ok: true, message: `${collection.name} deleted.` };
}
