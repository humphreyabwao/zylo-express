import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getContentPage, getContentPages } from "@/lib/content";
import { ContentPage } from "@/components/content/content-page";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const pages = await getContentPages("help");
  return pages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getContentPage("help", slug);
  if (!page) return { title: "Not found" };

  return {
    title: page.title,
    description: page.summary,
    alternates: { canonical: `/help/${page.slug}` },
  };
}

export default async function HelpArticlePage({ params }: PageProps) {
  const { slug } = await params;

  // Both reads hit the same cache entry — `getContentPage` filters the list
  // `getContentPages` returns — so this is one query, not two.
  const [page, siblings] = await Promise.all([
    getContentPage("help", slug),
    getContentPages("help"),
  ]);

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
        ...siblings.map((p) => ({ label: p.title, href: `/help/${p.slug}` })),
        // Not a content page: /help/contact is a form with its own route.
        { label: "Contact Us", href: "/help/contact" },
      ]}
      activeHref={`/help/${page.slug}`}
    />
  );
}
