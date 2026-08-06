import Image from "next/image";
import Link from "next/link";

import type { Category } from "@/lib/types";
import { Reveal } from "@/components/motion/reveal";
import { SectionHeading } from "@/components/layout/section-heading";

export function CategoryStrip({ categories }: { categories: Category[] }) {
  return (
    <section className="container-shell py-section">
      <SectionHeading
        eyebrow="The house"
        title="Eight disciplines, one workshop"
        align="center"
      />

      <ul className="mt-14 grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-4 lg:gap-x-8">
        {categories.map((category, index) => (
          <li key={category.slug}>
            <Reveal delay={index * 60}>
              <Link
                href={`/category/${category.slug}`}
                className="media-zoom group/cat block text-center focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-ring"
              >
                <div className="relative aspect-4/5 w-full overflow-hidden bg-secondary">
                  <Image
                    src={`/media/collections/${category.slug}.jpg`}
                    alt={category.name}
                    fill
                    sizes="(min-width: 768px) 22vw, 45vw"
                    className="object-cover"
                  />
                </div>
                <h3 className="mt-4 eyebrow-sm text-foreground transition-opacity duration-500 group-hover/cat:opacity-60">
                  {category.name}
                </h3>
              </Link>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
