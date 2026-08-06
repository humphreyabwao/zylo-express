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
    await requireAdminAction();
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
    return { ok: false, message: "The upload finished but could not be saved." };
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
    return { ok: false, message: "Could not save that description." };
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
    return { ok: false, message: "The database refused that delete." };
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
