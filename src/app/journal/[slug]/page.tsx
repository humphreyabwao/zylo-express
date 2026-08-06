import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getArticleBySlug, getFeaturedProducts, getJournal } from "@/lib/catalog";
import { absoluteUrl, formatDate } from "@/lib/utils";
import { Breadcrumbs } from "@/components/catalog/catalog-page";
import { SectionHeading } from "@/components/layout/section-heading";
import { ProductRail } from "@/components/commerce/product-rail";
import { Reveal } from "@/components/motion/reveal";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const articles = await getJournal();
  return articles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) return { title: "Not found" };

  return {
    title: article.title,
    description: article.excerpt,
    alternates: { canonical: `/journal/${article.slug}` },
    openGraph: {
      type: "article",
      title: `${article.title} · ZYLO`,
      description: article.excerpt,
      publishedTime: new Date(article.publishedAt).toISOString(),
      authors: [article.author],
      images: [article.image.url],
    },
  };
}

export default async function ArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) notFound();

  const featured = await getFeaturedProducts(8);

  const more = (await getJournal())
    .filter((a) => a.slug !== slug)
    .slice(0, 3);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.excerpt,
    image: absoluteUrl(article.image.url),
    datePublished: new Date(article.publishedAt).toISOString(),
    author: { "@type": "Person", name: article.author },
    publisher: { "@type": "Organization", name: "ZYLO" },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article>
        <div className="container-shell pt-12 lg:pt-16">
          <Breadcrumbs
            crumbs={[
              { label: "Home", href: "/" },
              { label: "Journal", href: "/journal" },
              { label: article.title },
            ]}
          />
        </div>

        <header className="container-shell py-10 lg:py-14">
          <div className="mx-auto max-w-3xl text-center">
            <p className="eyebrow-sm text-champagne-dark">{article.kicker}</p>
            <h1 className="mt-6 font-display text-4xl font-light leading-[1.05] lg:text-display-md">
              {article.title}
            </h1>
            <p className="mt-8 eyebrow-sm text-muted-foreground">
              {article.author} ·{" "}
              {formatDate(article.publishedAt, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}{" "}
              · {article.readingMinutes} min read
            </p>
          </div>
        </header>

        <div className="relative aspect-3/2 w-full overflow-hidden bg-secondary lg:aspect-[21/9]">
          <Image
            src={article.image.url}
            alt={article.image.alt}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>

        <div className="container-shell py-16 lg:py-24">
          {/* Reading column keeps a wider inset than the shell's mobile
              gutter, which is tuned for imagery rather than prose. */}
          <div className="mx-auto max-w-2xl px-2 sm:px-0">
            {article.body.map((paragraph, index) => (
              <Reveal key={paragraph.slice(0, 24)} delay={index * 60}>
                <p
                  className={
                    index === 0
                      ? "font-display text-xl font-light leading-relaxed text-foreground lg:text-2xl"
                      : "mt-7 text-base font-light leading-loose text-muted-foreground"
                  }
                >
                  {paragraph}
                </p>
              </Reveal>
            ))}

            <div className="mt-14 border-t border-hairline pt-8">
              <p className="eyebrow-sm text-muted-foreground">
                Written by {article.author}
              </p>
            </div>
          </div>
        </div>
      </article>

      {/* More reading */}
      <section className="border-t border-hairline bg-surface">
        <div className="container-shell py-section">
          <SectionHeading
            eyebrow="Continue reading"
            title="More from the journal"
            link={{ href: "/journal", label: "All articles" }}
          />

          <ul className="mt-14 grid gap-x-8 gap-y-12 md:grid-cols-3">
            {more.map((entry, index) => (
              <li key={entry.slug}>
                <Reveal delay={index * 80}>
                  <Link
                    href={`/journal/${entry.slug}`}
                    className="media-zoom group/more block"
                  >
                    <div className="relative aspect-3/2 w-full overflow-hidden bg-background">
                      <Image
                        src={entry.image.url}
                        alt={entry.image.alt}
                        fill
                        sizes="(min-width: 768px) 31vw, 100vw"
                        className="object-cover"
                      />
                    </div>
                    <p className="eyebrow-sm mt-5 text-champagne-dark">
                      {entry.kicker}
                    </p>
                    <h3 className="mt-2.5 font-display text-xl font-light leading-snug transition-opacity duration-500 group-hover/more:opacity-70">
                      {entry.title}
                    </h3>
                  </Link>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="container-shell py-section">
        <SectionHeading
          eyebrow="From the collection"
          title="Pieces mentioned in the journal"
          link={{ href: "/shop", label: "Shop all" }}
        />
        <div className="mt-14">
          <ProductRail products={featured} />
        </div>
      </section>
    </>
  );
}
