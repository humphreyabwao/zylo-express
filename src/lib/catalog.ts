import "server-only";

import {
  CATEGORIES,
  COLLECTIONS,
  COUNTRIES,
  JOURNAL,
  PRODUCTS,
} from "@/data/catalog";
import { CacheTags, TTL, cacheKey, cached } from "@/lib/cache";
import { isSupabaseConfigured } from "@/lib/env";
import { FLAG_LABELS } from "@/lib/filters";
import { createAnonymousClient } from "@/lib/supabase/server";
import { storageUrl } from "@/lib/storage";
import type {
  CatalogFacets,
  CatalogFilters,
  Category,
  Collection,
  Country,
  CountryFacetCount,
  EditorialArticle,
  FacetCount,
  Product,
  ProductFlag,
  SortKey,
} from "@/lib/types";
import type {
  ArticleRow,
  CategoryRow,
  CollectionRow,
  CountryRow,
  ProductRow,
} from "@/lib/supabase/types";

/**
 * The catalogue repository.
 *
 * Server-only. Every function reads from Supabase when it is configured and
 * falls back to the local seed data otherwise, so the storefront renders on a
 * fresh clone with no credentials and `next build` works in CI.
 *
 * Callers never learn which source answered. That was the seam the frontend
 * was built against, and it is still the seam: swap the source, not the callers.
 *
 * Reads are wrapped in `cached()` (Redis when configured, in-process LRU
 * otherwise) and tagged so an admin write can invalidate precisely.
 */

/* --------------------------------------------------------------- mapping */

// The nested shape returned by the product select below.
type ProductJoin = ProductRow & {
  product_images: {
    id: string;
    storage_path: string;
    alt: string;
    width: number;
    height: number;
    position: number;
  }[];
  product_options: {
    id: string;
    name: string;
    type: "color" | "size" | "material" | "text";
    position: number;
    product_option_values: {
      value: string;
      label: string;
      hex: string | null;
      available: boolean;
      position: number;
    }[];
  }[];
  product_variants: {
    id: string;
    sku: string;
    title: string;
    selected_options: Record<string, string>;
    price: number;
    compare_at_price: number | null;
    inventory_quantity: number;
    available: boolean;
    image_id: string | null;
  }[];
  product_collections: { collections: { slug: string } | null }[];
};

const PRODUCT_SELECT = `
  *,
  product_images (id, storage_path, alt, width, height, position),
  product_options (
    id, name, type, position,
    product_option_values (value, label, hex, available, position)
  ),
  product_variants (
    id, sku, title, selected_options, price, compare_at_price,
    inventory_quantity, available, image_id
  ),
  product_collections ( collections (slug) )
`;

const byPosition = <T extends { position: number }>(a: T, b: T) =>
  a.position - b.position;

function mapProduct(row: ProductJoin): Product {
  const images = [...(row.product_images ?? [])].sort(byPosition).map((img) => ({
    id: img.id,
    url: storageUrl(img.storage_path),
    alt: img.alt,
    width: img.width,
    height: img.height,
    position: img.position,
  }));

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    excerpt: row.excerpt,
    description: row.description,
    story: row.story,
    details: row.details ?? [],
    care: row.care ?? [],
    composition: row.composition,
    origin: row.origin_label,
    originCountry: row.origin_country_code ?? "",
    originCity: row.origin_city,
    categorySlug: row.category_slug ?? "",
    collectionSlugs: (row.product_collections ?? [])
      .map((pc) => pc.collections?.slug)
      .filter((s): s is string => Boolean(s)),
    price: row.price,
    compareAtPrice: row.compare_at_price,
    currency: row.currency,
    images,
    options: [...(row.product_options ?? [])].sort(byPosition).map((opt) => ({
      id: opt.id,
      name: opt.name,
      type: opt.type,
      values: [...(opt.product_option_values ?? [])]
        .sort(byPosition)
        .map((v) => ({
          value: v.value,
          label: v.label,
          hex: v.hex ?? undefined,
          available: v.available,
        })),
    })),
    variants: (row.product_variants ?? []).map((v) => ({
      id: v.id,
      sku: v.sku,
      title: v.title,
      selectedOptions: v.selected_options ?? {},
      price: v.price,
      compareAtPrice: v.compare_at_price,
      inventoryQuantity: v.inventory_quantity,
      available: v.available,
      imageId: v.image_id,
    })),
    // Postgres returns numeric as a string over the wire; Number() here keeps
    // the domain type honest rather than leaking "4.9" into arithmetic.
    rating: Number(row.rating),
    reviewCount: row.review_count,
    flags: row.flags ?? [],
    isFeatured: row.is_featured,
    available: row.available,
    publishedAt: row.published_at,
  };
}

function mapCategory(row: CategoryRow): Category {
  return {
    slug: row.slug,
    name: row.name,
    group: row.group,
    description: row.description,
  };
}

function mapCollection(row: CollectionRow): Collection {
  return {
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    image: {
      id: `col-${row.slug}`,
      url: row.image_url ? storageUrl(row.image_url) : "",
      alt: row.image_alt,
      width: row.image_width,
      height: row.image_height,
      position: 0,
    },
    position: row.position,
    isFeatured: row.is_featured,
  };
}

function mapArticle(row: ArticleRow): EditorialArticle {
  return {
    slug: row.slug,
    title: row.title,
    kicker: row.kicker,
    excerpt: row.excerpt,
    body: row.body ?? [],
    image: {
      id: `art-${row.slug}`,
      url: row.image_url ? storageUrl(row.image_url) : "",
      alt: row.image_alt,
      width: row.image_width,
      height: row.image_height,
      position: 0,
    },
    readingMinutes: row.reading_minutes,
    publishedAt: row.published_at,
    author: row.author,
  };
}

function mapCountry(row: CountryRow): Country {
  return {
    code: row.code,
    name: row.name,
    flag: row.flag_emoji,
    leadTimeMinDays: row.lead_time_min_days,
    leadTimeMaxDays: row.lead_time_max_days,
  };
}

/* ------------------------------------------------------------- base reads */

/**
 * The full active catalogue.
 *
 * Every other product query derives from this one cached list. At storefront
 * scale that is one Redis round trip instead of a query per surface; if the
 * catalogue outgrows it, `search_products` and `catalog_facets` already exist
 * in Postgres to push the work down.
 */
export async function getAllProducts(): Promise<Product[]> {
  if (!isSupabaseConfigured()) return PRODUCTS;

  return cached(
    "products:all",
    async () => {
      const supabase = createAnonymousClient();
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("is_active", true)
        .order("published_at", { ascending: false });

      if (error) {
        console.error("[catalog] product fetch failed, using seed data:", error);
        return PRODUCTS;
      }
      return (data as unknown as ProductJoin[]).map(mapProduct);
    },
    { ttl: TTL.catalog, tags: [CacheTags.products] }
  );
}

export async function getCategories(): Promise<Category[]> {
  if (!isSupabaseConfigured()) return CATEGORIES;

  return cached(
    "categories:all",
    async () => {
      const supabase = createAnonymousClient();
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("is_active", true)
        .order("position");

      if (error) {
        console.error("[catalog] category fetch failed:", error);
        return CATEGORIES;
      }
      return data.map(mapCategory);
    },
    { ttl: TTL.catalog, tags: [CacheTags.categories] }
  );
}

export async function getCollections(): Promise<Collection[]> {
  if (!isSupabaseConfigured()) {
    return [...COLLECTIONS].sort((a, b) => a.position - b.position);
  }

  return cached(
    "collections:all",
    async () => {
      const supabase = createAnonymousClient();
      const { data, error } = await supabase
        .from("collections")
        .select("*")
        .eq("is_active", true)
        .order("position");

      if (error) {
        console.error("[catalog] collection fetch failed:", error);
        return [...COLLECTIONS].sort((a, b) => a.position - b.position);
      }
      return data.map(mapCollection);
    },
    { ttl: TTL.catalog, tags: [CacheTags.collections] }
  );
}

export async function getCountries(): Promise<Country[]> {
  if (!isSupabaseConfigured()) return COUNTRIES;

  return cached(
    "countries:all",
    async () => {
      const supabase = createAnonymousClient();
      const { data, error } = await supabase
        .from("countries")
        .select("*")
        .eq("is_active", true)
        .order("position");

      if (error) {
        console.error("[catalog] country fetch failed:", error);
        return COUNTRIES;
      }
      return data.map(mapCountry);
    },
    { ttl: TTL.catalog, tags: [CacheTags.countries] }
  );
}

export async function getJournal(): Promise<EditorialArticle[]> {
  if (!isSupabaseConfigured()) {
    return [...JOURNAL].sort(
      (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)
    );
  }

  return cached(
    "articles:all",
    async () => {
      const supabase = createAnonymousClient();
      const { data, error } = await supabase
        .from("articles")
        .select("*")
        .eq("is_published", true)
        .order("published_at", { ascending: false });

      if (error) {
        console.error("[catalog] article fetch failed:", error);
        return [...JOURNAL].sort(
          (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)
        );
      }
      return data.map(mapArticle);
    },
    { ttl: TTL.content, tags: [CacheTags.articles] }
  );
}

/* ---------------------------------------------------------------- lookups */

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  const products = await getAllProducts();
  return products.find((p) => p.slug === slug);
}

/**
 * Hydrates a list of product ids.
 *
 * Nothing calls this yet. It is the other half of `getWishlistProductIds()` in
 * `@/lib/account`: once saved items move off localStorage and onto the
 * `wishlist_items` table, the wishlist page reads ids from there and resolves
 * them here. Kept as a pair so the migration is a wiring change, not a rewrite.
 */
export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  const wanted = new Set(ids);
  const products = await getAllProducts();
  return products.filter((p) => wanted.has(p.id));
}

export async function getCategoryBySlug(slug: string): Promise<Category | undefined> {
  const categories = await getCategories();
  return categories.find((c) => c.slug === slug);
}

export async function getCollectionBySlug(slug: string): Promise<Collection | undefined> {
  const collections = await getCollections();
  return collections.find((c) => c.slug === slug);
}

export async function getFeaturedCollections(): Promise<Collection[]> {
  const collections = await getCollections();
  return collections.filter((c) => c.isFeatured);
}

export async function getCountryByCode(code: string): Promise<Country | undefined> {
  const countries = await getCountries();
  return countries.find((c) => c.code === code);
}

export async function getArticleBySlug(slug: string): Promise<EditorialArticle | undefined> {
  const articles = await getJournal();
  return articles.find((a) => a.slug === slug);
}

/* ------------------------------------------------------------- curations */

export async function getFeaturedProducts(limit = 8): Promise<Product[]> {
  const products = await getAllProducts();
  return products.filter((p) => p.isFeatured).slice(0, limit);
}

export async function getNewArrivals(limit = 8): Promise<Product[]> {
  const products = await getAllProducts();
  return [...products]
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, limit);
}

export async function getProductsInCategory(slug: string): Promise<Product[]> {
  const products = await getAllProducts();
  return products.filter((p) => p.categorySlug === slug);
}

export async function getProductsInCollection(slug: string): Promise<Product[]> {
  const products = await getAllProducts();
  return products.filter((p) => p.collectionSlugs.includes(slug));
}

/**
 * Related products, ranked: same collection first, then same category, then
 * anything else sharing a price band. Never returns the source product.
 */
export async function getRelatedProducts(
  product: Product,
  limit = 4
): Promise<Product[]> {
  const products = await getAllProducts();

  const scored = products
    .filter((p) => p.id !== product.id)
    .map((p) => {
      let score = 0;
      const sharedCollections = p.collectionSlugs.filter((s) =>
        product.collectionSlugs.includes(s)
      ).length;
      score += sharedCollections * 4;
      if (p.categorySlug === product.categorySlug) score += 3;
      // Same sourcing origin means one shipment rather than two.
      if (p.originCountry && p.originCountry === product.originCountry) score += 2;
      const priceDelta = Math.abs(p.price - product.price) / product.price;
      if (priceDelta < 0.4) score += 2;
      else if (priceDelta < 0.8) score += 1;
      if (p.isFeatured) score += 1;
      return { product: p, score };
    });

  return scored
    .sort(
      (a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name)
    )
    .slice(0, limit)
    .map((s) => s.product);
}

/* ---------------------------------------------------------------- search */

const STOP_WORDS = new Set(["the", "a", "an", "and", "of", "in", "for", "de"]);

/**
 * Weighted product search.
 *
 * Uses the Postgres `search_products` RPC when Supabase is configured — the
 * tsvector index does the ranking — and an equivalent in-memory scorer against
 * the seed data otherwise.
 */
export async function searchProducts(query: string, limit = 20): Promise<Product[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  if (!isSupabaseConfigured()) return searchSeed(trimmed, limit);

  return cached(
    cacheKey("search", trimmed.toLowerCase(), limit),
    async () => {
      const supabase = createAnonymousClient();
      const { data, error } = await supabase.rpc("search_products", {
        p_query: trimmed,
        p_limit: limit,
      });

      if (error || !data) {
        console.error("[catalog] search rpc failed, scoring locally:", error);
        const all = await getAllProducts();
        return scoreProducts(all, trimmed, limit);
      }

      // The RPC returns bare product rows; rehydrate images and variants from
      // the cached catalogue so cards render identically to every other surface.
      const all = await getAllProducts();
      const bySlug = new Map(all.map((p) => [p.slug, p]));
      return (data as ProductRow[])
        .map((row) => bySlug.get(row.slug))
        .filter((p): p is Product => Boolean(p));
    },
    { ttl: TTL.search, tags: [CacheTags.products] }
  );
}

async function searchSeed(query: string, limit: number): Promise<Product[]> {
  return scoreProducts(PRODUCTS, query, limit);
}

function scoreProducts(products: Product[], query: string, limit: number): Product[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));

  if (!terms.length) return [];

  const scored = products
    .map((product) => {
      const name = product.name.toLowerCase();
      const haystack = [
        product.name,
        product.tagline,
        product.excerpt,
        product.categorySlug,
        product.composition,
        product.origin,
        ...product.collectionSlugs,
        ...product.options.flatMap((o) => o.values.map((v) => v.label)),
      ]
        .join(" ")
        .toLowerCase();

      let score = 0;
      for (const term of terms) {
        if (name.startsWith(term)) score += 10;
        else if (name.includes(term)) score += 6;
        if (haystack.includes(term)) score += 2;
      }
      return { product, score };
    })
    .filter((s) => s.score > 0);

  return scored
    .sort((a, b) => b.score - a.score || b.product.rating - a.product.rating)
    .slice(0, limit)
    .map((s) => s.product);
}

/* --------------------------------------------------------------- filters */

function productColors(product: Product): string[] {
  return (
    product.options.find((o) => o.type === "color")?.values.map((v) => v.value) ??
    []
  );
}

function productSizes(product: Product): string[] {
  return (
    product.options.find((o) => o.type === "size")?.values.map((v) => v.value) ??
    []
  );
}

export function filterProducts(
  products: Product[],
  filters: CatalogFilters
): Product[] {
  const {
    categories,
    collections,
    countries,
    colors,
    sizes,
    flags,
    minPrice,
    maxPrice,
    inStockOnly,
    query,
  } = filters;

  const matched = products.filter((product) => {
    if (categories.length && !categories.includes(product.categorySlug))
      return false;

    if (
      collections.length &&
      !product.collectionSlugs.some((s) => collections.includes(s))
    )
      return false;

    if (countries.length && !countries.includes(product.originCountry))
      return false;

    if (colors.length) {
      const owned = productColors(product);
      if (!colors.some((c) => owned.includes(c))) return false;
    }

    if (sizes.length) {
      const owned = productSizes(product);
      if (!sizes.some((s) => owned.includes(s))) return false;
    }

    if (flags.length && !flags.some((f) => product.flags.includes(f)))
      return false;

    if (typeof minPrice === "number" && product.price < minPrice) return false;
    if (typeof maxPrice === "number" && product.price > maxPrice) return false;

    if (inStockOnly && !product.available) return false;

    if (query) {
      const q = query.toLowerCase();
      const haystack = `${product.name} ${product.tagline} ${product.excerpt}`;
      if (!haystack.toLowerCase().includes(q)) return false;
    }

    return true;
  });

  return sortProducts(matched, filters.sort);
}

function sortProducts(products: Product[], sort: SortKey): Product[] {
  const next = [...products];

  switch (sort) {
    case "newest":
      return next.sort(
        (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)
      );
    case "price-asc":
      return next.sort((a, b) => a.price - b.price);
    case "price-desc":
      return next.sort((a, b) => b.price - a.price);
    case "name-asc":
      return next.sort((a, b) => a.name.localeCompare(b.name));
    case "featured":
    default:
      return next.sort(
        (a, b) =>
          Number(b.isFeatured) - Number(a.isFeatured) ||
          b.rating - a.rating ||
          a.name.localeCompare(b.name)
      );
  }
}

/* ---------------------------------------------------------------- facets */

function tally(
  products: Product[],
  extract: (p: Product) => { value: string; label: string; hex?: string }[]
): FacetCount[] {
  const counts = new Map<string, FacetCount>();

  for (const product of products) {
    for (const { value, label, hex } of extract(product)) {
      const existing = counts.get(value);
      if (existing) existing.count += 1;
      else counts.set(value, { value, label, hex, count: 1 });
    }
  }

  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label)
  );
}

/**
 * Facets are computed from the unfiltered scope so counts stay stable while a
 * shopper toggles refinements — the usual retail behaviour, and it means the
 * panel does not need re-fetching on every checkbox.
 */
export async function buildFacets(products: Product[]): Promise<CatalogFacets> {
  const [categories, collections, countries] = await Promise.all([
    getCategories(),
    getCollections(),
    getCountries(),
  ]);

  const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));
  const collectionBySlug = new Map(collections.map((c) => [c.slug, c]));
  const countryByCode = new Map(countries.map((c) => [c.code, c]));

  const prices = products.map((p) => p.price);

  const countryCounts = new Map<string, CountryFacetCount>();
  for (const product of products) {
    const country = countryByCode.get(product.originCountry);
    if (!country) continue;

    const existing = countryCounts.get(country.code);
    if (existing) {
      existing.count += 1;
    } else {
      countryCounts.set(country.code, {
        value: country.code,
        label: country.name,
        flag: country.flag,
        leadTimeMinDays: country.leadTimeMinDays,
        leadTimeMaxDays: country.leadTimeMaxDays,
        count: 1,
      });
    }
  }

  return {
    categories: tally(products, (p) => {
      const category = categoryBySlug.get(p.categorySlug);
      return category ? [{ value: category.slug, label: category.name }] : [];
    }),
    collections: tally(products, (p) =>
      p.collectionSlugs.flatMap((slug) => {
        const collection = collectionBySlug.get(slug);
        return collection
          ? [{ value: collection.slug, label: collection.name }]
          : [];
      })
    ),
    countries: [...countryCounts.values()].sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label)
    ),
    colors: tally(products, (p) => {
      const option = p.options.find((o) => o.type === "color");
      return (
        option?.values.map((v) => ({
          value: v.value,
          label: v.label,
          hex: v.hex,
        })) ?? []
      );
    }),
    sizes: tally(products, (p) => {
      const option = p.options.find((o) => o.type === "size");
      return option?.values.map((v) => ({ value: v.value, label: v.label })) ?? [];
    }),
    flags: tally(products, (p) =>
      p.flags.map((f) => ({ value: f, label: FLAG_LABELS[f as ProductFlag] }))
    ),
    priceRange: {
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
    },
  };
}

/* No re-exports of `@/lib/filters` or `@/lib/variants` here, deliberately.
 *
 * Those modules are client-safe; this one starts with `import "server-only"`.
 * Funnelling their helpers through here gave Client Components an import path
 * that looks harmless and fails the build, and hid which module actually owns
 * each helper. Import them from where they live.
 */
