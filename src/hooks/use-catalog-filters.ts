"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { DEFAULT_FILTERS, parseFilters, serialiseFilters } from "@/lib/filters";
import type { CatalogFilters, ProductFlag, SortKey } from "@/lib/types";

type ListKey = "categories" | "collections" | "countries" | "colors" | "sizes";

/**
 * The URL is the single source of truth for refinements — shoppers share and
 * bookmark filtered views, and the back button has to undo them one at a time.
 * Writes are transitions so the grid can show a pending state without blocking.
 */
export function useCatalogFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  const filters = React.useMemo(() => {
    const params: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      params[key] = value;
    });
    return parseFilters(params);
  }, [searchParams]);

  const commit = React.useCallback(
    (next: CatalogFilters) => {
      const query = serialiseFilters(next);
      startTransition(() => {
        router.replace(query ? `${pathname}?${query}` : pathname, {
          scroll: false,
        });
      });
    },
    [pathname, router]
  );

  const toggleValue = React.useCallback(
    (key: ListKey, value: string) => {
      const current = filters[key];
      commit({
        ...filters,
        [key]: current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value],
      });
    },
    [filters, commit]
  );

  const toggleFlag = React.useCallback(
    (value: ProductFlag) => {
      commit({
        ...filters,
        flags: filters.flags.includes(value)
          ? filters.flags.filter((v) => v !== value)
          : [...filters.flags, value],
      });
    },
    [filters, commit]
  );

  const setPriceRange = React.useCallback(
    (min?: number, max?: number) => {
      commit({ ...filters, minPrice: min, maxPrice: max });
    },
    [filters, commit]
  );

  const setInStockOnly = React.useCallback(
    (value: boolean) => commit({ ...filters, inStockOnly: value }),
    [filters, commit]
  );

  const setSort = React.useCallback(
    (sort: SortKey) => commit({ ...filters, sort }),
    [filters, commit]
  );

  const clearAll = React.useCallback(() => {
    // Sort is a view preference, not a refinement — it survives "clear all".
    commit({ ...DEFAULT_FILTERS, sort: filters.sort, query: filters.query });
  }, [commit, filters.sort, filters.query]);

  const removeValue = React.useCallback(
    (key: ListKey | "flags" | "price" | "inStock", value?: string) => {
      if (key === "price") return setPriceRange(undefined, undefined);
      if (key === "inStock") return setInStockOnly(false);
      if (key === "flags") return toggleFlag(value as ProductFlag);
      return toggleValue(key, value as string);
    },
    [setPriceRange, setInStockOnly, toggleFlag, toggleValue]
  );

  return {
    filters,
    isPending,
    toggleValue,
    toggleFlag,
    setPriceRange,
    setInStockOnly,
    setSort,
    clearAll,
    removeValue,
  };
}
