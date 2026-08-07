import Image from "next/image";
import Link from "next/link";

import type { EditorialArticle } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { Reveal } from "@/components/motion/reveal";
import { SectionHeading } from "@/components/layout/section-heading";

export function JournalPreview({
  articles,
}: {
  articles: EditorialArticle[];
}) {
  return (
    <section className="container-shell py-section">
      <SectionHeading
        eyebrow="The Journal"
        title="Notes from the workshop floor"
        description="What we make, how long it takes, and why the slower method is usually the cheaper one over thirty years."
        link={{ href: "/journal", label: "Read the journal" }}
      />

      <ul className="mt-section-gap grid gap-x-8 gap-y-12 md:grid-cols-3">
        {articles.map((article, index) => (
          <li key={article.slug}>
            <Reveal delay={index * 90}>
              <Link
                href={`/journal/${article.slug}`}
                className="media-zoom group/article block focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-ring"
              >
                <div className="relative aspect-3/2 w-full overflow-hidden bg-secondary">
                  <Image
                    src={article.image.url}
                    alt={article.image.alt}
                    fill
                    sizes="(min-width: 768px) 31vw, 100vw"
                    className="object-cover"
                  />
                </div>

                <p className="eyebrow-sm mt-5 text-champagne-dark">
                  {article.kicker}
                </p>
                <h3 className="mt-2.5 font-display text-2xl font-light leading-snug transition-opacity duration-500 group-hover/article:opacity-70">
                  {article.title}
                </h3>
                <p className="mt-3 line-clamp-2 text-sm font-light leading-relaxed text-muted-foreground">
                  {article.excerpt}
                </p>
                <p className="mt-4 eyebrow-sm text-muted-foreground">
                  {formatDate(article.publishedAt, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {" · "}
                  {article.readingMinutes} min read
                </p>
              </Link>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
