import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { getContentPages } from "@/lib/content";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/catalog/catalog-page";
import { Reveal } from "@/components/motion/reveal";

export const metadata: Metadata = {
  title: "Client Services",
  description:
    "Delivery, returns, payment, warranty and sizing — everything you may need to ask, answered plainly.",
  alternates: { canonical: "/help" },
};

const FAQS = [
  {
    q: "How long will my order take?",
    a: "Stocked pieces are dispatched the same working day if ordered before 12:00, and arrive in three to five business days. Made-to-order pieces state their lead time on the product page — expect three weeks for engraving and up to eleven for the cashmere coat.",
  },
  {
    q: "Can I return something I have worn?",
    a: "No. Returns must be unworn, unaltered and in their original packaging. A manufacturing fault, however, is a different matter entirely and is covered for the life of the piece.",
  },
  {
    q: "Do you ship outside the countries listed?",
    a: "We ship to ten countries at checkout. For anywhere else, write to a client advisor — we can usually arrange it, and we will confirm duties before taking payment.",
  },
  {
    q: "Is engraving reversible?",
    a: "It is not. The face is cut by hand with a graver, and the engraver will send a pencil rubbing for your approval before touching the gold. Engraved pieces are final sale.",
  },
  {
    q: "How do I look after vegetable-tanned leather?",
    a: "Mostly, use it. Keep it out of prolonged sun and away from alcohol and fragrance, and bring it to any boutique once a year for complimentary conditioning. It will darken — that is the material behaving correctly, not a fault.",
  },
  {
    q: "Can I book time with someone before buying?",
    a: "Yes, and we would prefer it for anything made to order. An hour in the boutique or by video, with the pieces brought to the camera one at a time.",
  },
];

export default async function HelpIndexPage() {
  const helpPages = await getContentPages("help");

  return (
    <>
      <section className="container-shell pb-12 pt-12 lg:pt-16">
        <Breadcrumbs
          crumbs={[{ label: "Home", href: "/" }, { label: "Client Services" }]}
        />
        <h1 className="mt-8 max-w-3xl font-display text-4xl font-light leading-[1.04] lg:text-display-md">
          Client Services
        </h1>
        <p className="mt-6 max-w-xl text-sm font-light leading-relaxed text-muted-foreground lg:text-base">
          Everything you may need to ask, answered plainly. If the answer is not
          here, a client advisor will reply within one business day.
        </p>
      </section>

      {/* Topics */}
      <section className="container-shell pb-16">
        <ul className="grid gap-px border border-hairline bg-hairline sm:grid-cols-2 lg:grid-cols-3">
          {[
            ...helpPages.map((p) => ({
              title: p.title,
              summary: p.summary,
              href: `/help/${p.slug}`,
            })),
            {
              title: "Contact Us",
              summary:
                "Write to a client advisor, or arrange a call at a time that suits you.",
              href: "/help/contact",
            },
          ].map((topic, index) => (
            <li key={topic.href} className="bg-background">
              <Reveal delay={index * 50}>
                <Link
                  href={topic.href}
                  className="group/topic flex h-full flex-col p-7 transition-colors duration-500 hover:bg-surface lg:p-9"
                >
                  <h2 className="font-display text-2xl font-light">
                    {topic.title}
                  </h2>
                  <p className="mt-3 flex-1 text-sm font-light leading-relaxed text-muted-foreground">
                    {topic.summary}
                  </p>
                  <ArrowRight
                    className="mt-6 size-4 text-champagne-dark transition-transform duration-600 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/topic:translate-x-1.5"
                    strokeWidth={1.25}
                  />
                </Link>
              </Reveal>
            </li>
          ))}
        </ul>
      </section>

      {/* FAQ */}
      <section className="border-t border-hairline bg-surface">
        <div className="container-shell py-section">
          <div className="grid gap-12 lg:grid-cols-[20rem_1fr] lg:gap-20">
            <div>
              <p className="eyebrow-sm text-champagne-dark">Frequently asked</p>
              <h2 className="mt-5 font-display text-3xl font-light leading-tight lg:text-4xl">
                The questions we are asked most
              </h2>
              <Button asChild variant="outline" className="mt-8">
                <Link href="/help/contact">Ask something else</Link>
              </Button>
            </div>

            <Accordion type="single" collapsible className="w-full">
              {FAQS.map((faq) => (
                <AccordionItem key={faq.q} value={faq.q}>
                  <AccordionTrigger tone="prose">{faq.q}</AccordionTrigger>
                  <AccordionContent>{faq.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>
    </>
  );
}
