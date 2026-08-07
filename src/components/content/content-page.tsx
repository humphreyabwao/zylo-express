import Link from "next/link";

import type { ContentPage as ContentPageData } from "@/data/content";
import { formatDate } from "@/lib/utils";
import { Breadcrumbs, type Crumb } from "@/components/catalog/catalog-page";
import { Reveal } from "@/components/motion/reveal";

interface ContentPageProps {
  page: ContentPageData;
  crumbs: Crumb[];
  /** Sibling documents, rendered as a sticky index on desktop. */
  siblings?: { label: string; href: string }[];
  activeHref?: string;
}

export function ContentPage({
  page,
  crumbs,
  siblings = [],
  activeHref,
}: ContentPageProps) {
  return (
    <>
      <section className="container-shell pt-12 lg:pt-16">
        <Breadcrumbs crumbs={crumbs} />
        <p className="eyebrow-sm mt-8 text-champagne-dark">{page.eyebrow}</p>
        <h1 className="mt-4 max-w-3xl font-display text-4xl font-light leading-[1.04] lg:text-display-md">
          {page.title}
        </h1>
        <p className="mt-6 max-w-2xl text-sm font-light leading-relaxed text-muted-foreground lg:text-base">
          {page.summary}
        </p>
      </section>

      <section className="container-shell py-14 lg:py-20">
        <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[15rem_1fr]">
          {siblings.length > 0 ? (
            <aside className="lg:sticky lg:top-28 lg:h-fit">
              <h2 className="eyebrow-sm mb-5 text-muted-foreground">
                In this section
              </h2>
              <ul className="space-y-3.5">
                {siblings.map((sibling) => (
                  <li key={sibling.href}>
                    <Link
                      href={sibling.href}
                      aria-current={
                        sibling.href === activeHref ? "page" : undefined
                      }
                      className={
                        sibling.href === activeHref
                          ? "text-sm font-light text-foreground"
                          : "link-draw text-sm font-light text-muted-foreground hover:text-foreground"
                      }
                    >
                      {sibling.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>
          ) : (
            <div className="hidden lg:block" />
          )}

          {/* Wider inset than the shell's mobile gutter — that one is tuned
              for imagery, this column is for reading. */}
          <div className="min-w-0 max-w-2xl px-2 sm:px-0">
            {page.sections.map((section, index) => (
              <Reveal key={section.heading} delay={index * 60}>
                <section
                  className={
                    index === 0 ? "" : "mt-14 border-t border-hairline pt-14"
                  }
                >
                  <h2 className="font-display text-2xl font-light">
                    {section.heading}
                  </h2>

                  {section.body.map((paragraph) => (
                    <p
                      key={paragraph.slice(0, 24)}
                      className="mt-5 text-sm font-light leading-loose text-muted-foreground lg:text-base"
                    >
                      {paragraph}
                    </p>
                  ))}

                  {section.facts && (
                    <dl className="mt-8 divide-y divide-hairline border-y border-hairline">
                      {section.facts.map((fact) => (
                        <div
                          key={fact.term}
                          className="flex flex-col gap-1.5 py-4 sm:flex-row sm:gap-8"
                        >
                          <dt className="eyebrow-sm shrink-0 text-foreground sm:w-48">
                            {fact.term}
                          </dt>
                          <dd className="text-sm font-light leading-relaxed text-muted-foreground">
                            {fact.detail}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </section>
              </Reveal>
            ))}

            <p className="mt-section-gap border-t border-hairline pt-8 eyebrow-sm text-muted-foreground">
              Last updated {formatDate(page.updated)}
            </p>

            <div className="mt-10 border border-hairline p-6 lg:p-8">
              <h2 className="font-display text-xl font-light">
                Still need a hand?
              </h2>
              <p className="mt-3 text-sm font-light leading-relaxed text-muted-foreground">
                A client advisor will answer within one business day, or the
                same day if you write before 16:00.
              </p>
              <Link
                href="/help/contact"
                className="link-draw mt-5 inline-block eyebrow-sm text-foreground"
              >
                Contact client services
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
