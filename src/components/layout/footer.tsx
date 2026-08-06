import Link from "next/link";

import { FOOTER_NAV, LEGAL_NAV } from "@/data/navigation";
import { Monogram } from "@/components/brand/logo";
import { NewsletterForm } from "@/components/layout/newsletter-form";

const SOCIAL = [
  { label: "Instagram", href: "https://instagram.com" },
  { label: "Pinterest", href: "https://pinterest.com" },
  { label: "YouTube", href: "https://youtube.com" },
  { label: "LinkedIn", href: "https://linkedin.com" },
];

export function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-white/10 bg-obsidian text-porcelain">
      <Monogram className="pointer-events-none absolute -right-24 -top-24 size-96 text-porcelain/[0.04]" />

      <div className="container-shell relative py-20 lg:py-28">
        {/* Newsletter */}
        <div className="grid gap-12 border-b border-white/10 pb-16 lg:grid-cols-2 lg:gap-24 lg:pb-20">
          <div>
            <p className="eyebrow-sm text-champagne">Correspondence</p>
            <h2 className="mt-5 max-w-lg font-display text-4xl font-light leading-[1.08] lg:text-5xl">
              Word before the collection, not after
            </h2>
            <p className="mt-5 max-w-md text-sm font-light leading-relaxed text-porcelain/60">
              Private previews, restocks of the pieces that sell out, and an
              invitation to the seasonal presentation in your nearest boutique.
            </p>
          </div>

          <div className="lg:pt-3">
            <NewsletterForm tone="inverse" className="max-w-md" />
          </div>
        </div>

        {/* Directory */}
        <nav
          aria-label="Footer"
          className="grid gap-10 border-b border-white/10 py-16 sm:grid-cols-2 lg:grid-cols-4 lg:gap-12"
        >
          {FOOTER_NAV.map((column) => (
            <div key={column.heading}>
              <h3 className="eyebrow-sm mb-6 text-porcelain/45">
                {column.heading}
              </h3>
              <ul className="space-y-3.5">
                {column.links.map((link) => (
                  <li key={link.href + link.label}>
                    <Link
                      href={link.href}
                      className="link-draw text-sm font-light text-porcelain/80 transition-colors duration-500 hover:text-porcelain"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Wordmark */}
        <div className="border-b border-white/10 py-14">
          <p
            className="text-center font-sans text-[13vw] font-extralight uppercase leading-none text-porcelain/[0.07] lg:text-[11rem]"
            style={{ letterSpacing: "0.14em", paddingLeft: "0.14em" }}
            aria-hidden
          >
            Zylo
          </p>
        </div>

        {/* Colophon */}
        <div className="flex flex-col gap-8 pt-12 lg:flex-row lg:items-center lg:justify-between">
          <ul className="flex flex-wrap items-center gap-x-7 gap-y-3">
            {SOCIAL.map((item) => (
              <li key={item.label}>
                <a
                  href={item.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="link-draw eyebrow-sm text-porcelain/55 transition-colors duration-500 hover:text-porcelain"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>

          <ul className="flex flex-wrap items-center gap-x-7 gap-y-3">
            {LEGAL_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="link-draw eyebrow-sm text-porcelain/55 transition-colors duration-500 hover:text-porcelain"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <p className="eyebrow-sm text-porcelain/35">
            © {new Date().getFullYear()} Zylo
          </p>
        </div>
      </div>
    </footer>
  );
}
