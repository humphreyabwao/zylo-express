import "server-only";

import { createAnonymousClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { CacheTags, TTL, cached } from "@/lib/cache";
import { HELP_PAGES, LEGAL_PAGES, type ContentPage } from "@/data/content";
import type { ContentPageRow } from "@/lib/supabase/types";

/**
 * Storefront reads for CMS pages.
 *
 * `/help/[slug]` and `/legal/[slug]` served hard-coded copy from
 * `src/data/content.ts` while `content_pages` sat unused — the table existed,
 * had RLS policies, and was not even registered in the generated types, so
 * nothing could read or write it. The admin Pages module would have been a
 * form that edited rows no page rendered.
 *
 * ## The fallback is a feature, not scaffolding
 *
 * Same shape as `getCategories()` and `getJournal()` in `src/lib/catalog.ts`:
 * database first, bundled constants when there is nothing to read. That means
 * the storefront has legal copy on a fresh install, in a preview deployment
 * with no Supabase, and if the query fails — rather than serving an empty
 * Returns policy, which for legal pages specifically is worse than serving a
 * slightly stale one.
 *
 * The fallback is per *section*, not per page. Merging would mean a section
 * where three pages come from the database and one from the bundle, which is
 * the hardest state to reason about when the two disagree.
 */

/** The sections with a `[slug]` route behind them. */
const FALLBACK: Record<string, ContentPage[]> = {
  help: HELP_PAGES,
  legal: LEGAL_PAGES,
};

/** Row → the shape `ContentPage` components already render. */
function mapPage(row: ContentPageRow): ContentPage {
  return {
    slug: row.slug,
    title: row.title,
    eyebrow: row.eyebrow,
    summary: row.subtitle,
    // `updated` is displayed as "Last updated"; the row's own timestamp is
    // more honest than a hand-maintained date field would be.
    updated: row.updated_at.slice(0, 10),
    sections: row.body.map((section) => ({
      heading: section.heading,
      body: section.body,
      ...(section.facts?.length ? { facts: section.facts } : {}),
    })),
  };
}

/**
 * Every published page in a section, in display order.
 *
 * Returns the bundled copy when Supabase is unconfigured, when the query
 * fails, or when the section has no rows — see the note above on why that last
 * case falls back rather than returning empty.
 */
export async function getContentPages(section: string): Promise<ContentPage[]> {
  const fallback = FALLBACK[section] ?? [];

  if (!isSupabaseConfigured()) return fallback;

  return cached(
    `pages:${section}`,
    async () => {
      const supabase = createAnonymousClient();
      const { data, error } = await supabase
        .from("content_pages")
        .select("*")
        .eq("section", section)
        .eq("is_published", true)
        .order("position")
        .order("title");

      if (error) {
        console.error(`[content] page fetch failed for ${section}:`, error);
        return fallback;
      }

      const rows = data as ContentPageRow[];
      return rows.length > 0 ? rows.map(mapPage) : fallback;
    },
    { ttl: TTL.content, tags: [CacheTags.pages] }
  );
}

export async function getContentPage(
  section: string,
  slug: string
): Promise<ContentPage | undefined> {
  const pages = await getContentPages(section);
  return pages.find((page) => page.slug === slug);
}
