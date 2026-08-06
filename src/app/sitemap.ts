import type { MetadataRoute } from "next";

import {
  getAllProducts,
  getCategories,
  getCollections,
  getJournal,
} from "@/lib/catalog";
import { HELP_PAGES, LEGAL_PAGES } from "@/data/content";
import { absoluteUrl } from "@/lib/utils";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const [allCategories, allCollections, allProducts, allArticles] =
    await Promise.all([
      getCategories(),
      getCollections(),
      getAllProducts(),
      getJournal(),
    ]);

  const statics: MetadataRoute.Sitemap = (
    [
      ["/", "daily", 1],
      ["/collections", "weekly", 0.9],
      ["/shop", "daily", 1],
      ["/collections/new-in", "daily", 0.9],
      ["/journal", "weekly", 0.7],
      ["/about", "monthly", 0.6],
      ["/services", "monthly", 0.6],
      ["/boutiques", "monthly", 0.6],
      ["/help", "monthly", 0.5],
      ["/help/contact", "monthly", 0.5],
      ["/sign-in", "yearly", 0.3],
      ["/sign-up", "yearly", 0.3],
    ] as const
  ).map(([path, changeFrequency, priority]) => ({
    url: absoluteUrl(path),
    lastModified: now,
    changeFrequency,
    priority,
  }));

  const categories: MetadataRoute.Sitemap = allCategories.map((category) => ({
    url: absoluteUrl(`/category/${category.slug}`),
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  const collections: MetadataRoute.Sitemap = allCollections.map((collection) => ({
    url: absoluteUrl(`/collections/${collection.slug}`),
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const products: MetadataRoute.Sitemap = allProducts.map((product) => ({
    url: absoluteUrl(`/products/${product.slug}`),
    lastModified: new Date(product.publishedAt),
    changeFrequency: "weekly",
    priority: 0.9,
  }));

  const articles: MetadataRoute.Sitemap = allArticles.map((article) => ({
    url: absoluteUrl(`/journal/${article.slug}`),
    lastModified: new Date(article.publishedAt),
    changeFrequency: "yearly",
    priority: 0.6,
  }));

  const help: MetadataRoute.Sitemap = HELP_PAGES.map((page) => ({
    url: absoluteUrl(`/help/${page.slug}`),
    lastModified: new Date(page.updated),
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  const legal: MetadataRoute.Sitemap = LEGAL_PAGES.map((page) => ({
    url: absoluteUrl(`/legal/${page.slug}`),
    lastModified: new Date(page.updated),
    changeFrequency: "yearly",
    priority: 0.3,
  }));

  return [
    ...statics,
    ...categories,
    ...collections,
    ...products,
    ...articles,
    ...help,
    ...legal,
  ];
}
