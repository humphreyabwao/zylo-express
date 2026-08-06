import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { BOUTIQUES } from "@/data/content";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/catalog/catalog-page";
import { Reveal } from "@/components/motion/reveal";

export const metadata: Metadata = {
  title: "Boutiques",
  description:
    "Paris, London, New York and Tokyo — addresses, opening hours and the services offered at each.",
  alternates: { canonical: "/boutiques" },
};

export default function BoutiquesPage() {
  return (
    <>
      <section className="container-shell pb-12 pt-12 lg:pt-16">
        <Breadcrumbs
          crumbs={[{ label: "Home", href: "/" }, { label: "Boutiques" }]}
        />
        <h1 className="mt-8 max-w-3xl font-display text-4xl font-light leading-[1.04] lg:text-display-md">
          Four rooms, four cities
        </h1>
        <p className="mt-6 max-w-xl text-sm font-light leading-relaxed text-muted-foreground lg:text-base">
          Every boutique carries the full collection and can arrange engraving,
          repair and made-to-order fittings. An appointment is not required, but
          it is the better way to visit.
        </p>
      </section>

      <section className="container-shell pb-section">
        <ul className="grid gap-x-8 gap-y-16 md:grid-cols-2">
          {BOUTIQUES.map((boutique, index) => (
            <li key={boutique.city}>
              <Reveal delay={(index % 2) * 80}>
                <article>
                  <div className="media-zoom relative aspect-3/2 w-full overflow-hidden bg-secondary">
                    <Image
                      src={boutique.image}
                      alt={`${boutique.city} boutique`}
                      fill
                      priority={index < 2}
                      sizes="(min-width: 768px) 46vw, 100vw"
                      className="object-cover"
                    />
                  </div>

                  <h2 className="mt-6 font-display text-3xl font-light">
                    {boutique.city}
                  </h2>

                  <address className="mt-4 text-sm font-light not-italic leading-relaxed text-muted-foreground">
                    {boutique.street}
                    <br />
                    {boutique.region}
                    <br />
                    <a
                      href={`tel:${boutique.phone.replace(/\s/g, "")}`}
                      className="link-draw mt-2 inline-block text-foreground"
                    >
                      {boutique.phone}
                    </a>
                  </address>

                  <dl className="mt-6 space-y-4 border-t border-hairline pt-5">
                    <div>
                      <dt className="eyebrow-sm text-muted-foreground">
                        Hours
                      </dt>
                      <dd className="mt-2 space-y-0.5 text-sm font-light">
                        {boutique.hours.map((line) => (
                          <p key={line}>{line}</p>
                        ))}
                      </dd>
                    </div>
                    <div>
                      <dt className="eyebrow-sm text-muted-foreground">
                        Services
                      </dt>
                      <dd className="mt-2 text-sm font-light">
                        {boutique.services.join(" · ")}
                      </dd>
                    </div>
                  </dl>

                  <Button asChild variant="outline" className="mt-7">
                    <Link href="/services#appointments">
                      Book in {boutique.city}
                    </Link>
                  </Button>
                </article>
              </Reveal>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-hairline bg-surface">
        <div className="container-shell py-section">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="eyebrow-sm text-champagne-dark">Not nearby?</p>
            <h2 className="mt-6 font-display text-3xl font-light leading-[1.1] lg:text-4xl">
              We will bring the boutique to the camera
            </h2>
            <p className="mx-auto mt-6 max-w-lg text-sm font-light leading-relaxed text-muted-foreground lg:text-base">
              A video appointment runs the same hour, with the pieces brought to
              the lens one at a time and an advisor who can answer for how each
              was made.
            </p>
            <Button asChild size="lg" className="mt-10">
              <Link href="/help/contact">Arrange a video appointment</Link>
            </Button>
          </Reveal>
        </div>
      </section>
    </>
  );
}
