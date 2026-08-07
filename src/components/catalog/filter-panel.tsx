"use client";

import * as React from "react";

import type { CatalogFacets } from "@/lib/types";
import { useCatalogFilters } from "@/hooks/use-catalog-filters";
import {cn} from "@/lib/utils";
import { useCurrency } from "@/components/commerce/currency-provider";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";

interface FilterPanelProps {
  facets: CatalogFacets;
  /** Facets already implied by the route are hidden to avoid dead controls. */
  hide?: Array<"categories" | "collections" | "countries">;
  className?: string;
}

const PRICE_BANDS = [
  { label: "Under $500", min: undefined, max: 50000 },
  { label: "$500 – $1,500", min: 50000, max: 150000 },
  { label: "$1,500 – $4,000", min: 150000, max: 400000 },
  { label: "$4,000 – $8,000", min: 400000, max: 800000 },
  { label: "Above $8,000", min: 800000, max: undefined },
];

export function FilterPanel({ facets, hide = [], className }: FilterPanelProps) {
  const { format } = useCurrency();
  const {
    filters,
    toggleValue,
    toggleFlag,
    setPriceRange,
    setInStockOnly,
  } = useCatalogFilters();

  const sections = [
    !hide.includes("categories") && facets.categories.length > 1
      ? { key: "categories" as const, label: "Category", facets: facets.categories }
      : null,
    !hide.includes("collections") && facets.collections.length > 0
      ? { key: "collections" as const, label: "Collection", facets: facets.collections }
      : null,
    facets.colors.length > 0
      ? { key: "colors" as const, label: "Colour", facets: facets.colors }
      : null,
    facets.sizes.length > 0
      ? { key: "sizes" as const, label: "Size", facets: facets.sizes }
      : null,
  ].filter(Boolean) as {
    key: "categories" | "collections" | "colors" | "sizes";
    label: string;
    facets: CatalogFacets["categories"];
  }[];

  const activeBand = PRICE_BANDS.find(
    (band) => band.min === filters.minPrice && band.max === filters.maxPrice
  );

  return (
    <div className={cn("w-full", className)}>
      <Accordion
        type="multiple"
        defaultValue={["Category", "Ships from", "Colour", "Price"]}
        className="w-full"
      >
        {/* Origin sits high in the panel: on ZYLO Express it drives the
            delivery estimate, so it is a shipping decision as much as a
            merchandising one. Rendered separately because each row carries a
            flag and a lead-time line the generic facet list has no room for. */}
        {!hide.includes("countries") && facets.countries.length > 0 && (
          <AccordionItem value="Ships from">
            <AccordionTrigger>
              Ships from
              {filters.countries.length > 0 && (
                <span className="ml-auto mr-3 text-champagne-dark">
                  {filters.countries.length}
                </span>
              )}
            </AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-3.5">
                {facets.countries.map((country) => (
                  <li key={country.value}>
                    <label className="flex cursor-pointer items-center gap-3">
                      <Checkbox
                        checked={filters.countries.includes(country.value)}
                        onCheckedChange={() =>
                          toggleValue("countries", country.value)
                        }
                      />
                      <span aria-hidden="true" className="text-base leading-none">
                        {country.flag}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-sm font-light text-foreground">
                          {country.label}
                        </span>
                        <span className="block text-xs font-light text-muted-foreground">
                          {country.leadTimeMinDays}–{country.leadTimeMaxDays} days
                        </span>
                      </span>
                      <span className="text-xs font-light tabular-nums text-muted-foreground">
                        {country.count}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        )}

        {sections.map((section) => (
          <AccordionItem key={section.key} value={section.label}>
            <AccordionTrigger>
              {section.label}
              {filters[section.key].length > 0 && (
                <span className="ml-auto mr-3 text-champagne-dark">
                  {filters[section.key].length}
                </span>
              )}
            </AccordionTrigger>
            <AccordionContent>
              <ul
                className={cn(
                  section.key === "sizes"
                    ? "grid grid-cols-3 gap-2"
                    : "space-y-3.5"
                )}
              >
                {section.facets.map((facet) => {
                  const checked = filters[section.key].includes(facet.value);

                  if (section.key === "sizes") {
                    return (
                      <li key={facet.value}>
                        <button
                          type="button"
                          onClick={() => toggleValue(section.key, facet.value)}
                          aria-pressed={checked}
                          className={cn(
                            "w-full border px-2 py-2.5 text-xs font-light transition-colors duration-400",
                            checked
                              ? "border-foreground bg-foreground text-background"
                              : "border-input hover:border-foreground"
                          )}
                        >
                          {facet.label}
                        </button>
                      </li>
                    );
                  }

                  return (
                    <li key={facet.value}>
                      <label className="group/facet flex cursor-pointer items-center gap-3">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() =>
                            toggleValue(section.key, facet.value)
                          }
                        />
                        {facet.hex && (
                          <span
                            className="size-3.5 rounded-full ring-1 ring-inset ring-black/15"
                            style={{ backgroundColor: facet.hex }}
                            aria-hidden
                          />
                        )}
                        <span className="flex-1 text-sm font-light text-foreground">
                          {facet.label}
                        </span>
                        <span className="text-xs font-light tabular-nums text-muted-foreground">
                          {facet.count}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </AccordionContent>
          </AccordionItem>
        ))}

        <AccordionItem value="Price">
          <AccordionTrigger>Price</AccordionTrigger>
          <AccordionContent>
            <ul className="space-y-3.5">
              {PRICE_BANDS.map((band) => {
                const checked = activeBand?.label === band.label;
                return (
                  <li key={band.label}>
                    <label className="flex cursor-pointer items-center gap-3">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() =>
                          checked
                            ? setPriceRange(undefined, undefined)
                            : setPriceRange(band.min, band.max)
                        }
                      />
                      <span className="text-sm font-light text-foreground">
                        {band.label}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>

            <p className="mt-5 text-xs font-light text-muted-foreground">
              This selection ranges {format(facets.priceRange.min)} –{" "}
              {format(facets.priceRange.max)}.
            </p>
          </AccordionContent>
        </AccordionItem>

        {facets.flags.length > 0 && (
          <AccordionItem value="Attributes">
            <AccordionTrigger>Attributes</AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-3.5">
                {facets.flags.map((facet) => (
                  <li key={facet.value}>
                    <label className="flex cursor-pointer items-center gap-3">
                      <Checkbox
                        checked={filters.flags.includes(
                          facet.value as (typeof filters.flags)[number]
                        )}
                        onCheckedChange={() =>
                          toggleFlag(
                            facet.value as (typeof filters.flags)[number]
                          )
                        }
                      />
                      <span className="flex-1 text-sm font-light text-foreground">
                        {facet.label}
                      </span>
                      <span className="text-xs font-light tabular-nums text-muted-foreground">
                        {facet.count}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>
        )}

        <AccordionItem value="Availability">
          <AccordionTrigger>Availability</AccordionTrigger>
          <AccordionContent>
            <label className="flex cursor-pointer items-center gap-3">
              <Checkbox
                checked={filters.inStockOnly}
                onCheckedChange={(checked) => setInStockOnly(checked === true)}
              />
              <span className="text-sm font-light text-foreground">
                In stock only
              </span>
            </label>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
