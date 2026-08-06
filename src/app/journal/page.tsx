import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { getJournal } from "@/lib/catalog";
import { formatDate } from "@/lib/utils";
import { Breadcrumbs } from "@/components/catalog/catalog-page";
import { Reveal } from "@/components/motion/reveal";

export const metadata: Metadata = {
  title: "The Journal",
  description:
    "Notes from the workshop floor — what we make, how long it takes, and why the slower method is usually the cheaper one over thirty years.",
  alternates: { canonical: "/journal" },
};

export default function JournalIndexPage() {
  const [lead, ...rest] = getJournal();

  return (
    <>
      <section className="container-shell pb-12 pt-12 lg:pt-16">
        <Breadcrumbs
          crumbs={[{ label: "Home", href: "/" }, { label: "Journal" }]}
        />
        <h1 className="mt-8 max-w-3xl font-display text-4xl font-light leading-[1.04] lg:text-display-md">
          The Journal
        </h1>
        <p className="mt-6 max-w-xl text-sm font-light leading-relaxed text-muted-foreground lg:text-base">
          Notes from the workshop floor. What we make, how long it takes, and
          why the slower method is usually the cheaper one over thirty years.
        </p>
      </section>

      {/* Lead article */}
      <section className="container-shell pb-16">
        <Reveal>
          <Link
            href={`/journal/${lead.slug}`}
            className="media-zoom group/lead grid gap-8 lg:grid-cols-2 lg:items-center lg:gap-16"
          >
            <div className="relative aspect-3/2 w-full overflow-hidden bg-secondary">
              <Image
                src={lead.image.url}
                alt={lead.image.alt}
                fill
                priority
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
              />
            </div>

            <div>
              <p className="eyebrow-sm text-champagne-dark">{lead.kicker}</p>
              <h2 className="mt-4 font-display text-3xl font-light leading-[1.1] transition-opacity duration-500 group-hover/lead:opacity-70 lg:text-5xl">
                {lead.title}
              </h2>
              <p className="mt-5 max-w-lg text-sm font-light leading-relaxed text-muted-foreground lg:text-base">
                {lead.excerpt}
              </p>
              <p className="mt-6 eyebrow-sm text-muted-foreground">
                {lead.author} ·{" "}
                {formatDate(lead.publishedAt, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}{" "}
                · {lead.readingMinutes} min read
              </p>
            </div>
          </Link>
        </Reveal>
      </section>

      {/* The rest */}
      <section className="container-shell pb-section">
        <ul className="grid gap-x-8 gap-y-14 border-t border-hairline pt-14 md:grid-cols-2 lg:grid-cols-3">
          {rest.map((article, index) => (
            <li key={article.slug}>
              <Reveal delay={(index % 3) * 80}>
                <Link
                  href={`/journal/${article.slug}`}
                  className="media-zoom group/article block"
                >
                  <div className="relative aspect-3/2 w-full overflow-hidden bg-secondary">
                    <Image
                      src={article.image.url}
                      alt={article.image.alt}
                      fill
                      sizes="(min-width: 1024px) 31vw, (min-width: 768px) 46vw, 100vw"
                      className="object-cover"
                    />
                  </div>

                  <p className="eyebrow-sm mt-5 text-champagne-dark">
                    {article.kicker}
                  </p>
                  <h3 className="mt-2.5 font-display text-2xl font-light leading-snug transition-opacity duration-500 group-hover/article:opacity-70">
                    {article.title}
                  </h3>
                  <p className="mt-3 text-sm font-light leading-relaxed text-muted-foreground">
                    {article.excerpt}
                  </p>
                  <p className="mt-4 eyebrow-sm text-muted-foreground">
                    {formatDate(article.publishedAt, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}{" "}
                    · {article.readingMinutes} min
                  </p>
                </Link>
              </Reveal>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
