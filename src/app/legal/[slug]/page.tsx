import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LEGAL_PAGES } from "@/data/content";
import { ContentPage } from "@/components/content/content-page";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return LEGAL_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = LEGAL_PAGES.find((p) => p.slug === slug);
  if (!page) return { title: "Not found" };

  return {
    title: page.title,
    description: page.summary,
    alternates: { canonical: `/legal/${page.slug}` },
  };
}

export default async function LegalPage({ params }: PageProps) {
  const { slug } = await params;
  const page = LEGAL_PAGES.find((p) => p.slug === slug);
  if (!page) notFound();

  return (
    <ContentPage
      page={page}
      crumbs={[
        { label: "Home", href: "/" },
        { label: "Legal" },
        { label: page.title },
      ]}
      siblings={LEGAL_PAGES.map((p) => ({
        label: p.title,
        href: `/legal/${p.slug}`,
      }))}
      activeHref={`/legal/${page.slug}`}
    />
  );
}
