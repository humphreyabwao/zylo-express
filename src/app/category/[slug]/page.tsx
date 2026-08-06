import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  buildFacets,
  filterProducts,
  getCategories,
  getCategoryBySlug,
  getProductsInCategory,
  parseFilters,
} from "@/lib/catalog";
import {
  CatalogPage,
  RelatedLinks,
} from "@/components/catalog/catalog-page";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export function generateStaticParams() {
  return getCategories().map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category) return { title: "Not found" };

  return {
    title: category.name,
    description: category.description,
    alternates: { canonical: `/category/${category.slug}` },
    openGraph: {
      title: `${category.name} · ZYLO`,
      description: category.description,
      images: [`/media/collections/${category.slug}.jpg`],
    },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const category = getCategoryBySlug(slug);
  if (!category) notFound();

  const scope = getProductsInCategory(slug);
  const filters = parseFilters(await searchParams);
  const products = filterProducts(scope, filters);
  const facets = buildFacets(scope);

  const siblings = getCategories()
    .filter((c) => c.slug !== slug)
    .map((c) => ({ label: c.name, href: `/category/${c.slug}` }));

  return (
    <CatalogPage
      eyebrow="Collection"
      title={category.name}
      description={category.description}
      image={{
        url: `/media/collections/${category.slug}.jpg`,
        alt: category.name,
      }}
      crumbs={[
        { label: "Home", href: "/" },
        { label: "Collections", href: "/collections" },
        { label: category.name },
      ]}
      products={products}
      facets={facets}
      hideFacets={["categories"]}
    >
      <RelatedLinks heading="Continue in" links={siblings} />
    </CatalogPage>
  );
}
