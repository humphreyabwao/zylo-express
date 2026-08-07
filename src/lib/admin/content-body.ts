/**
 * The content-page body format, and the sections that have a route.
 *
 * Deliberately not in `src/app/actions/admin/pages.ts`: every export from a
 * `"use server"` module must be an async Server Action, so a plain constant or
 * a pure function there is a build error. These are needed on both sides — the
 * action validates with them, the editor round-trips with them — so they live
 * in a module both can import.
 *
 * No `server-only` marker for the same reason: the editing form is a Client
 * Component and calls `serialiseBody` to fill its textarea.
 */

export interface ContentSectionShape {
  heading: string;
  body: string[];
  facts?: { term: string; detail: string }[];
}

/**
 * The sections with a storefront route behind them.
 *
 * A page filed under anything else would save happily and be reachable from
 * nowhere — the routes are `/help/[slug]` and `/legal/[slug]`, and there is no
 * third. `about` and `services` appear in the schema's comment as intended
 * sections but are single pages with their own components, not slug routes, so
 * they are not offered.
 */
export const PAGE_SECTIONS = ["help", "legal"] as const;

export type PageSection = (typeof PAGE_SECTIONS)[number];

/**
 * Text → sections.
 *
 * One section per `## Heading` line, paragraphs separated by blank lines, and
 * a block whose every line reads `- Term: detail` becomes that section's facts
 * list rather than prose.
 *
 * A structured block editor would be better and is a much larger piece of
 * work. This is lossless for the copy that exists in `src/data/content.ts`,
 * which is what matters for getting that copy into the database without
 * anybody retyping it.
 */
export function parseBody(source: string): ContentSectionShape[] {
  const sections: ContentSectionShape[] = [];
  let current: ContentSectionShape | null = null;

  for (const rawBlock of source.split(/\n\s*\n/)) {
    const block = rawBlock.trim();
    if (!block) continue;

    if (block.startsWith("##")) {
      const heading = block.match(/^##\s+(.+)$/m);
      current = { heading: heading?.[1]?.trim() ?? "", body: [], facts: [] };
      sections.push(current);

      // A heading block may carry its first paragraph on the following lines.
      const rest = block.split("\n").slice(1).join("\n").trim();
      if (rest) current.body.push(rest.replace(/\s*\n\s*/g, " "));
      continue;
    }

    // Text before the first heading has nowhere to go; give it an untitled
    // section rather than dropping it silently.
    if (!current) {
      current = { heading: "", body: [], facts: [] };
      sections.push(current);
    }

    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const factLines = lines.filter((line) => /^-\s+[^:]+:/.test(line));

    if (factLines.length > 0 && factLines.length === lines.length) {
      for (const line of factLines) {
        const match = line.match(/^-\s+([^:]+):\s*(.+)$/);
        if (match) {
          current.facts!.push({
            term: match[1]!.trim(),
            detail: match[2]!.trim(),
          });
        }
      }
      continue;
    }

    current.body.push(block.replace(/\s*\n\s*/g, " "));
  }

  // An empty `facts` array round-trips as `facts: []`, which renders an empty
  // list container on the storefront. Dropping it keeps the stored shape
  // identical to the hand-written fallback data.
  return sections.map((section) => ({
    ...section,
    facts: section.facts && section.facts.length > 0 ? section.facts : undefined,
  }));
}

/** Sections → text, for loading a stored row back into the editor. */
export function serialiseBody(sections: ContentSectionShape[]): string {
  return sections
    .map((section) => {
      const parts: string[] = [];
      if (section.heading) parts.push(`## ${section.heading}`);
      parts.push(...section.body);
      if (section.facts?.length) {
        parts.push(
          section.facts.map((fact) => `- ${fact.term}: ${fact.detail}`).join("\n")
        );
      }
      return parts.join("\n\n");
    })
    .join("\n\n");
}
