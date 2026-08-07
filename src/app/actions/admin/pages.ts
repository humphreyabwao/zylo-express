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
import { PAGE_SECTIONS, parseBody } from "@/lib/admin/content-body";

/**
 * Content page mutations.
 *
 * These rows back real storefront routes — `/help/[slug]` and `/legal/[slug]` —
 * so `section` is not a label, it is which route family the page belongs to.
 * Moving a page between sections changes its URL.
 *
 * ## Why the sections are a closed set
 *
 * A page whose section is `faq` would be saved happily and reachable from
 * nowhere: the routes are `/help/…` and `/legal/…`, and there is no
 * `/faq/[slug]` to render it. Constraining the field here means an operator
 * cannot create a page that exists and cannot be visited — which is a far more
 * confusing failure than being told the section is not one of two.
 *
 * `about` and `services` are in the schema's comment as intended sections but
 * have no `[slug]` route: they are single pages with their own components. So
 * they are not offered.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
}

const idSchema = z.string().uuid("That is not a valid page id.");

async function revalidatePages(
  section?: string | null,
  slug?: string | null,
  previous?: { section: string; slug: string } | null
) {
  await invalidateTags([
    CacheTags.pages,
    ...(slug ? [CacheTags.page(slug)] : []),
    ...(previous ? [CacheTags.page(previous.slug)] : []),
  ]);

  revalidatePath("/admin/pages");
  revalidatePath("/help");
  revalidatePath("/legal");
  if (section && slug) revalidatePath(`/${section}/${slug}`);
  if (previous && (previous.section !== section || previous.slug !== slug)) {
    revalidatePath(`/${previous.section}/${previous.slug}`);
  }
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
 * A page body: headings, paragraphs, and optional term/detail pairs.
 *
 * Validated structurally rather than accepted as free-form jsonb. The column
 * is `jsonb not null default '[]'`, which will take any shape at all — and the
 * storefront's `ContentPage` component reads `heading`, `body[]` and
 * `facts[].term`. A row that does not match renders as a blank section, which
 * is the failure this schema exists to prevent.
 */
const sectionSchema = z.object({
  heading: z.string().trim().min(1, "Every section needs a heading.").max(200),
  body: z.array(z.string().trim().max(4000)).max(50),
  facts: z
    .array(
      z.object({
        term: z.string().trim().min(1).max(120),
        detail: z.string().trim().min(1).max(600),
      })
    )
    .max(30)
    .optional(),
});

const pageFields = {
  title: z.string().trim().min(1, "A title is required.").max(200, "That title is too long."),
  slug: slugSchema,
  section: z.enum(PAGE_SECTIONS, {
    errorMap: () => ({ message: "Pick a section with a storefront route." }),
  }),
  eyebrow: z.string().trim().max(80, "Keep the eyebrow under 80 characters."),
  subtitle: z.string().trim().max(500, "Keep the summary under 500 characters."),
  body: z
    .string()
    .max(60_000, "That page is too long.")
    .transform(parseBody)
    .pipe(z.array(sectionSchema).max(40, "That is too many sections.")),
  seoTitle: z.string().trim().max(200).optional().default(""),
  seoDescription: z.string().trim().max(320).optional().default(""),
  position: z
    .number()
    .int("Position must be a whole number.")
    .min(0, "Position cannot be negative.")
    .max(32_767, "That position is too large."),
  isPublished: z.boolean(),
};

/* ----------------------------------------------------------------- create */

const createSchema = z.object(pageFields);

export async function createContentPage(input: unknown): Promise<ActionResult> {
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

  const { error } = await supabase.from("content_pages").insert({
    title: parsed.data.title,
    slug: parsed.data.slug,
    section: parsed.data.section,
    eyebrow: parsed.data.eyebrow,
    subtitle: parsed.data.subtitle,
    body: parsed.data.body,
    seo_title: parsed.data.seoTitle || null,
    seo_description: parsed.data.seoDescription || null,
    position: parsed.data.position,
    is_published: parsed.data.isPublished,
  });

  if (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        message: "That slug is already taken.",
        fieldErrors: { slug: "Another page already uses this slug." },
      };
    }
    console.error("[admin] page create failed:", error);
    return { ok: false, message: refusalMessage(error, "Could not create that page.") };
  }

  await revalidatePages(parsed.data.section, parsed.data.slug);
  return { ok: true, message: `${parsed.data.title} created.` };
}

/* ------------------------------------------------------------------- edit */

const updateSchema = z.object({ id: idSchema, ...pageFields });

export async function updateContentPage(input: unknown): Promise<ActionResult> {
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

  const { data: before } = await supabase
    .from("content_pages")
    .select("slug, section")
    .eq("id", parsed.data.id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("content_pages")
    .update({
      title: parsed.data.title,
      slug: parsed.data.slug,
      section: parsed.data.section,
      eyebrow: parsed.data.eyebrow,
      subtitle: parsed.data.subtitle,
      body: parsed.data.body,
      seo_title: parsed.data.seoTitle || null,
      seo_description: parsed.data.seoDescription || null,
      position: parsed.data.position,
      is_published: parsed.data.isPublished,
    })
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        message: "That slug is already taken.",
        fieldErrors: { slug: "Another page already uses this slug." },
      };
    }
    console.error("[admin] page update failed:", error);
    return { ok: false, message: refusalMessage(error, "Could not save those changes.") };
  }

  if (!data) return { ok: false, message: "That page no longer exists." };

  await revalidatePages(
    parsed.data.section,
    parsed.data.slug,
    before ? { section: before.section, slug: before.slug } : null
  );
  return { ok: true, message: "Page saved." };
}

/* --------------------------------------------------------- publish state */

export async function setPagePublished(
  pageId: string,
  isPublished: boolean
): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = idSchema.safeParse(pageId);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };

  const supabase = await createOperatorClient();
  const { data, error } = await supabase
    .from("content_pages")
    .update({ is_published: isPublished })
    .eq("id", parsed.data)
    .select("title, slug, section")
    .maybeSingle();

  if (error || !data) {
    console.error("[admin] page publish failed:", error);
    return {
      ok: false,
      message: refusalMessage(error, "Could not change that page's visibility."),
    };
  }

  await revalidatePages(data.section, data.slug);
  return {
    ok: true,
    message: `${data.title} ${isPublished ? "published" : "unpublished"}.`,
  };
}

/* ----------------------------------------------------------------- delete */

/**
 * Delete a page.
 *
 * Worth knowing: the storefront falls back to `src/data/content.ts` when the
 * database has no pages at all, so deleting the last one restores the built-in
 * copy rather than emptying /help. Deleting one of several simply removes it.
 */
export async function deleteContentPage(pageId: string): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = idSchema.safeParse(pageId);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };

  const supabase = await createOperatorClient();

  const { data: page } = await supabase
    .from("content_pages")
    .select("title, slug, section")
    .eq("id", parsed.data)
    .maybeSingle();

  if (!page) return { ok: false, message: "That page no longer exists." };

  const { error } = await supabase.from("content_pages").delete().eq("id", parsed.data);

  if (error) {
    console.error("[admin] page delete failed:", error);
    return { ok: false, message: refusalMessage(error, "The database refused that delete.") };
  }

  await revalidatePages(page.section, page.slug);
  return { ok: true, message: `${page.title} deleted.` };
}
