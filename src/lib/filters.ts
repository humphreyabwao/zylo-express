/**
 * Filter vocabulary and URL serialisation.
 *
 * Deliberately free of any data import. Client Components need these helpers,
 * and a module that reaches into `@/data/catalog` would drag the entire
 * product catalogue into the browser bundle behind them.
 *
 * Pure functions only — safe on the server and the client.
 */

import type { CatalogFilters, ProductFlag, SortKey } from "@/lib/types";

export const DEFAULT_FILTERS: CatalogFilters = {
  categories: [],
  collections: [],
  countries: [],
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

export const FLAG_LABELS: Record<ProductFlag, string> = {
  new: "New In",
  exclusive: "Online Exclusive",
  limited: "Limited Edition",
  "made-to-order": "Made to Order",
  "final-sale": "Final Sale",
  archive: "Archive",
};

export function flagLabel(flag: ProductFlag): string {
  return FLAG_LABELS[flag];
}

/** Multi-value refinements, all serialised as comma-joined lists. */
const LIST_KEYS = [
  "categories",
  "collections",
  "countries",
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
    // Country codes are uppercase everywhere; normalising on the way in means
    // a hand-typed ?countries=cn still matches.
    countries: read("countries").map((c) => c.toUpperCase()),
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
