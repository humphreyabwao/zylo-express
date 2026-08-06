import {
  CATEGORIES,
  COLLECTIONS,
  JOURNAL,
  PRODUCTS,
} from "@/data/catalog";
import type {
  CatalogFacets,
  CatalogFilters,
  Category,
  Collection,
  EditorialArticle,
  FacetCount,
  Product,
  ProductFlag,
  ProductVariant,
  SortKey,
} from "@/lib/types";

/* -------------------------------------------------------------- lookups */

export function getAllProducts(): Product[] {
  return PRODUCTS;
}

export function getProductBySlug(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}

export function getProductsByIds(ids: string[]): Product[] {
  const wanted = new Set(ids);
  return PRODUCTS.filter((p) => wanted.has(p.id));
}

export function getCategories(): Category[] {
  return CATEGORIES;
}

export function getCategoryBySlug(slug: string): Category | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}

export function getCollections(): Collection[] {
  return [...COLLECTIONS].sort((a, b) => a.position - b.position);
}

export function getCollectionBySlug(slug: string): Collection | undefined {
  return COLLECTIONS.find((c) => c.slug === slug);
}

export function getFeaturedCollections(): Collection[] {
  return getCollections().filter((c) => c.isFeatured);
}

export function getJournal(): EditorialArticle[] {
  return [...JOURNAL].sort(
    (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)
  );
}

export function getArticleBySlug(slug: string): EditorialArticle | undefined {
  return JOURNAL.find((a) => a.slug === slug);
}

/* ------------------------------------------------------------ curations */

export function getFeaturedProducts(limit = 8): Product[] {
  return PRODUCTS.filter((p) => p.isFeatured).slice(0, limit);
}

export function getNewArrivals(limit = 8): Product[] {
  return [...PRODUCTS]
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, limit);
}

export function getProductsInCategory(slug: string): Product[] {
  return PRODUCTS.filter((p) => p.categorySlug === slug);
}

export function getProductsInCollection(slug: string): Product[] {
  return PRODUCTS.filter((p) => p.collectionSlugs.includes(slug));
}

/**
 * Related products, ranked: same collection first, then same category,
 * then anything else sharing a price band. Never returns the source product.
 */
export function getRelatedProducts(product: Product, limit = 4): Product[] {
  const scored = PRODUCTS.filter((p) => p.id !== product.id).map((p) => {
    let score = 0;
    const sharedCollections = p.collectionSlugs.filter((s) =>
      product.collectionSlugs.includes(s)
    ).length;
    score += sharedCollections * 4;
    if (p.categorySlug === product.categorySlug) score += 3;
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

export function searchProducts(query: string, limit = 20): Product[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));

  if (!terms.length) return [];

  const scored = PRODUCTS.map((product) => {
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
  }).filter((s) => s.score > 0);

  return scored
    .sort((a, b) => b.score - a.score || b.product.rating - a.product.rating)
    .slice(0, limit)
    .map((s) => s.product);
}

/* --------------------------------------------------------------- filters */

export const DEFAULT_FILTERS: CatalogFilters = {
  categories: [],
  collections: [],
  colors: [],
  sizes: [],
  flags: [],
  inStockOnly: false,
  sort: "featured",
};

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "name-asc", label: "Alphabetical" },
];

function productColors(product: Product): string[] {
  return (
    product.options
      .find((o) => o.type === "color")
      ?.values.map((v) => v.value) ?? []
  );
}

function productSizes(product: Product): string[] {
  return (
    product.options
      .find((o) => o.type === "size")
      ?.values.map((v) => v.value) ?? []
  );
}

export function filterProducts(
  products: Product[],
  filters: CatalogFilters
): Product[] {
  const {
    categories,
    collections,
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

export function sortProducts(products: Product[], sort: SortKey): Product[] {
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

const FLAG_LABELS: Record<ProductFlag, string> = {
  new: "New In",
  exclusive: "Online Exclusive",
  limited: "Limited Edition",
  "made-to-order": "Made to Order",
  "final-sale": "Final Sale",
  archive: "Archive",
};

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
 * shopper toggles refinements — the usual retail behaviour.
 */
export function buildFacets(products: Product[]): CatalogFacets {
  const prices = products.map((p) => p.price);

  return {
    categories: tally(products, (p) => {
      const category = getCategoryBySlug(p.categorySlug);
      return category
        ? [{ value: category.slug, label: category.name }]
        : [];
    }),
    collections: tally(products, (p) =>
      p.collectionSlugs.flatMap((slug) => {
        const collection = getCollectionBySlug(slug);
        return collection
          ? [{ value: collection.slug, label: collection.name }]
          : [];
      })
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
      return (
        option?.values.map((v) => ({ value: v.value, label: v.label })) ?? []
      );
    }),
    flags: tally(products, (p) =>
      p.flags.map((f) => ({ value: f, label: FLAG_LABELS[f] }))
    ),
    priceRange: {
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
    },
  };
}

export function flagLabel(flag: ProductFlag): string {
  return FLAG_LABELS[flag];
}

/* ------------------------------------------------------ variant matching */

/** Finds the variant matching a full set of selected options. */
export function findVariant(
  product: Product,
  selected: Record<string, string>
): ProductVariant | undefined {
  return product.variants.find((variant) =>
    Object.entries(selected).every(
      ([name, value]) => variant.selectedOptions[name] === value
    )
  );
}

/** The variant a product page should open on: first in stock, else first. */
export function defaultVariant(product: Product): ProductVariant {
  return product.variants.find((v) => v.available) ?? product.variants[0];
}

/**
 * Given a partial selection, reports which values of `optionName` still lead
 * to a purchasable variant. Drives the disabled state on swatches and sizes.
 */
export function availableValuesFor(
  product: Product,
  optionName: string,
  selected: Record<string, string>
): Set<string> {
  const others = Object.entries(selected).filter(([k]) => k !== optionName);

  const values = new Set<string>();
  for (const variant of product.variants) {
    if (!variant.available) continue;
    const compatible = others.every(
      ([name, value]) => variant.selectedOptions[name] === value
    );
    if (compatible) values.add(variant.selectedOptions[optionName]);
  }
  return values;
}

/* --------------------------------------------- search-param serialisation */

const LIST_KEYS = [
  "categories",
  "collections",
  "colors",
  "sizes",
  "flags",
] as const;

export function parseFilters(
  params: Record<string, string | string[] | undefined>
): CatalogFilters {
  const read = (key: string): string[] => {
    const raw = params[key];
    if (!raw) return [];
    return (Array.isArray(raw) ? raw : raw.split(","))
      .map((v) => v.trim())
      .filter(Boolean);
  };

  const number = (key: string): number | undefined => {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const sortRaw = Array.isArray(params.sort) ? params.sort[0] : params.sort;
  const sort = SORT_OPTIONS.some((o) => o.value === sortRaw)
    ? (sortRaw as SortKey)
    : "featured";

  const queryRaw = Array.isArray(params.q) ? params.q[0] : params.q;

  return {
    categories: read("categories"),
    collections: read("collections"),
    colors: read("colors"),
    sizes: read("sizes"),
    flags: read("flags") as ProductFlag[],
    minPrice: number("minPrice"),
    maxPrice: number("maxPrice"),
    inStockOnly: params.inStock === "1" || params.inStock === "true",
    query: queryRaw || undefined,
    sort,
  };
}

export function serialiseFilters(filters: CatalogFilters): string {
  const params = new URLSearchParams();

  for (const key of LIST_KEYS) {
    const values = filters[key];
    if (values.length) params.set(key, values.join(","));
  }
  if (typeof filters.minPrice === "number")
    params.set("minPrice", String(filters.minPrice));
  if (typeof filters.maxPrice === "number")
    params.set("maxPrice", String(filters.maxPrice));
  if (filters.inStockOnly) params.set("inStock", "1");
  if (filters.query) params.set("q", filters.query);
  if (filters.sort !== "featured") params.set("sort", filters.sort);

  return params.toString();
}

export function activeFilterCount(filters: CatalogFilters): number {
  return (
    LIST_KEYS.reduce((sum, key) => sum + filters[key].length, 0) +
    (filters.inStockOnly ? 1 : 0) +
    (typeof filters.minPrice === "number" ||
    typeof filters.maxPrice === "number"
      ? 1
      : 0)
  );
}
