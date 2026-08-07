import Image from "next/image";
import Link from "next/link";

import type { Collection } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/motion/reveal";
import { SectionHeading } from "@/components/layout/section-heading";

/**
 * Deliberately asymmetric: the first card runs tall across two rows so the
 * grid reads as an editorial spread rather than a product listing.
 */
export function CollectionGrid({ collections }: { collections: Collection[] }) {
  const [lead, ...rest] = collections;
  if (!lead) return null;

  return (
    <section className="container-shell py-section">
      <SectionHeading
        eyebrow="Curation"
        title="Edits from the house"
        description="Six ways of looking at the same workshop — grouped by material, by discipline, or by how long a thing takes to make."
        link={{ href: "/collections", label: "All collections" }}
      />

      <div className="mt-section-gap grid gap-x-6 gap-y-10 md:grid-cols-2 lg:grid-cols-3 lg:gap-x-8">
        <Reveal className="md:row-span-2">
          <CollectionCard collection={lead} tall priority />
        </Reveal>

        {rest.slice(0, 4).map((collection, index) => (
          <Reveal key={collection.slug} delay={(index + 1) * 80}>
            <CollectionCard collection={collection} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function CollectionCard({
  collection,
  tall = false,
  priority = false,
}: {
  collection: Collection;
  tall?: boolean;
  priority?: boolean;
}) {
  return (
    <Link
      href={`/collections/${collection.slug}`}
      className="media-zoom group/col block h-full focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      <div
        className={cn(
          "relative w-full overflow-hidden bg-secondary",
          tall ? "aspect-3/4 lg:h-[calc(100%-7rem)]" : "aspect-4/3"
        )}
      >
        <Image
          src={collection.image.url}
          alt={collection.image.alt}
          fill
          priority={priority}
          sizes={
            tall
              ? "(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
              : "(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
          }
          className="object-cover"
        />
        <div className="absolute inset-0 bg-obsidian/10 transition-colors duration-700 group-hover/col:bg-obsidian/0" />
      </div>

      <div className="pt-5">
        <p className="eyebrow-sm text-champagne-dark">{collection.tagline}</p>
        <h3
          className={cn(
            "mt-2.5 font-display font-light leading-tight",
            tall ? "text-3xl lg:text-4xl" : "text-2xl"
          )}
        >
          {collection.name}
        </h3>
        {tall && (
          <p className="mt-3 max-w-md text-sm font-light leading-relaxed text-muted-foreground">
            {collection.description}
          </p>
        )}
      </div>
    </Link>
  );
}
