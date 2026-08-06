import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  buildFacets,
  filterProducts,
  getAllProducts,
  getCollectionBySlug,
  getCollections,
  getNewArrivals,
  getProductsInCollection,
  parseFilters,
} from "@/lib/catalog";
import type { Product } from "@/lib/types";
import {
  CatalogPage,
  RelatedLinks,
} from "@/components/catalog/catalog-page";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Two synthetic listings sit alongside the curated collections. They are
 * routed here rather than at their own paths so every listing shares one
 * refinement surface.
 */
const SYNTHETIC = {
  all: {
    eyebrow: "The complete offering",
    title: "Everything we make",
    description:
      "Twenty-four objects across eight disciplines. Small by design — we would rather make one bag properly than five quickly.",
    image: "/media/campaign/feature-wide.jpg",
    resolve: () => getAllProducts(),
  },
  "new-in": {
    eyebrow: "Just arrived",
    title: "New to the maison",
    description:
      "The most recent pieces to leave the workshop, newest first. Editions are small and are not repeated.",
    image: "/media/campaign/hero-secondary.jpg",
    resolve: () => getNewArrivals(24),
  },
} satisfies Record<
  string,
  {
    eyebrow: string;
    title: string;
    description: string;
    image: string;
    resolve: () => Product[];
  }
>;

export function generateStaticParams() {
  return [
    ...Object.keys(SYNTHETIC).map((slug) => ({ slug })),
    ...getCollections().map((collection) => ({ slug: collection.slug })),
  ];
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;

  if (slug in SYNTHETIC) {
    const entry = SYNTHETIC[slug as keyof typeof SYNTHETIC];
    return {
      title: entry.title,
      description: entry.description,
      alternates: { canonical: `/collections/${slug}` },
      openGraph: { title: `${entry.title} · ZYLO`, images: [entry.image] },
    };
  }

  const collection = getCollectionBySlug(slug);
  if (!collection) return { title: "Not found" };

  return {
    title: collection.name,
    description: collection.description,
    alternates: { canonical: `/collections/${collection.slug}` },
    openGraph: {
      title: `${collection.name} · ZYLO`,
      description: collection.description,
      images: [collection.image.url],
    },
  };
}

export default async function CollectionPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const filters = parseFilters(await searchParams);

  const synthetic = SYNTHETIC[slug as keyof typeof SYNTHETIC];
  const collection = synthetic ? undefined : getCollectionBySlug(slug);
  if (!synthetic && !collection) notFound();

  const scope = synthetic ? synthetic.resolve() : getProductsInCollection(slug);
  const products = filterProducts(scope, filters);
  const facets = buildFacets(scope);

  const siblings = getCollections()
    .filter((c) => c.slug !== slug)
    .map((c) => ({ label: c.name, href: `/collections/${c.slug}` }));

  return (
    <CatalogPage
      eyebrow={synthetic ? synthetic.eyebrow : collection!.tagline}
      title={synthetic ? synthetic.title : collection!.name}
      description={
        synthetic ? synthetic.description : collection!.description
      }
      image={{
        url: synthetic ? synthetic.image : collection!.image.url,
        alt: synthetic ? synthetic.title : collection!.image.alt,
      }}
      crumbs={[
        { label: "Home", href: "/" },
        { label: "Collections", href: "/collections" },
        { label: synthetic ? synthetic.title : collection!.name },
      ]}
      products={products}
      facets={facets}
      hideFacets={synthetic ? [] : ["collections"]}
    >
      <RelatedLinks heading="Other edits" links={siblings} />
    </CatalogPage>
  );
}
