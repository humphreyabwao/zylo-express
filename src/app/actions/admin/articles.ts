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
 * Journal mutations.
 *
 * Same two rules as the rest of this directory: authorise before parsing, and
 * write through the RLS-bound operator client so `is_admin()` is what actually
 * authorises.
 *
 * ## Publishing is two fields, not one
 *
 * `is_published` is the switch the RLS read policy checks; `published_at` is
 * the date the storefront sorts and displays. Setting the first without
 * thinking about the second is how an article written today appears at the
 * bottom of the journal, below a piece from March.
 *
 * A future `published_at` on a published article is a schedule: the row is
 * live in the database, `getJournal()` orders by that date descending, and the
 * piece simply sits ahead of "now" until the clock catches up. That is a real
 * scheduling mechanism rather than a pretend one, but it is worth knowing that
 * the article *is* readable by anyone who guesses its URL in the meantime —
 * the policy is `using (is_published)`, and it has no date clause.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
}

const idSchema = z.string().uuid("That is not a valid article id.");

async function revalidateJournal(slug?: string | null, previousSlug?: string | null) {
  await invalidateTags([
    CacheTags.articles,
    ...(slug ? [CacheTags.article(slug)] : []),
    ...(previousSlug ? [CacheTags.article(previousSlug)] : []),
  ]);

  revalidatePath("/admin/journal");
  revalidatePath("/journal");
  // The homepage carries a journal preview.
  revalidatePath("/");
  if (slug) revalidatePath(`/journal/${slug}`);
  if (previousSlug && previousSlug !== slug) {
    revalidatePath(`/journal/${previousSlug}`);
  }
}

async function authorise(): Promise<ActionResult | null> {
  try {
    await requireAdminAction({ module: "journal" });
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

/** Mirrors `articles_slug_format` in migration 3. */
const slugSchema = z
  .string()
  .trim()
  .min(1, "A slug is required.")
  .max(100, "That slug is too long.")
  .regex(
    /^[a-z0-9]+(-[a-z0-9]+)*$/,
    "Lowercase letters, numbers and single hyphens only."
  );

/**
 * The body arrives as one textarea and is stored as `text[]`, one entry per
 * paragraph. Splitting on blank lines rather than newlines means a writer can
 * wrap a line without accidentally creating a paragraph.
 */
const bodySchema = z
  .string()
  .transform((value) =>
    value
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim().replace(/\s*\n\s*/g, " "))
      .filter(Boolean)
  )
  .pipe(
    z
      .array(z.string().max(4000, "That paragraph is too long."))
      .max(200, "That is too many paragraphs.")
  );

const articleFields = {
  title: z.string().trim().min(1, "A title is required.").max(200, "That title is too long."),
  slug: slugSchema,
  kicker: z.string().trim().max(80, "Keep the kicker under 80 characters."),
  excerpt: z.string().trim().max(400, "Keep the excerpt under 400 characters."),
  body: bodySchema,
  imageUrl: z.string().trim().max(500, "That path is too long."),
  imageAlt: z.string().trim().max(200, "Keep the description under 200 characters."),
  author: z.string().trim().min(1, "An author is required.").max(120, "That name is too long."),
  readingMinutes: z
    .number()
    .int("Reading time must be a whole number.")
    .min(1, "Reading time must be at least a minute.")
    .max(120, "That reading time is implausible."),
  isPublished: z.boolean(),
  /** ISO 8601, from a `datetime-local` input. */
  publishedAt: z
    .string()
    .trim()
    .min(1, "A publication date is required.")
    .refine((value) => !Number.isNaN(Date.parse(value)), "That date is not valid."),
};

/* ----------------------------------------------------------------- create */

const createSchema = z.object(articleFields);

export async function createArticle(input: unknown): Promise<ActionResult> {
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

  const { error } = await supabase.from("articles").insert({
    title: parsed.data.title,
    slug: parsed.data.slug,
    kicker: parsed.data.kicker,
    excerpt: parsed.data.excerpt,
    body: parsed.data.body,
    image_url: parsed.data.imageUrl || null,
    image_alt: parsed.data.imageAlt,
    author: parsed.data.author,
    reading_minutes: parsed.data.readingMinutes,
    is_published: parsed.data.isPublished,
    published_at: new Date(parsed.data.publishedAt).toISOString(),
  });

  if (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        message: "That slug is already taken.",
        fieldErrors: { slug: "Another article already uses this slug." },
      };
    }
    console.error("[admin] article create failed:", error);
    return { ok: false, message: refusalMessage(error, "Could not create that article.") };
  }

  await revalidateJournal(parsed.data.slug);
  return { ok: true, message: `${parsed.data.title} created.` };
}

/* ------------------------------------------------------------------- edit */

const updateSchema = z.object({ id: idSchema, ...articleFields });

export async function updateArticle(input: unknown): Promise<ActionResult> {
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

  // The old slug, read before the write: if it changed, the storefront's
  // cached page for the previous URL has to be dropped too, and afterwards
  // there is no record of what it was.
  const { data: before } = await supabase
    .from("articles")
    .select("slug")
    .eq("id", parsed.data.id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("articles")
    .update({
      title: parsed.data.title,
      slug: parsed.data.slug,
      kicker: parsed.data.kicker,
      excerpt: parsed.data.excerpt,
      body: parsed.data.body,
      image_url: parsed.data.imageUrl || null,
      image_alt: parsed.data.imageAlt,
      author: parsed.data.author,
      reading_minutes: parsed.data.readingMinutes,
      is_published: parsed.data.isPublished,
      published_at: new Date(parsed.data.publishedAt).toISOString(),
    })
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        message: "That slug is already taken.",
        fieldErrors: { slug: "Another article already uses this slug." },
      };
    }
    console.error("[admin] article update failed:", error);
    return { ok: false, message: refusalMessage(error, "Could not save those changes.") };
  }

  if (!data) return { ok: false, message: "That article no longer exists." };

  await revalidateJournal(parsed.data.slug, before?.slug);
  return { ok: true, message: "Article saved." };
}

/* --------------------------------------------------------- publish state */

export async function setArticlePublished(
  articleId: string,
  isPublished: boolean
): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = idSchema.safeParse(articleId);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };

  const supabase = await createOperatorClient();
  const { data, error } = await supabase
    .from("articles")
    .update({ is_published: isPublished })
    .eq("id", parsed.data)
    .select("title, slug")
    .maybeSingle();

  if (error || !data) {
    console.error("[admin] article publish failed:", error);
    return {
      ok: false,
      message: refusalMessage(error, "Could not change that article's visibility."),
    };
  }

  await revalidateJournal(data.slug);
  return {
    ok: true,
    message: `${data.title} ${isPublished ? "published" : "moved to drafts"}.`,
  };
}

/* -------------------------------------------------------------- duplicate */

/**
 * Copy an article into a new draft.
 *
 * The journal's pieces share a house structure — kicker, excerpt, a run of
 * paragraphs — so starting from the last one is usually faster than starting
 * from nothing. The copy is always unpublished and dated now, because a
 * duplicate inheriting "published" would put an unfinished draft on the
 * storefront the moment it was created.
 */
export async function duplicateArticle(articleId: string): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = idSchema.safeParse(articleId);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };

  const supabase = await createOperatorClient();

  const { data: source } = await supabase
    .from("articles")
    .select("*")
    .eq("id", parsed.data)
    .maybeSingle();

  if (!source) return { ok: false, message: "That article no longer exists." };

  // A short random suffix rather than "-copy": duplicating twice would collide
  // on the fixed form, and the slug is unique.
  const suffix = Math.random().toString(36).slice(2, 6);

  const { error } = await supabase.from("articles").insert({
    title: `${source.title} (copy)`,
    slug: `${source.slug}-${suffix}`.slice(0, 100),
    kicker: source.kicker,
    excerpt: source.excerpt,
    body: source.body,
    image_url: source.image_url,
    image_alt: source.image_alt,
    author: source.author,
    reading_minutes: source.reading_minutes,
    is_published: false,
    published_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[admin] article duplicate failed:", error);
    return { ok: false, message: refusalMessage(error, "Could not duplicate that article.") };
  }

  await revalidateJournal();
  return { ok: true, message: "Duplicated as a draft." };
}

/* ----------------------------------------------------------------- delete */

export async function deleteArticle(articleId: string): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = idSchema.safeParse(articleId);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };

  const supabase = await createOperatorClient();

  const { data: article } = await supabase
    .from("articles")
    .select("title, slug")
    .eq("id", parsed.data)
    .maybeSingle();

  if (!article) return { ok: false, message: "That article no longer exists." };

  const { error } = await supabase.from("articles").delete().eq("id", parsed.data);

  if (error) {
    console.error("[admin] article delete failed:", error);
    return { ok: false, message: refusalMessage(error, "The database refused that delete.") };
  }

  await revalidateJournal(article.slug);
  return { ok: true, message: `${article.title} deleted.` };
}
