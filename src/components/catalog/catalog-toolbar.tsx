"use client";

import { SlidersHorizontal, X } from "lucide-react";

import type { CatalogFacets, ProductFlag, SortKey } from "@/lib/types";
import { SORT_OPTIONS, activeFilterCount, flagLabel } from "@/lib/filters";
import { useCatalogFilters } from "@/hooks/use-catalog-filters";
import { useUiStore } from "@/store/ui-store";
import { cn, formatPrice, pluralize } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CatalogToolbarProps {
  total: number;
  facets: CatalogFacets;
  className?: string;
}

export function CatalogToolbar({
  total,
  facets,
  className,
}: CatalogToolbarProps) {
  const { filters, setSort, clearAll, removeValue } = useCatalogFilters();
  const openFilters = useUiStore((s) => s.openFilters);
  const count = activeFilterCount(filters);

  const labelFor = (
    key: "categories" | "collections" | "countries" | "colors" | "sizes",
    value: string
  ) => facets[key].find((f) => f.value === value)?.label ?? value;

  const chips: { key: Parameters<typeof removeValue>[0]; value?: string; label: string }[] =
    [
      ...filters.categories.map((v) => ({
        key: "categories" as const,
        value: v,
        label: labelFor("categories", v),
      })),
      ...filters.collections.map((v) => ({
        key: "collections" as const,
        value: v,
        label: labelFor("collections", v),
      })),
      ...filters.countries.map((v) => {
        const country = facets.countries.find((c) => c.value === v);
        return {
          key: "countries" as const,
          value: v,
          // The flag makes an origin chip scannable in a row of text chips.
          label: country ? `${country.flag} ${country.label}` : v,
        };
      }),
      ...filters.colors.map((v) => ({
        key: "colors" as const,
        value: v,
        label: labelFor("colors", v),
      })),
      ...filters.sizes.map((v) => ({
        key: "sizes" as const,
        value: v,
        label: labelFor("sizes", v),
      })),
      ...filters.flags.map((v) => ({
        key: "flags" as const,
        value: v,
        label: flagLabel(v as ProductFlag),
      })),
    ];

  if (typeof filters.minPrice === "number" || typeof filters.maxPrice === "number") {
    chips.push({
      key: "price",
      label:
        typeof filters.minPrice === "number" && typeof filters.maxPrice === "number"
          ? `${formatPrice(filters.minPrice)} – ${formatPrice(filters.maxPrice)}`
          : typeof filters.maxPrice === "number"
            ? `Under ${formatPrice(filters.maxPrice)}`
            : `Above ${formatPrice(filters.minPrice!)}`,
    });
  }

  if (filters.inStockOnly) chips.push({ key: "inStock", label: "In stock" });

  return (
    <div className={cn("space-y-5", className)}>
      {/* Wraps rather than overflows: the sort trigger has a fixed width, and
          below ~340px it and the filter row together exceed the viewport —
          which widens the document and drags the fixed bottom bar with it. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-hairline pb-5">
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={openFilters}
            className="flex items-center gap-2.5 eyebrow-sm text-foreground transition-opacity duration-400 hover:opacity-60 lg:hidden"
          >
            <SlidersHorizontal className="size-3.5" strokeWidth={1.25} />
            Filter
            {count > 0 && <span className="text-champagne-dark">({count})</span>}
          </button>

          <p className="eyebrow-sm text-muted-foreground">
            {total} {pluralize(total, "piece")}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="hidden eyebrow-sm text-muted-foreground sm:inline">
            Sort
          </span>
          <Select
            value={filters.sort}
            onValueChange={(value) => setSort(value as SortKey)}
          >
            <SelectTrigger className="h-9 w-44 border-0 border-b-0 justify-end gap-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {chips.length > 0 && (
        <ul className="flex flex-wrap items-center gap-2.5">
          {chips.map((chip) => (
            <li key={`${chip.key}-${chip.value ?? "single"}`}>
              <button
                type="button"
                onClick={() => removeValue(chip.key, chip.value)}
                className="group/chip flex items-center gap-2 border border-input px-3 py-1.5 eyebrow-sm text-foreground transition-colors duration-400 hover:border-foreground"
              >
                {chip.label}
                <X
                  className="size-3 text-muted-foreground transition-colors duration-400 group-hover/chip:text-foreground"
                  strokeWidth={1.5}
                />
              </button>
            </li>
          ))}

          <li>
            <button
              type="button"
              onClick={clearAll}
              className="link-draw ml-2 eyebrow-sm text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
