import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getContentPage, getContentPages } from "@/lib/content";
import { ContentPage } from "@/components/content/content-page";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const pages = await getContentPages("legal");
  return pages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getContentPage("legal", slug);
  if (!page) return { title: "Not found" };

  return {
    title: page.title,
    description: page.summary,
    alternates: { canonical: `/legal/${page.slug}` },
  };
}

export default async function LegalPage({ params }: PageProps) {
  const { slug } = await params;
  // One cache entry serves both — `getContentPage` filters the same list.
  const [page, siblings] = await Promise.all([
    getContentPage("legal", slug),
    getContentPages("legal"),
  ]);

  if (!page) notFound();

  return (
    <ContentPage
      page={page}
      crumbs={[
        { label: "Home", href: "/" },
        { label: "Legal" },
        { label: page.title },
      ]}
      siblings={siblings.map((p) => ({
        label: p.title,
        href: `/legal/${p.slug}`,
      }))}
      activeHref={`/legal/${page.slug}`}
    />
  );
}
