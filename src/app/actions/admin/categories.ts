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
 * Category mutations.
 *
 * Same two rules as `products.ts`: authorise before parsing, and write through
 * the RLS-bound operator client so the `is_admin()` policy is what actually
 * authorises rather than this file's own say-so.
 *
 * Categories are load-bearing in a way products are not. `products.category_slug`
 * is a denormalised copy of `categories.slug`, kept in step by the
 * `categories_cascade_slug` trigger, and the storefront's category filter reads
 * that column rather than joining. So a slug edit here silently rewrites a
 * column on every product in the category — which is correct, and worth knowing
 * before changing anything in this file.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
}

const idSchema = z.string().uuid("That is not a valid category id.");

/**
 * Drops the storefront's cached view of the catalogue.
 *
 * `categories` is the obvious tag. `products` and `facets` go too because a
 * category rename changes the label on every product card that shows it, and
 * the facet counts are keyed by category slug — leaving those cached means the
 * shop filters by a name that no longer exists for up to an hour.
 */
async function revalidateCategories() {
  await invalidateTags([
    CacheTags.categories,
    CacheTags.products,
    CacheTags.facets,
  ]);

  revalidatePath("/admin/categories");
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  revalidatePath("/collections");
  // The nav is rendered in the root layout, so every storefront route shows it.
  revalidatePath("/", "layout");
}

async function authorise(): Promise<ActionResult | null> {
  try {
    await requireAdminAction({ module: "categories" });
    return null;
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

/* ------------------------------------------------------------------ shared */

/**
 * Mirrors `categories_slug_format` in migration 1.
 *
 * Checked here as well as in Postgres so the operator gets a sentence instead
 * of a constraint violation. The database check is the one that is load-bearing.
 */
const slugSchema = z
  .string()
  .trim()
  .min(1, "A slug is required.")
  .max(80, "That slug is too long.")
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "Lowercase letters, numbers and single hyphens only."
  );

const categoryFields = {
  name: z.string().trim().min(1, "A name is required.").max(120, "That name is too long."),
  slug: slugSchema,
  group: z
    .string()
    .trim()
    .min(1, "A group is required.")
    .max(60, "That group name is too long."),
  description: z.string().trim().max(500, "Keep the description under 500 characters."),
  position: z
    .number()
    .int("Position must be a whole number.")
    // smallint in Postgres; a larger value is a constraint error, not a big number.
    .min(0, "Position cannot be negative.")
    .max(32_767, "That position is too large."),
  isActive: z.boolean(),
};

/** Turns a zod failure into the per-field map the modals render. */
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


/* ----------------------------------------------------------------- create */

const createSchema = z.object(categoryFields);

export async function createCategory(input: unknown): Promise<ActionResult> {
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

  const { error } = await supabase.from("categories").insert({
    name: parsed.data.name,
    slug: parsed.data.slug,
    group: parsed.data.group,
    description: parsed.data.description,
    position: parsed.data.position,
    is_active: parsed.data.isActive,
  });

  if (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        message: "That slug is already taken.",
        fieldErrors: { slug: "Another category already uses this slug." },
      };
    }
    console.error("[admin] category create failed:", error);
    return { ok: false, message: refusalMessage(error, "Could not create that category.") };
  }

  await revalidateCategories();
  return { ok: true, message: `${parsed.data.name} created.` };
}

/* ------------------------------------------------------------------- edit */

const updateSchema = z.object({ id: idSchema, ...categoryFields });

export async function updateCategory(input: unknown): Promise<ActionResult> {
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

  const { data, error } = await supabase
    .from("categories")
    .update({
      name: parsed.data.name,
      slug: parsed.data.slug,
      group: parsed.data.group,
      description: parsed.data.description,
      position: parsed.data.position,
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
        fieldErrors: { slug: "Another category already uses this slug." },
      };
    }
    console.error("[admin] category update failed:", error);
    return { ok: false, message: refusalMessage(error, "Could not save those changes.") };
  }

  // `maybeSingle` with no row means the id is gone, or RLS hid it. Either way
  // the operator is looking at a list that no longer matches the database.
  if (!data) {
    return { ok: false, message: "That category no longer exists." };
  }

  await revalidateCategories();
  return { ok: true, message: "Category saved." };
}

/* --------------------------------------------------------- publish state */

/**
 * Show or hide a category.
 *
 * The RLS read policy on `categories` is `using (is_active)`, so this removes
 * it from every anonymous read at the database level. Its products stay
 * published — they simply stop being reachable through this route, which is
 * what makes this the safe alternative to deleting.
 */
export async function setCategoryPublished(
  categoryId: string,
  isActive: boolean
): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = idSchema.safeParse(categoryId);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };

  const supabase = await createOperatorClient();
  const { data, error } = await supabase
    .from("categories")
    .update({ is_active: isActive })
    .eq("id", parsed.data)
    .select("name")
    .maybeSingle();

  if (error || !data) {
    console.error("[admin] category publish failed:", error);
    return { ok: false, message: refusalMessage(error, "Could not change that category's visibility.") };
  }

  await revalidateCategories();
  return {
    ok: true,
    message: `${data.name} ${isActive ? "is now visible" : "is now hidden"}.`,
  };
}

/* ---------------------------------------------------------------- reorder */

const reorderSchema = z.object({
  orderedIds: z.array(idSchema).min(1).max(200),
});

/**
 * Set the nav order.
 *
 * Writes the whole sequence rather than swapping a pair, for the same reason
 * `reorderProductImages` does: a partial reorder that fails halfway leaves an
 * order nobody chose, whereas sending the full list means the worst case is
 * the previous order, intact.
 */
export async function reorderCategories(input: unknown): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That reorder was not valid." };

  const supabase = await createOperatorClient();

  const { data: existing } = await supabase.from("categories").select("id");
  const known = new Set((existing ?? []).map((row) => row.id));

  if (
    known.size !== parsed.data.orderedIds.length ||
    !parsed.data.orderedIds.every((id) => known.has(id))
  ) {
    return { ok: false, message: "That list is out of date. Refresh and retry." };
  }

  const results = await Promise.all(
    parsed.data.orderedIds.map((id, position) =>
      supabase.from("categories").update({ position }).eq("id", id)
    )
  );

  const failed = results.find((result) => result.error);
  if (failed) {
    console.error("[admin] category reorder failed:", failed.error);
    return { ok: false, message: refusalMessage(failed.error, "Could not save the new order.") };
  }

  await revalidateCategories();
  return { ok: true, message: "Order saved." };
}

/* ----------------------------------------------------------------- delete */

/**
 * Delete a category.
 *
 * Refuses while products still point at it. `products.category_id` is
 * `on delete set null`, so Postgres would happily allow this and leave every
 * one of those products uncategorised — invisible to the shop's category
 * filter, and with no record of where they used to live. That is a data loss
 * an operator cannot see and cannot undo.
 *
 * Hiding is the reversible operation and is what the refusal points at.
 */
export async function deleteCategory(categoryId: string): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = idSchema.safeParse(categoryId);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };

  const supabase = await createOperatorClient();

  const { data: category } = await supabase
    .from("categories")
    .select("name")
    .eq("id", parsed.data)
    .maybeSingle();

  if (!category) return { ok: false, message: "That category no longer exists." };

  // `head: true` asks for the count without the rows.
  const { count, error: countError } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("category_id", parsed.data);

  if (countError) {
    console.error("[admin] category usage check failed:", countError);
    return { ok: false, message: refusalMessage(countError, "Could not check what uses that category.") };
  }

  if ((count ?? 0) > 0) {
    const plural = count === 1 ? "product" : "products";
    return {
      ok: false,
      message: `${category.name} still holds ${count} ${plural}. Move them to another category first, or hide this one instead.`,
    };
  }

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", parsed.data);

  if (error) {
    console.error("[admin] category delete failed:", error);
    return { ok: false, message: refusalMessage(error, "The database refused that delete.") };
  }

  await revalidateCategories();
  return { ok: true, message: `${category.name} deleted.` };
}
