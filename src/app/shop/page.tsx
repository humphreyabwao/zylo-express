import type { Metadata } from "next";

import {
  buildFacets,
  filterProducts,
  getAllProducts,
  getCountries,
} from "@/lib/catalog";
import { parseFilters } from "@/lib/filters";
import { absoluteUrl } from "@/lib/utils";
import { CatalogPage, RelatedLinks } from "@/components/catalog/catalog-page";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The shop.
 *
 * The canonical entry point into the catalogue, and where the hero's Shop Now
 * lands. `/collections/all` used to render the same listing at a second URL;
 * it now permanently redirects here so there is one indexable page per set of
 * products rather than two competing for the same terms.
 */
export const metadata: Metadata = {
  title: "Shop All",
  description:
    "The complete ZYLO Express catalogue. Filter by category, colour, size, price and country of origin — every piece shows where it ships from and how long dispatch takes.",
  alternates: { canonical: "/shop" },
  openGraph: {
    title: "Shop All · ZYLO Express",
    description:
      "The complete catalogue, filterable by origin, category, colour, size and price.",
    url: absoluteUrl("/shop"),
    images: ["/media/campaign/feature-wide.jpg"],
  },
};

export default async function ShopPage({ searchParams }: PageProps) {
  const [scope, countries, resolvedSearchParams] = await Promise.all([
    getAllProducts(),
    getCountries(),
    searchParams,
  ]);

  const filters = parseFilters(resolvedSearchParams);
  const products = filterProducts(scope, filters);
  const facets = await buildFacets(scope);

  // Origin shortcuts, busiest first. On a cross-border storefront "everything
  // from China" is as natural an entry point as a category.
  const originLinks = facets.countries.slice(0, 8).map((country) => ({
    label: `${country.flag} ${country.label}`,
    href: `/shop?countries=${country.value}`,
  }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Shop All",
    description:
      "The complete ZYLO Express catalogue, filterable by country of origin.",
    url: absoluteUrl("/shop"),
    isPartOf: { "@type": "WebSite", name: "ZYLO Express", url: absoluteUrl("/") },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: products.length,
      itemListElement: products.slice(0, 24).map((product, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absoluteUrl(`/products/${product.slug}`),
        name: product.name,
      })),
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Serialised from our own catalogue — no user input reaches this.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <CatalogPage
        eyebrow="The complete offering"
        title="Shop all"
        description={`${scope.length} pieces sourced from ${countries.length} countries. Every card shows its origin; refine by where it ships from to shorten the wait.`}
        image={{
          url: "/media/campaign/feature-wide.jpg",
          alt: "The ZYLO Express catalogue",
        }}
        crumbs={[{ label: "Home", href: "/" }, { label: "Shop" }]}
        products={products}
        facets={facets}
      >
        <RelatedLinks heading="Shop by origin" links={originLinks} />
      </CatalogPage>
    </>
  );
}
