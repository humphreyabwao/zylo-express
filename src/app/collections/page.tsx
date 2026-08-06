import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { getCategories, getCollections } from "@/lib/catalog";
import { Breadcrumbs } from "@/components/catalog/catalog-page";
import { Reveal } from "@/components/motion/reveal";
import { SectionHeading } from "@/components/layout/section-heading";

export const metadata: Metadata = {
  title: "Collections",
  description:
    "Curated edits and the eight disciplines of the house — leather goods, timepieces, fine jewellery, fragrance, ready-to-wear, footwear, eyewear and objects for the home.",
  alternates: { canonical: "/collections" },
};

export default async function CollectionsIndexPage() {
  const [collections, categories] = await Promise.all([
    getCollections(),
    getCategories(),
  ]);

  return (
    <>
      <section className="container-shell pb-12 pt-12 lg:pt-16">
        <Breadcrumbs
          crumbs={[{ label: "Home", href: "/" }, { label: "Collections" }]}
        />
        <h1 className="mt-8 max-w-3xl font-display text-4xl font-light leading-[1.04] lg:text-display-md">
          Edits from the house
        </h1>
        <p className="mt-6 max-w-xl text-sm font-light leading-relaxed text-muted-foreground lg:text-base">
          Six ways of looking at the same workshop — grouped by material, by
          discipline, or simply by how long a thing takes to make.
        </p>
      </section>

      <section className="container-shell pb-section">
        <ul className="grid gap-x-6 gap-y-14 md:grid-cols-2 lg:gap-x-8">
          {collections.map((collection, index) => (
            <li key={collection.slug}>
              <Reveal delay={(index % 2) * 90}>
                <Link
                  href={`/collections/${collection.slug}`}
                  className="media-zoom group/col block focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-ring"
                >
                  <div className="relative aspect-3/2 w-full overflow-hidden bg-secondary">
                    <Image
                      src={collection.image.url}
                      alt={collection.image.alt}
                      fill
                      priority={index < 2}
                      sizes="(min-width: 768px) 46vw, 100vw"
                      className="object-cover"
                    />
                  </div>

                  <p className="eyebrow-sm mt-6 text-champagne-dark">
                    {collection.tagline}
                  </p>
                  <h2 className="mt-3 font-display text-3xl font-light leading-tight">
                    {collection.name}
                  </h2>
                  <p className="mt-4 max-w-lg text-sm font-light leading-relaxed text-muted-foreground">
                    {collection.description}
                  </p>
                </Link>
              </Reveal>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-hairline bg-surface">
        <div className="container-shell py-section">
          <SectionHeading
            eyebrow="By discipline"
            title="Eight things the workshop knows how to do"
            align="left"
          />

          <ul className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((category, index) => (
              <li key={category.slug}>
                <Reveal delay={index * 50}>
                  <Link
                    href={`/category/${category.slug}`}
                    className="group/cat block"
                  >
                    <h3 className="font-display text-2xl font-light transition-opacity duration-500 group-hover/cat:opacity-60">
                      {category.name}
                    </h3>
                    <p className="mt-3 text-sm font-light leading-relaxed text-muted-foreground">
                      {category.description}
                    </p>
                    <span className="mt-5 inline-block h-px w-8 origin-left bg-champagne-dark transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/cat:scale-x-[2.5]" />
                  </Link>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
