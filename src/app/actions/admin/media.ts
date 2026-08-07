"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { z } from "zod";

import {
  AdminAuthorizationError,
  createOperatorClient,
  requireAdminAction,
} from "@/lib/admin/guard";
import { CacheTags, invalidateTags } from "@/lib/cache";
import { MEDIA_BUCKET, createUploadUrl, deleteMedia } from "@/lib/storage";
import { refusalMessage } from "@/lib/admin/errors";

/**
 * Product imagery.
 *
 * ## How a file gets uploaded without a key in the browser
 *
 * The bytes go straight from the browser to Supabase Storage, but the browser
 * is never given a Supabase key. Instead:
 *
 *   1. the browser asks this action for permission to write one specific path
 *   2. the server authorises, decides the path, and mints a signed upload URL
 *      that is valid for that path and nothing else
 *   3. the browser PUTs the file to that URL
 *   4. the browser calls `attachProductImage` to record the row
 *
 * The alternative — posting the file to a Server Action — does not work at any
 * useful size: action bodies are capped at 1MB by default and the media bucket
 * accepts 10MB. Proxying the bytes through a route handler would work but
 * makes a serverless function buffer every upload for no gain in safety, since
 * the signed URL is already scoped to a single path.
 *
 * Step 4 failing leaves an orphaned object in the bucket. That is the
 * deliberate trade: an unreferenced file costs storage, whereas a row pointing
 * at a file that was never uploaded renders as a broken image on the
 * storefront. Orphans are recoverable by sweeping the bucket against
 * `product_images`; a broken product page is seen by customers.
 */

export interface MediaResult {
  ok: boolean;
  message: string;
}

/** Mirrors the bucket's own `allowed_mime_types` — see migration 5. */
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
] as const;

/** Mirrors the bucket's `file_size_limit`. Checked here for a better error. */
const MAX_BYTES = 10 * 1024 * 1024;

const EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

async function authorise(): Promise<MediaResult | null> {
  try {
    await requireAdminAction({ module: "media" });
    return null;
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

async function revalidateProduct(slug?: string | null) {
  await invalidateTags([
    CacheTags.products,
    ...(slug ? [CacheTags.product(slug)] : []),
  ]);
  revalidatePath("/admin/products");
  if (slug) revalidatePath(`/products/${slug}`);
}

/* ----------------------------------------------------------------- upload */

const uploadSchema = z.object({
  productId: z.string().uuid("That is not a valid product id."),
  contentType: z.enum(ALLOWED_TYPES, {
    errorMap: () => ({ message: "Use a JPEG, PNG, WebP or AVIF image." }),
  }),
  size: z
    .number()
    .int()
    .positive()
    .max(MAX_BYTES, "Images must be 10MB or smaller."),
});

export interface UploadTicket extends MediaResult {
  uploadUrl?: string;
  token?: string;
  path?: string;
  bucket?: string;
}

/**
 * Mint a one-shot upload URL.
 *
 * The path is decided here, never taken from the client. A caller-supplied
 * path — even a sanitised one — is a caller-supplied path, and the whole point
 * of signing is that the server chose what may be written. The random suffix
 * also means two operators uploading `front.jpg` seconds apart do not
 * overwrite one another.
 */
export async function createProductImageUpload(input: {
  productId: string;
  contentType: string;
  size: number;
}): Promise<UploadTicket> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]!.message };
  }

  const supabase = await createOperatorClient();
  const { data: product } = await supabase
    .from("products")
    .select("slug")
    .eq("id", parsed.data.productId)
    .maybeSingle();

  if (!product) return { ok: false, message: "That product no longer exists." };

  const extension = EXTENSION[parsed.data.contentType] ?? "jpg";
  const path = `products/${product.slug}-${randomBytes(6).toString("hex")}.${extension}`;

  const ticket = await createUploadUrl(MEDIA_BUCKET, path);
  if (!ticket) {
    return { ok: false, message: "Could not start the upload. Try again." };
  }

  return {
    ok: true,
    message: "Ready to upload.",
    uploadUrl: ticket.signedUrl,
    token: ticket.token,
    path: ticket.path,
    bucket: MEDIA_BUCKET,
  };
}

/* ----------------------------------------------------------------- attach */

const attachSchema = z.object({
  productId: z.string().uuid(),
  path: z
    .string()
    .trim()
    .min(1)
    // The path must be one this server minted. Anchoring it to the products/
    // prefix stops a crafted call from pointing a catalogue row at an object
    // elsewhere in the bucket.
    .regex(/^products\/[A-Za-z0-9._-]+$/, "Unrecognised upload path."),
  alt: z.string().trim().max(200),
  // Measured in the browser. Bounded rather than trusted: these drive the
  // `next/image` aspect ratio, and a nonsense value is a broken layout.
  width: z.number().int().min(1).max(10_000),
  height: z.number().int().min(1).max(10_000),
});

export async function attachProductImage(input: unknown): Promise<MediaResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = attachSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]!.message };
  }

  const supabase = await createOperatorClient();

  const { data: product } = await supabase
    .from("products")
    .select("slug")
    .eq("id", parsed.data.productId)
    .maybeSingle();

  if (!product) return { ok: false, message: "That product no longer exists." };

  // Append. Reordering is its own operation, and a new upload landing in the
  // middle of a curated sequence is never what was meant.
  const { data: last } = await supabase
    .from("product_images")
    .select("position")
    .eq("product_id", parsed.data.productId)
    .order("position", { ascending: false })
    .limit(1);

  const nextPosition = (last?.[0]?.position ?? -1) + 1;

  const { error } = await supabase.from("product_images").insert({
    product_id: parsed.data.productId,
    storage_path: parsed.data.path,
    alt: parsed.data.alt,
    width: parsed.data.width,
    height: parsed.data.height,
    position: nextPosition,
  });

  if (error) {
    console.error("[admin] image attach failed:", error);
    return { ok: false, message: refusalMessage(error, "The upload finished but could not be saved.") };
  }

  await revalidateProduct(product.slug);
  return { ok: true, message: "Image added." };
}

/* ------------------------------------------------------------------- edit */

const altSchema = z.object({
  imageId: z.string().uuid(),
  alt: z.string().trim().max(200),
});

/**
 * Alt text.
 *
 * Worth a dedicated action rather than being folded into the product form:
 * it is the one field here that is an accessibility obligation, and burying it
 * two dialogs deep is how it ends up empty on every image.
 */
export async function updateImageAlt(input: unknown): Promise<MediaResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = altSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]!.message };
  }

  const supabase = await createOperatorClient();
  const { data, error } = await supabase
    .from("product_images")
    .update({ alt: parsed.data.alt })
    .eq("id", parsed.data.imageId)
    .select("product_id")
    .maybeSingle();

  if (error || !data) {
    console.error("[admin] alt update failed:", error);
    return { ok: false, message: refusalMessage(error, "Could not save that description.") };
  }

  const { data: product } = await supabase
    .from("products")
    .select("slug")
    .eq("id", data.product_id)
    .maybeSingle();

  await revalidateProduct(product?.slug);
  return { ok: true, message: "Description saved." };
}

/* ----------------------------------------------------------------- delete */

/**
 * Remove an image, row and object both.
 *
 * Row first. If the storage delete then fails the result is an orphaned file —
 * invisible, costing only storage. The other order risks a row pointing at an
 * object that is already gone, which the storefront renders as a broken image.
 *
 * Variants referencing this image are handled by the schema:
 * `product_variants.image_id` is `on delete set null`, so they fall back to
 * the product's first image rather than breaking.
 */
export async function deleteProductImage(imageId: string): Promise<MediaResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = z.string().uuid().safeParse(imageId);
  if (!parsed.success) return { ok: false, message: "That is not a valid image." };

  const supabase = await createOperatorClient();

  const { data: image } = await supabase
    .from("product_images")
    .select("storage_path, product_id")
    .eq("id", parsed.data)
    .maybeSingle();

  if (!image) return { ok: false, message: "That image no longer exists." };

  const { error } = await supabase
    .from("product_images")
    .delete()
    .eq("id", parsed.data);

  if (error) {
    console.error("[admin] image delete failed:", error);
    return { ok: false, message: refusalMessage(error, "The database refused that delete.") };
  }

  // Seeded imagery lives under /public/media and is referenced by an absolute
  // path; there is no storage object to remove for those.
  if (!image.storage_path.startsWith("/")) {
    await deleteMedia([image.storage_path]);
  }

  const { data: product } = await supabase
    .from("products")
    .select("slug")
    .eq("id", image.product_id)
    .maybeSingle();

  await revalidateProduct(product?.slug);
  return { ok: true, message: "Image removed." };
}

/* ---------------------------------------------------------------- reorder */

const reorderSchema = z.object({
  productId: z.string().uuid(),
  orderedIds: z.array(z.string().uuid()).min(1).max(50),
});

/**
 * Set the display order.
 *
 * Position 0 is the product's primary image — the one on every card, in the
 * cart, and on the order confirmation — so this is merchandising, not
 * housekeeping.
 *
 * Writes the whole sequence rather than swapping a pair. Postgres has no
 * deferred uniqueness to lean on here, and a partial reorder that fails
 * halfway leaves an order nobody chose; sending the full list means the worst
 * case is the previous order, intact.
 */
export async function reorderProductImages(input: unknown): Promise<MediaResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "That reorder was not valid." };
  }

  const supabase = await createOperatorClient();

  const { data: owned } = await supabase
    .from("product_images")
    .select("id")
    .eq("product_id", parsed.data.productId);

  const ownedIds = new Set((owned ?? []).map((row) => row.id));
  if (
    ownedIds.size !== parsed.data.orderedIds.length ||
    !parsed.data.orderedIds.every((id) => ownedIds.has(id))
  ) {
    // The list is stale, or is trying to reposition another product's images.
    return { ok: false, message: "That list is out of date. Refresh and retry." };
  }

  const results = await Promise.all(
    parsed.data.orderedIds.map((id, position) =>
      supabase.from("product_images").update({ position }).eq("id", id)
    )
  );

  if (results.some((result) => result.error)) {
    console.error("[admin] reorder failed:", results.find((r) => r.error)?.error);
    return { ok: false, message: "Could not save the new order." };
  }

  const { data: product } = await supabase
    .from("products")
    .select("slug")
    .eq("id", parsed.data.productId)
    .maybeSingle();

  await revalidateProduct(product?.slug);
  return { ok: true, message: "Order saved." };
}

/* -------------------------------------------------------------------------- */
/*                              media library                                 */
/* -------------------------------------------------------------------------- */

/**
 * The library is bucket-first.
 *
 * Everything above is *product* imagery: an upload that exists to become a
 * `product_images` row. The operations below work on the bucket itself, where
 * an object may have no row at all — a campaign plate, an editorial still, or
 * the residue of an upload whose attach step failed.
 *
 * That distinction is the whole reason the library is worth having. A file
 * nothing references is invisible everywhere else in the portal, costs storage
 * forever, and is indistinguishable from a file that is load-bearing until
 * something joins the two together.
 */

/** Prefixes the library is allowed to write to and delete from. */
const LIBRARY_PREFIXES = ["products", "collections", "campaign", "editorial"] as const;

/**
 * Anchors any caller-supplied path to a known prefix and a safe filename.
 *
 * The same reasoning as `attachSchema` above, generalised: a path is the one
 * input here that decides *what gets destroyed*, so it is validated against a
 * fixed shape rather than sanitised. No `..`, no leading slash, no nesting —
 * one of four prefixes and a flat filename.
 */
const libraryPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(300)
  .regex(
    new RegExp(`^(${LIBRARY_PREFIXES.join("|")})/[A-Za-z0-9._-]+$`),
    "Unrecognised media path."
  );

/* ------------------------------------------------------------ library upload */

const libraryUploadSchema = z.object({
  prefix: z.enum(LIBRARY_PREFIXES, {
    errorMap: () => ({ message: "Unknown media folder." }),
  }),
  filename: z
    .string()
    .trim()
    .min(1, "The file needs a name.")
    .max(120, "That filename is too long."),
  contentType: z.enum(ALLOWED_TYPES, {
    errorMap: () => ({ message: "Use a JPEG, PNG, WebP or AVIF image." }),
  }),
  size: z
    .number()
    .int()
    .positive()
    .max(MAX_BYTES, "Images must be 10MB or smaller."),
});

/**
 * Mint an upload URL for a file that is not (yet) attached to anything.
 *
 * The filename is used only as a *stem* — it is slugified and given a random
 * suffix, so the server still decides the final path. Keeping a recognisable
 * stem matters here in a way it does not for product uploads: an operator
 * browsing a bucket of `a3f9c2.jpg` cannot find anything.
 */
export async function createLibraryUpload(input: {
  prefix: string;
  filename: string;
  contentType: string;
  size: number;
}): Promise<UploadTicket> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = libraryUploadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]!.message };
  }

  const extension = EXTENSION[parsed.data.contentType] ?? "jpg";

  const stem =
    parsed.data.filename
      .replace(/\.[^.]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "image";

  const path = `${parsed.data.prefix}/${stem}-${randomBytes(4).toString("hex")}.${extension}`;

  const ticket = await createUploadUrl(MEDIA_BUCKET, path);
  if (!ticket) {
    return { ok: false, message: "Could not start the upload. Try again." };
  }

  return {
    ok: true,
    message: "Ready to upload.",
    uploadUrl: ticket.signedUrl,
    token: ticket.token,
    path: ticket.path,
    bucket: MEDIA_BUCKET,
  };
}

/** Called once the bytes have landed, so the library reflects them at once. */
export async function finaliseLibraryUpload(path: string): Promise<MediaResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = libraryPathSchema.safeParse(path);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };

  revalidatePath("/admin/media");
  return { ok: true, message: "Upload complete." };
}

/* ------------------------------------------------------------ library delete */

/**
 * Delete an object from the bucket.
 *
 * Refuses while a `product_images` row still points at it. This is the mirror
 * of `deleteProductImage`, which removes the row and then the object: here
 * there is no row to remove, so deleting anyway would leave one behind
 * pointing at nothing — a broken image on a live product page, which is the
 * exact failure the ordering in `deleteProductImage` exists to avoid.
 *
 * Detaching is a product-level decision, so the refusal names the product
 * rather than offering to cascade.
 */
export async function deleteLibraryAsset(path: string): Promise<MediaResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = libraryPathSchema.safeParse(path);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };

  const supabase = await createOperatorClient();

  const { data: attached, error: lookupError } = await supabase
    .from("product_images")
    .select("id, products(name)")
    .eq("storage_path", parsed.data)
    .maybeSingle();

  if (lookupError) {
    console.error("[admin] media usage check failed:", lookupError);
    return { ok: false, message: refusalMessage(lookupError, "Could not check what uses that file.") };
  }

  if (attached) {
    const owner =
      (attached as unknown as { products: { name: string } | null }).products?.name ??
      "a product";
    return {
      ok: false,
      message: `That file is still in use by ${owner}. Remove it from the product first.`,
    };
  }

  const removed = await deleteMedia([parsed.data]);
  if (!removed) {
    return { ok: false, message: "Storage refused that delete." };
  }

  revalidatePath("/admin/media");
  return { ok: true, message: "File deleted." };
}

/**
 * Delete every unreferenced object in one pass.
 *
 * Sweeping orphans one click at a time is how they stop being swept. The paths
 * are re-checked against `product_images` here rather than trusted from the
 * client, because the list the operator saw may be seconds old and an image
 * attached in between must not be deleted on the strength of a stale screen.
 */
export async function deleteOrphanedAssets(paths: string[]): Promise<MediaResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = z.array(libraryPathSchema).min(1).max(100).safeParse(paths);
  if (!parsed.success) {
    return { ok: false, message: "That selection was not valid." };
  }

  const supabase = await createOperatorClient();

  const { data: attached, error } = await supabase
    .from("product_images")
    .select("storage_path")
    .in("storage_path", parsed.data);

  if (error) {
    console.error("[admin] orphan sweep check failed:", error);
    return { ok: false, message: refusalMessage(error, "Could not check what is still in use.") };
  }

  const inUse = new Set((attached ?? []).map((row) => row.storage_path));
  const removable = parsed.data.filter((path) => !inUse.has(path));

  if (removable.length === 0) {
    return { ok: false, message: "Every one of those files is still in use." };
  }

  const removed = await deleteMedia(removable);
  if (!removed) return { ok: false, message: "Storage refused that delete." };

  revalidatePath("/admin/media");

  const skipped = parsed.data.length - removable.length;
  return {
    ok: true,
    message:
      skipped > 0
        ? `Deleted ${removable.length}. Skipped ${skipped} still in use.`
        : `Deleted ${removable.length} unused ${removable.length === 1 ? "file" : "files"}.`,
  };
}

/* ------------------------------------------------------------ library attach */

const libraryAttachSchema = z.object({
  productId: z.string().uuid("That is not a valid product id."),
  path: libraryPathSchema,
  alt: z.string().trim().max(200),
});

/**
 * Attach an existing bucket object to a product.
 *
 * This is what turns an orphan back into imagery, and it is the reason the
 * library is more than a delete button: a campaign plate uploaded for one
 * purpose is frequently the right photograph for a product page, and
 * re-uploading it to get a second copy is how a bucket doubles in size.
 *
 * Dimensions are not measured here — there is no browser in the loop. The
 * schema defaults on `product_images` (1200×1500) apply, and the operator can
 * correct them from the product's own image manager if the aspect is wrong.
 */
export async function attachLibraryAsset(input: unknown): Promise<MediaResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = libraryAttachSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]!.message };
  }

  const supabase = await createOperatorClient();

  const { data: product } = await supabase
    .from("products")
    .select("slug")
    .eq("id", parsed.data.productId)
    .maybeSingle();

  if (!product) return { ok: false, message: "That product no longer exists." };

  const { data: existing } = await supabase
    .from("product_images")
    .select("id")
    .eq("storage_path", parsed.data.path)
    .maybeSingle();

  if (existing) {
    return { ok: false, message: "That file is already attached to a product." };
  }

  const { data: last } = await supabase
    .from("product_images")
    .select("position")
    .eq("product_id", parsed.data.productId)
    .order("position", { ascending: false })
    .limit(1);

  const { error } = await supabase.from("product_images").insert({
    product_id: parsed.data.productId,
    storage_path: parsed.data.path,
    alt: parsed.data.alt,
    position: (last?.[0]?.position ?? -1) + 1,
  });

  if (error) {
    console.error("[admin] library attach failed:", error);
    return { ok: false, message: refusalMessage(error, "Could not attach that file.") };
  }

  await revalidateProduct(product.slug);
  revalidatePath("/admin/media");
  return { ok: true, message: "Attached to product." };
}
