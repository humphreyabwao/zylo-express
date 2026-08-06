import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { CatalogFacets, Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/motion/reveal";
import { CatalogToolbar } from "@/components/catalog/catalog-toolbar";
import { FilterPanel } from "@/components/catalog/filter-panel";
import { MobileFilterSheet } from "@/components/catalog/mobile-filter-sheet";
import { ProductGrid } from "@/components/catalog/product-grid";

export interface Crumb {
  label: string;
  href?: string;
}

interface CatalogPageProps {
  eyebrow?: string;
  title: string;
  description?: string;
  image?: { url: string; alt: string };
  crumbs: Crumb[];
  products: Product[];
  facets: CatalogFacets;
  hideFacets?: Array<"categories" | "collections">;
  /** Rendered under the grid — related links, editorial, SEO copy. */
  children?: React.ReactNode;
}

export function CatalogPage({
  eyebrow,
  title,
  description,
  image,
  crumbs,
  products,
  facets,
  hideFacets,
  children,
}: CatalogPageProps) {
  return (
    <>
      {image ? (
        <section className="relative flex h-[42vh] min-h-72 items-end overflow-hidden lg:h-[52vh]">
          <Image
            src={image.url}
            alt={image.alt}
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 scrim-bottom" aria-hidden />

          <div className="container-shell relative pb-12 lg:pb-16">
            <Breadcrumbs crumbs={crumbs} tone="inverse" />
            {eyebrow && (
              <p className="eyebrow-sm mt-6 text-champagne">{eyebrow}</p>
            )}
            <h1 className="mt-4 max-w-3xl font-display text-4xl font-light leading-[1.04] text-porcelain lg:text-display-md">
              {title}
            </h1>
          </div>
        </section>
      ) : (
        <section className="container-shell pb-4 pt-12 lg:pt-16">
          <Breadcrumbs crumbs={crumbs} />
          {eyebrow && (
            <p className="eyebrow-sm mt-8 text-champagne-dark">{eyebrow}</p>
          )}
          <h1 className="mt-4 max-w-3xl font-display text-4xl font-light leading-[1.04] lg:text-display-md">
            {title}
          </h1>
        </section>
      )}

      {description && (
        <section className="container-shell pt-8 lg:pt-12">
          <p className="max-w-2xl text-sm font-light leading-relaxed text-muted-foreground lg:text-base">
            {description}
          </p>
        </section>
      )}

      <section className="container-shell py-12 lg:py-16">
        <div className="grid gap-x-12 lg:grid-cols-[16rem_1fr] xl:gap-x-20">
          {/* Desktop refinements */}
          <aside className="hidden lg:block">
            <div className="sticky top-28">
              <h2 className="eyebrow-sm mb-2 text-muted-foreground">Refine</h2>
              <FilterPanel facets={facets} hide={hideFacets} />
            </div>
          </aside>

          <div className="min-w-0">
            <CatalogToolbar total={products.length} facets={facets} />
            <div className="mt-10">
              <ProductGrid products={products} />
            </div>
          </div>
        </div>
      </section>

      {children}

      <MobileFilterSheet
        facets={facets}
        total={products.length}
        hide={hideFacets}
      />
    </>
  );
}

export function Breadcrumbs({
  crumbs,
  tone = "default",
  className,
}: {
  crumbs: Crumb[];
  tone?: "default" | "inverse";
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={crumb.label} className="flex items-center gap-1.5">
              {crumb.href && !last ? (
                <Link
                  href={crumb.href}
                  className={cn(
                    "link-draw eyebrow-sm transition-opacity duration-400 hover:opacity-100",
                    tone === "inverse"
                      ? "text-porcelain/60"
                      : "text-muted-foreground"
                  )}
                >
                  {crumb.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={cn(
                    "eyebrow-sm",
                    tone === "inverse" ? "text-porcelain" : "text-foreground"
                  )}
                >
                  {crumb.label}
                </span>
              )}

              {!last && (
                <ChevronRight
                  className={cn(
                    "size-3",
                    tone === "inverse"
                      ? "text-porcelain/40"
                      : "text-muted-foreground/60"
                  )}
                  strokeWidth={1.25}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Cross-links rendered beneath a listing to keep the crawl graph dense. */
export function RelatedLinks({
  heading,
  links,
}: {
  heading: string;
  links: { label: string; href: string }[];
}) {
  if (!links.length) return null;

  return (
    <section className="border-t border-hairline">
      <div className="container-shell py-16">
        <Reveal>
          <h2 className="eyebrow-sm text-muted-foreground">{heading}</h2>
          <ul className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="link-draw font-display text-xl font-light text-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
