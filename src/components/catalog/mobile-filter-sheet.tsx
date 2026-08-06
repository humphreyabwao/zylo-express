"use client";

import type { CatalogFacets } from "@/lib/types";
import { activeFilterCount } from "@/lib/filters";
import { useCatalogFilters } from "@/hooks/use-catalog-filters";
import { useIsFiltersOpen, useUiStore } from "@/store/ui-store";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { FilterPanel } from "@/components/catalog/filter-panel";

interface MobileFilterSheetProps {
  facets: CatalogFacets;
  total: number;
  hide?: Array<"categories" | "collections">;
}

export function MobileFilterSheet({
  facets,
  total,
  hide,
}: MobileFilterSheetProps) {
  const open = useIsFiltersOpen();
  const closeOverlay = useUiStore((s) => s.closeOverlay);
  const { filters, clearAll } = useCatalogFilters();
  const count = activeFilterCount(filters);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && closeOverlay()}>
      <SheetContent side="left" className="w-full sm:max-w-sm lg:hidden">
        <SheetHeader>
          <SheetTitle>
            Filter
            {count > 0 && (
              <span className="ml-2 text-champagne-dark">({count})</span>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4 sm:px-8">
          <FilterPanel facets={facets} hide={hide} />
        </div>

        <SheetFooter>
          <Button block size="lg" onClick={closeOverlay}>
            Show {total} {total === 1 ? "piece" : "pieces"}
          </Button>
          {count > 0 && (
            <Button block variant="ghost" onClick={clearAll}>
              Clear all
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
