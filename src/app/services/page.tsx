import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/catalog/catalog-page";
import { Reveal } from "@/components/motion/reveal";

export const metadata: Metadata = {
  title: "Services",
  description:
    "Appointments, monogramming, repair and restoration, watch servicing and gifting — the work that continues after the sale.",
  alternates: { canonical: "/services" },
};

const SERVICES = [
  {
    id: "appointments",
    eyebrow: "By invitation",
    title: "Private appointments",
    body: [
      "An hour in the boutique with a client advisor and no one else in it, or by video with the pieces brought to the camera one at a time.",
      "Appointments are the right way to buy anything made to order — sizing, engraving proofs and lead times are all settled in the room rather than over three emails.",
    ],
    facts: [
      "60 minutes, no charge",
      "Paris · London · New York · Tokyo",
      "Video appointments in English, French and Japanese",
    ],
    image: "/media/editorial/the-atelier.jpg",
    cta: { href: "/services/appointments", label: "Request an appointment" },
  },
  {
    id: "monogramming",
    eyebrow: "Made personal",
    title: "Monogramming & engraving",
    body: [
      "Leather is hot-stamped in foil or blind-embossed. Gold is cut by hand with a graver — no lasers — and the engraver sends a pencil rubbing for approval before touching the piece.",
      "Allow one week for leather and three for gold. Engraved and monogrammed pieces are final sale, which is why we take the approval step seriously.",
    ],
    facts: [
      "Up to three characters on leather",
      "Hand-engraving on gold, from $180",
      "Pencil proof supplied before cutting",
    ],
    image: "/media/editorial/the-gold-standard.jpg",
    cta: { href: "/category/fine-jewellery", label: "Shop engravable pieces" },
  },
  {
    id: "repair",
    eyebrow: "For the life of the piece",
    title: "Repair & restoration",
    body: [
      "Every shoe we make is resoleable, every bag can be re-stitched, and every gold piece can be re-polished. We hold the parts and the patterns for everything we have ever sold.",
      "Manufacturing faults are corrected at no charge for the life of the piece. Wear and accident are quoted first, and we will tell you honestly when a repair is not worth the money.",
    ],
    facts: [
      "Complimentary leather conditioning, annually",
      "Resoling from $220, 4–6 weeks",
      "Complimentary re-polishing on gold, for life",
    ],
    image: "/media/editorial/hands-of-the-maison.jpg",
    cta: { href: "/help/contact", label: "Arrange a repair" },
  },
  {
    id: "servicing",
    eyebrow: "Mechanical care",
    title: "Watch & electronics servicing",
    body: [
      "Mechanical movements are serviced every five to seven years — stripped, cleaned, re-lubricated and regulated across five positions before they come back to you.",
      "Headphone pads, speaker drivers and turntable belts are all user-replaceable and stocked indefinitely. We would rather sell you a $14 belt than a new turntable.",
    ],
    facts: [
      "Full movement service, 6–8 weeks",
      "Five-position regulation on return",
      "Spare parts held indefinitely",
    ],
    image: "/media/collections/timepieces.jpg",
    cta: { href: "/help/warranty", label: "Read the warranty" },
  },
  {
    id: "gifting",
    eyebrow: "Presented properly",
    title: "Gift wrapping",
    body: [
      "A lacquered box, grosgrain ribbon and a card written by hand in the boutique — at no charge, on every order, whether or not you ask.",
      "Add a message at checkout and it is transcribed rather than printed. Prices are never included in a gift parcel.",
    ],
    facts: [
      "Complimentary on every order",
      "Hand-written card, up to 280 characters",
      "No prices enclosed",
    ],
    image: "/media/collections/maison.jpg",
    cta: { href: "/shop", label: "Find a gift" },
  },
];

export default function ServicesPage() {
  return (
    <>
      <section className="container-shell pb-12 pt-12 lg:pt-16">
        <Breadcrumbs
          crumbs={[{ label: "Home", href: "/" }, { label: "Services" }]}
        />
        <h1 className="mt-8 max-w-3xl font-display text-4xl font-light leading-[1.04] lg:text-display-md">
          The work that continues after the sale
        </h1>
        <p className="mt-6 max-w-xl text-sm font-light leading-relaxed text-muted-foreground lg:text-base">
          Appointments, personalisation, repair and servicing. Most of it costs
          nothing, because a piece that stays in use is the point of making it
          this way.
        </p>

        <nav aria-label="Services" className="mt-10">
          <ul className="flex flex-wrap gap-x-8 gap-y-3">
            {SERVICES.map((service) => (
              <li key={service.id}>
                <a
                  href={`#${service.id}`}
                  className="link-draw eyebrow-sm text-muted-foreground hover:text-foreground"
                >
                  {service.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </section>

      {SERVICES.map((service, index) => (
        <section
          key={service.id}
          id={service.id}
          className={
            index % 2 === 1
              ? "scroll-mt-28 border-y border-hairline bg-surface"
              : "scroll-mt-28"
          }
        >
          <div className="container-shell grid items-center gap-10 py-16 lg:grid-cols-2 lg:gap-20 lg:py-24">
            <Reveal
              variant="fade"
              className={index % 2 === 1 ? "lg:order-2" : ""}
            >
              <div className="media-zoom relative aspect-4/3 w-full overflow-hidden bg-secondary">
                <Image
                  src={service.image}
                  alt={service.title}
                  fill
                  sizes="(min-width: 1024px) 46vw, 100vw"
                  className="object-cover"
                />
              </div>
            </Reveal>

            <Reveal className={index % 2 === 1 ? "lg:order-1" : ""}>
              <p className="eyebrow-sm text-champagne-dark">
                {service.eyebrow}
              </p>
              <h2 className="mt-5 font-display text-3xl font-light leading-[1.1] lg:text-4xl">
                {service.title}
              </h2>

              <div className="mt-6 space-y-4 text-sm font-light leading-relaxed text-muted-foreground lg:text-base">
                {service.body.map((paragraph) => (
                  <p key={paragraph.slice(0, 24)}>{paragraph}</p>
                ))}
              </div>

              <ul className="mt-8 space-y-2.5 border-t border-hairline pt-6">
                {service.facts.map((fact) => (
                  <li
                    key={fact}
                    className="flex gap-3 text-sm font-light text-foreground"
                  >
                    <span
                      className="mt-2 size-1 shrink-0 rounded-full bg-champagne-dark"
                      aria-hidden
                    />
                    {fact}
                  </li>
                ))}
              </ul>

              <Button asChild className="mt-8">
                <Link href={service.cta.href}>{service.cta.label}</Link>
              </Button>
            </Reveal>
          </div>
        </section>
      ))}
    </>
  );
}
