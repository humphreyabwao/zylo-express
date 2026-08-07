import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/catalog/catalog-page";
import { EditorialSplit } from "@/components/home/editorial-split";
import { SectionHeading } from "@/components/layout/section-heading";
import { Reveal } from "@/components/motion/reveal";

export const metadata: Metadata = {
  title: "Our Story",
  description:
    "Nine ateliers, four hundred hands, and a house that would rather make one thing properly than five quickly.",
  alternates: { canonical: "/about" },
};

const NUMBERS = [
  { value: "1984", label: "House founded" },
  { value: "9", label: "Ateliers" },
  { value: "412", label: "Artisans" },
  { value: "31", label: "Years, longest tenure" },
];

const PRINCIPLES = [
  {
    title: "The slower method, when it is the better one",
    body: "Vegetable tanning takes forty days against four hours for chrome. Hand-closing a cashmere seam takes thirty hours against thirty minutes on a machine. We choose the slow way when it changes how the object ages, and not to make a point.",
  },
  {
    title: "Repairable, or we do not make it",
    body: "Every shoe is resoleable. Every speaker cabinet opens. Every gold piece can be re-polished for life. An object that cannot be maintained is a temporary object, whatever it costs.",
  },
  {
    title: "The maker's name on the piece",
    body: "Each item carries the mark of the artisan who finished it, recorded in a register we have kept since the first workshop opened. It is an accountability device as much as a courtesy.",
  },
  {
    title: "Fewer things, made in smaller numbers",
    body: "Thirty-three products. Editions that are not repeated when they sell out. We have turned down every proposal to widen the range, because the constraint is what protects the standard.",
  },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative flex h-[52vh] min-h-80 items-end overflow-hidden lg:h-[62vh]">
        <Image
          src="/media/editorial/hands-of-the-maison.jpg"
          alt="Hands of the maison"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 scrim-bottom" aria-hidden />

        <div className="container-shell relative pb-12 lg:pb-16">
          <Breadcrumbs
            crumbs={[{ label: "Home", href: "/" }, { label: "Our Story" }]}
            tone="inverse"
          />
          <p className="eyebrow-sm mt-6 text-champagne">Since 1984</p>
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-light leading-[1.04] text-porcelain lg:text-display-md">
            A house built on the slower method
          </h1>
        </div>
      </section>

      {/* Opening */}
      <section className="container-shell py-section">
        <Reveal className="mx-auto max-w-3xl">
          <p className="font-display text-2xl font-light leading-relaxed lg:text-3xl">
            We began with one bag, one cutter, and a rule that has not changed:
            if the faster way makes a worse object in ten years, we do not take
            it.
          </p>
          <p className="mt-8 text-base font-light leading-loose text-muted-foreground">
            Forty years on, the house makes thirty-three things across nine
            ateliers in six countries. The pattern for the Aurelia has been
            altered twice — once to lengthen the handle by eleven millimetres,
            once to move an interior pocket. Everything else is as it was, and
            the cutter who made the first one trained the cutter who makes them
            now.
          </p>
          <p className="mt-6 text-base font-light leading-loose text-muted-foreground">
            We are not romantic about this. Slow is not automatically better —
            it is better when it changes the outcome, and we can usually tell
            you exactly how. That is what the journal is for.
          </p>
        </Reveal>

        <dl className="mx-auto mt-16 grid max-w-3xl grid-cols-2 gap-8 border-t border-hairline pt-12 sm:grid-cols-4">
          {NUMBERS.map((entry, index) => (
            <Reveal key={entry.label} delay={index * 70}>
              <div>
                <dt className="sr-only">{entry.label}</dt>
                <dd>
                  <span className="block font-display text-4xl font-light tabular-nums">
                    {entry.value}
                  </span>
                  <span className="mt-2 block eyebrow-sm text-muted-foreground">
                    {entry.label}
                  </span>
                </dd>
              </div>
            </Reveal>
          ))}
        </dl>
      </section>

      <EditorialSplit
        eyebrow="Savoir-faire"
        title="A third of every hide ends up on the floor"
        body={[
          "A hide is not a rectangle. The spine is dense and holds a fold; the belly is loose and will stretch out of shape within a season. A cutter's first job is to read the skin and decide what it can honestly become.",
          "There is a faster way. You cut the body in four pieces, seam the corners, and get three bags from a skin instead of one. It is not visibly worse for about two years — and then the seams begin to show at the corners, which is precisely where a bag takes its wear.",
        ]}
        image="/media/editorial/savoir-faire.jpg"
        imageAlt="Reading a hide before cutting"
        href="/journal/cutting-the-first-hide"
        linkLabel="Read the full story"
        tone="inverse"
      />

      {/* Principles */}
      <section id="savoir-faire" className="container-shell py-section">
        <SectionHeading
          eyebrow="How we work"
          title="Four rules, and no exceptions to them"
          align="left"
        />

        <ul className="mt-section-gap grid gap-x-12 gap-y-12 md:grid-cols-2">
          {PRINCIPLES.map((principle, index) => (
            <li key={principle.title}>
              <Reveal delay={(index % 2) * 80}>
                <div className="border-t border-hairline pt-8">
                  <span className="eyebrow-sm text-champagne-dark">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="mt-4 font-display text-2xl font-light leading-snug">
                    {principle.title}
                  </h3>
                  <p className="mt-4 text-sm font-light leading-relaxed text-muted-foreground lg:text-base">
                    {principle.body}
                  </p>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>
      </section>

      {/* Sustainability */}
      <section id="sustainability" className="border-t border-hairline bg-surface">
        <div className="container-shell py-section">
          <div className="grid gap-12 lg:grid-cols-2 lg:gap-20">
            <Reveal>
              <p className="eyebrow-sm text-champagne-dark">Sustainability</p>
              <h2 className="mt-5 max-w-lg font-display text-3xl font-light leading-[1.1] lg:text-4xl">
                The most sustainable object is the one you already own
              </h2>
            </Reveal>

            <Reveal delay={90}>
              <div className="space-y-5 text-sm font-light leading-loose text-muted-foreground lg:text-base">
                <p>
                  We do not publish a target for recycled content, because for
                  most of what we make it would be the wrong measure. A coat
                  that is worn for twenty years and then repaired has already
                  beaten any recycled alternative that is replaced four times.
                </p>
                <p>
                  What we do commit to: every piece is repairable and we hold
                  the parts; leather comes only from tanneries certified by the
                  Leather Working Group; gold is recycled or from certified
                  responsible sources; and packaging is paper, glass or
                  aluminium, with no mixed-material laminates.
                </p>
                <p>
                  We also publish what we have not solved. Shearling and boar
                  bristle are by-products of the food industry and we have found
                  no equivalent substitute. Air freight is used for same-day
                  courier and we have not eliminated it.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Careers */}
      <section id="careers" className="container-shell py-section">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow-sm text-champagne-dark">Careers</p>
          <h2 className="mt-6 font-display text-3xl font-light leading-[1.1] lg:text-4xl">
            We train people, and then we keep them
          </h2>
          <p className="mx-auto mt-6 max-w-lg text-sm font-light leading-relaxed text-muted-foreground lg:text-base">
            Our cutters spend two years on structured work before they are
            allowed near an unlined bag. The average tenure in the Florence
            atelier is nineteen years. If that is the kind of place you want to
            work, we would like to hear from you.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Button asChild size="lg">
              <Link href="/help/contact">Enquire about a role</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/journal">Read the journal</Link>
            </Button>
          </div>
        </Reveal>
      </section>
    </>
  );
}
