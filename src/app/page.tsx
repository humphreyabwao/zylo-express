import Link from "next/link";

import {
  getCategories,
  getFeaturedCollections,
  getFeaturedProducts,
  getJournal,
  getNewArrivals,
} from "@/lib/catalog";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/layout/section-heading";
import { ProductRail } from "@/components/commerce/product-rail";
import { Reveal } from "@/components/motion/reveal";
import { Hero } from "@/components/home/hero";
import { HouseMarquee } from "@/components/home/house-marquee";
import { CollectionGrid } from "@/components/home/collection-grid";
import { EditorialSplit } from "@/components/home/editorial-split";
import { CategoryStrip } from "@/components/home/category-strip";
import { JournalPreview } from "@/components/home/journal-preview";
import { Assurances } from "@/components/home/assurances";

export default function HomePage() {
  const collections = getFeaturedCollections();
  const featured = getFeaturedProducts(8);
  const newArrivals = getNewArrivals(8);
  const categories = getCategories();
  const journal = getJournal().slice(0, 3);

  return (
    <>
      <Hero />
      <HouseMarquee />

      {/* Featured */}
      <section className="container-shell py-section">
        <SectionHeading
          eyebrow="Selected"
          title="The pieces we would choose"
          description="Eight objects that show what the workshop can do — the icons, and the ones that take longest."
          link={{ href: "/collections/all", label: "Shop all" }}
        />
        <div className="mt-14">
          <ProductRail products={featured} />
        </div>
      </section>

      <CollectionGrid collections={collections} />

      <EditorialSplit
        eyebrow="Savoir-faire"
        title="Thirty hours of hand-sewing, and no lining at all"
        body={[
          "Double-faced cashmere is two cloths woven as one, then split by hand along the seam allowance so the edges can be closed invisibly. There is no lining because there is no wrong side.",
          "It is the most expensive way to make a coat and the only one where the garment's lifespan is set by the fibre rather than by the construction. Ours comes from a mill outside Biella that has been weaving cashmere since 1663.",
        ]}
        image="/media/editorial/savoir-faire.jpg"
        imageAlt="Hand-closing a double-faced cashmere seam"
        href="/journal/a-coat-for-a-decade"
        linkLabel="Read the story"
        stat={[
          { value: "30h", label: "Hand-sewing" },
          { value: "780g", label: "Cloth weight" },
          { value: "1663", label: "Mill founded" },
        ]}
      />

      {/* New arrivals */}
      <section className="border-y border-hairline bg-surface">
        <div className="container-shell py-section">
          <SectionHeading
            eyebrow="Just arrived"
            title="New to the maison"
            link={{ href: "/collections/new-in", label: "See everything new" }}
          />
          <div className="mt-14">
            <ProductRail products={newArrivals} />
          </div>
        </div>
      </section>

      <CategoryStrip categories={categories} />

      <EditorialSplit
        eyebrow="The atelier"
        title="A third of every hide ends up on the floor"
        body={[
          "A hide is not a rectangle. The spine is dense and holds a fold; the belly is loose and will stretch out of shape within a season. A cutter's first job is to read the skin and decide what it can honestly become.",
          "On the Aurelia we cut the body from a single panel so the grain runs unbroken around the corners. That constraint rules out most of the skin — and it is the reason the corners still look right in ten years.",
        ]}
        image="/media/editorial/the-atelier.jpg"
        imageAlt="Cutting leather in the atelier"
        href="/journal/cutting-the-first-hide"
        linkLabel="Inside the workshop"
        flip
        tone="inverse"
        stat={[
          { value: "40", label: "Days in the pit" },
          { value: "1946", label: "Tannery founded" },
          { value: "1", label: "Artisan per bag" },
        ]}
      />

      <JournalPreview articles={journal} />

      {/* Appointment invitation */}
      <section className="border-t border-hairline bg-surface">
        <div className="container-shell py-section">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="eyebrow-sm text-champagne-dark">By invitation</p>
            <h2 className="mt-6 font-display text-4xl font-light leading-[1.06] lg:text-display-md">
              An hour, a boutique,
              <br />
              <span className="italic">and no one else in it</span>
            </h2>
            <p className="mx-auto mt-6 max-w-lg text-sm font-light leading-relaxed text-muted-foreground lg:text-base">
              Private appointments in Paris, London, New York and Tokyo — or by
              video, with the pieces brought to the camera one at a time.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Button asChild size="lg">
                <Link href="/services#appointments">Book an appointment</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/boutiques">Find a boutique</Link>
              </Button>
            </div>
          </Reveal>
        </div>
      </section>

      <Assurances />
    </>
  );
}
