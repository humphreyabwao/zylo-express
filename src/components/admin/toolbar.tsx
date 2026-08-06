"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * List-view filters.
 *
 * State lives in the URL, not in this component. That is what makes a filtered
 * view shareable and survivable — an operator can send "out of stock, page 3"
 * to a colleague, and the browser's back button steps through filter changes
 * the way it should.
 *
 * Typing is debounced before it reaches the URL. Pushing on every keystroke
 * would put one history entry per character, making Back useless.
 */

const DEBOUNCE_MS = 350;

export interface SelectFilter {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
}

export function ListToolbar({
  searchPlaceholder = "Search…",
  filters = [],
  children,
}: {
  searchPlaceholder?: string;
  filters?: SelectFilter[];
  /** Actions rendered at the right-hand end. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [term, setTerm] = React.useState(searchParams.get("q") ?? "");
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = React.useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());

      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === "") params.delete(key);
        else params.set(key, value);
      }

      // Any filter change invalidates the current page number: page 7 of the
      // old result set is very unlikely to exist in the new one, and landing on
      // an empty page reads as "no results".
      params.delete("page");

      const query = params.toString();
      router.push(query ? `${pathname}?${query}` : pathname);
    },
    [pathname, router, searchParams]
  );

  const onSearchChange = (value: string) => {
    setTerm(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => commit({ q: value || null }), DEBOUNCE_MS);
  };

  React.useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  return (
    <div className="flex flex-col gap-3 border-b border-admin-line px-5 py-3.5 lg:flex-row lg:items-center">
      <div className="relative min-w-0 flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-admin-faint"
          strokeWidth={1.8}
        />
        <input
          type="search"
          value={term}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="h-9 w-full rounded-md border border-admin-line bg-transparent pl-9 pr-9 text-[0.8125rem] text-admin-fg outline-none transition-colors duration-200 placeholder:text-admin-faint focus:border-champagne"
        />
        {term && (
          <button
            type="button"
            onClick={() => {
              setTerm("");
              if (timerRef.current) clearTimeout(timerRef.current);
              commit({ q: null });
            }}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-admin-faint transition-colors hover:text-admin-fg"
          >
            <X className="size-3.5" strokeWidth={2} />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {filters.map((filter) => (
          <select
            key={filter.name}
            aria-label={filter.label}
            defaultValue={searchParams.get(filter.name) ?? filter.defaultValue ?? ""}
            onChange={(event) =>
              commit({ [filter.name]: event.target.value || null })
            }
            className={cn(
              "h-9 rounded-md border border-admin-line bg-transparent px-3 text-[0.8125rem] font-medium text-admin-fg outline-none transition-colors duration-200 focus:border-champagne",
              // Native selects inherit the page background for their popup in
              // most browsers; forcing the panel colour keeps it legible in dark.
              "[&>option]:bg-admin-panel [&>option]:text-admin-fg"
            )}
          >
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ))}

        {children}
      </div>
    </div>
  );
}
