import type { Metadata } from "next";
import Link from "next/link";

import {
  buildFacets,
  filterProducts,
  getCategories,
  parseFilters,
  searchProducts,
} from "@/lib/catalog";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/catalog/catalog-page";
import { CatalogToolbar } from "@/components/catalog/catalog-toolbar";
import { FilterPanel } from "@/components/catalog/filter-panel";
import { MobileFilterSheet } from "@/components/catalog/mobile-filter-sheet";
import { ProductGrid } from "@/components/catalog/product-grid";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const raw = Array.isArray(params.q) ? params.q[0] : params.q;
  const query = raw?.trim();

  return {
    title: query ? `Search — ${query}` : "Search",
    description: query
      ? `Results for “${query}” across the ZYLO collection.`
      : "Search the maison.",
    // Result pages are thin and near-duplicate; keep them out of the index.
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const raw = Array.isArray(params.q) ? params.q[0] : params.q;
  const query = raw?.trim() ?? "";

  // Relevance ranking first, then the shopper's refinements on top of it.
  const matches = query ? searchProducts(query, 60) : [];
  const filters = parseFilters(params);
  const products = query
    ? filterProducts(matches, { ...filters, query: undefined })
    : [];
  const facets = buildFacets(matches);
  const categories = getCategories();

  return (
    <>
      <section className="container-shell pt-12 lg:pt-16">
        <Breadcrumbs
          crumbs={[{ label: "Home", href: "/" }, { label: "Search" }]}
        />

        <h1 className="mt-8 font-display text-4xl font-light leading-[1.04] lg:text-5xl">
          {query ? (
            <>
              Results for <span className="italic">“{query}”</span>
            </>
          ) : (
            "Search the maison"
          )}
        </h1>

        {query && (
          <p className="mt-5 text-sm font-light text-muted-foreground">
            {matches.length} {matches.length === 1 ? "piece" : "pieces"} match
            your search.
          </p>
        )}
      </section>

      {query ? (
        <section className="container-shell py-12 lg:py-16">
          {matches.length > 0 ? (
            <div className="grid gap-x-12 lg:grid-cols-[16rem_1fr] xl:gap-x-20">
              <aside className="hidden lg:block">
                <div className="sticky top-28">
                  <h2 className="eyebrow-sm mb-2 text-muted-foreground">
                    Refine
                  </h2>
                  {/* The shared panel, so refinements behave exactly as they
                      do on a category listing. */}
                  <FilterPanel facets={facets} />
                </div>
              </aside>

              <div className="min-w-0">
                <CatalogToolbar total={products.length} facets={facets} />
                <div className="mt-10">
                  <ProductGrid products={products} />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-7 border border-hairline px-8 py-24 text-center">
              <div className="space-y-3">
                <h2 className="font-display text-3xl font-light">
                  Nothing matches “{query}”
                </h2>
                <p className="mx-auto max-w-md text-sm font-light leading-relaxed text-muted-foreground">
                  Try a house name, a material, or the discipline you have in
                  mind — leather, gold, cashmere, vetiver.
                </p>
              </div>
              <Button asChild>
                <Link href="/collections/all">Browse everything</Link>
              </Button>
            </div>
          )}
        </section>
      ) : (
        <section className="container-shell py-12 lg:py-16">
          <h2 className="eyebrow-sm text-muted-foreground">Start here</h2>
          <ul className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((category) => (
              <li key={category.slug}>
                <Link
                  href={`/category/${category.slug}`}
                  className="link-draw font-display text-2xl font-light"
                >
                  {category.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <MobileFilterSheet facets={facets} total={products.length} />
    </>
  );
}
