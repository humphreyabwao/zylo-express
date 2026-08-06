import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { HELP_PAGES } from "@/data/content";
import { ContentPage } from "@/components/content/content-page";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return HELP_PAGES.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = HELP_PAGES.find((p) => p.slug === slug);
  if (!page) return { title: "Not found" };

  return {
    title: page.title,
    description: page.summary,
    alternates: { canonical: `/help/${page.slug}` },
  };
}

export default async function HelpArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const page = HELP_PAGES.find((p) => p.slug === slug);
  if (!page) notFound();

  return (
    <ContentPage
      page={page}
      crumbs={[
        { label: "Home", href: "/" },
        { label: "Client Services", href: "/help" },
        { label: page.title },
      ]}
      siblings={[
        ...HELP_PAGES.map((p) => ({ label: p.title, href: `/help/${p.slug}` })),
        { label: "Contact Us", href: "/help/contact" },
      ]}
      activeHref={`/help/${page.slug}`}
    />
  );
}
