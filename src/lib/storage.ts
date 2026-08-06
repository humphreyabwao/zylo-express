import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

/**
 * Supabase Storage access.
 *
 * Two buckets:
 *   media         — public. Catalogue and editorial imagery, CDN-cached and
 *                   read by next/image.
 *   user-content  — private. Served through short-lived signed URLs.
 */

export const MEDIA_BUCKET = "media";
export const USER_BUCKET = "user-content";

/**
 * Resolves a stored object path to a public URL.
 *
 * Paths that already look absolute pass through untouched, which is what lets
 * the seed data's local `/media/...` files and Supabase-hosted objects coexist
 * during the migration.
 */
export function storageUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  if (path.startsWith("/")) return path;

  return `${env.supabaseUrl}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
}

/**
 * A time-limited URL for a private object.
 *
 * Used for anything under `user-content`. The default hour is long enough to
 * render a page and short enough that a leaked URL expires before it spreads.
 */
export async function signedUrl(
  path: string,
  expiresInSeconds = 3600
): Promise<string | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(USER_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error) {
    console.error("[storage] signed url failed:", error);
    return null;
  }
  return data.signedUrl;
}

/**
 * Hands the browser a one-shot upload token instead of proxying the bytes.
 *
 * The file never passes through the Next.js server, which keeps a serverless
 * function from having to buffer a 10MB image — and the token is scoped to
 * exactly this path, so it cannot be reused to overwrite anything else.
 *
 * The admin dashboard will call this; it is exposed now so that work is purely
 * additive later.
 */
export async function createUploadUrl(
  bucket: typeof MEDIA_BUCKET | typeof USER_BUCKET,
  path: string
): Promise<{ signedUrl: string; token: string; path: string } | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(path);

  if (error) {
    console.error("[storage] upload url failed:", error);
    return null;
  }
  return { signedUrl: data.signedUrl, token: data.token, path: data.path };
}

export async function uploadMedia(
  path: string,
  body: ArrayBuffer | Uint8Array | Blob,
  contentType: string
): Promise<string | null> {
  const supabase = createAdminClient();
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, body, { contentType, upsert: true, cacheControl: "31536000" });

  if (error) {
    console.error(`[storage] upload of ${path} failed:`, error);
    return null;
  }
  return storageUrl(path);
}

export async function deleteMedia(paths: string[]): Promise<boolean> {
  if (!paths.length) return true;

  const supabase = createAdminClient();
  const { error } = await supabase.storage.from(MEDIA_BUCKET).remove(paths);

  if (error) {
    console.error("[storage] delete failed:", error);
    return false;
  }
  return true;
}
