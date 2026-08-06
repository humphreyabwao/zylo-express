import type { Metadata } from "next";
import Link from "next/link";

import { HELP_PAGES } from "@/data/content";
import { Breadcrumbs } from "@/components/catalog/catalog-page";
import { ContactForm } from "@/components/content/contact-form";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Write to a client advisor. We reply within one business day, and you will hear from a person.",
  alternates: { canonical: "/help/contact" },
};

const CHANNELS = [
  {
    label: "Telephone",
    detail: "+33 1 42 60 30 30",
    note: "Monday–Saturday, 09:00–19:00 CET",
  },
  {
    label: "Email",
    detail: "clients@zylo.example",
    note: "Answered within one business day",
  },
  {
    label: "In person",
    detail: "Book a private appointment",
    note: "Paris · London · New York · Tokyo",
    href: "/services#appointments",
  },
];

export default function ContactPage() {
  return (
    <>
      <section className="container-shell pt-12 lg:pt-16">
        <Breadcrumbs
          crumbs={[
            { label: "Home", href: "/" },
            { label: "Client Services", href: "/help" },
            { label: "Contact Us" },
          ]}
        />
        <p className="eyebrow-sm mt-8 text-champagne-dark">Client services</p>
        <h1 className="mt-4 max-w-3xl font-display text-4xl font-light leading-[1.04] lg:text-display-md">
          Speak with an advisor
        </h1>
        <p className="mt-6 max-w-xl text-sm font-light leading-relaxed text-muted-foreground lg:text-base">
          Sizing, engraving, made-to-order lead times, or a piece you saw once
          and cannot find. Ask us anything.
        </p>
      </section>

      <section className="container-shell py-14 lg:py-20">
        <div className="grid gap-x-16 gap-y-14 lg:grid-cols-[1fr_20rem]">
          <div className="max-w-2xl">
            <ContactForm />
          </div>

          <aside className="lg:sticky lg:top-28 lg:h-fit">
            <h2 className="eyebrow-sm text-muted-foreground">
              Other ways to reach us
            </h2>
            <dl className="mt-6 divide-y divide-hairline border-y border-hairline">
              {CHANNELS.map((channel) => (
                <div key={channel.label} className="py-5">
                  <dt className="eyebrow-sm text-muted-foreground">
                    {channel.label}
                  </dt>
                  <dd className="mt-2">
                    {channel.href ? (
                      <Link
                        href={channel.href}
                        className="link-draw font-display text-lg font-light"
                      >
                        {channel.detail}
                      </Link>
                    ) : (
                      <span className="font-display text-lg font-light">
                        {channel.detail}
                      </span>
                    )}
                    <span className="mt-1.5 block text-xs font-light text-muted-foreground">
                      {channel.note}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>

            <h2 className="eyebrow-sm mt-10 text-muted-foreground">
              Answers you may want first
            </h2>
            <ul className="mt-5 space-y-3">
              {HELP_PAGES.map((page) => (
                <li key={page.slug}>
                  <Link
                    href={`/help/${page.slug}`}
                    className="link-draw text-sm font-light text-muted-foreground hover:text-foreground"
                  >
                    {page.title}
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>
    </>
  );
}
