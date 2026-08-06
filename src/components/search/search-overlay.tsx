"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

import { useIsSearchOpen, useUiStore } from "@/store/ui-store";
import { cn, formatPrice } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

const SUGGESTIONS = [
  "Aurelia",
  "Cashmere coat",
  "Signet ring",
  "Chronograph",
  "Silk scarf",
  "Noir Absolu",
];

/** The trimmed result shape returned by /api/search. */
interface Suggestion {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  price: number;
  currency: string;
  originCountry: string;
  image: { url: string; alt: string } | null;
}

export interface SearchOverlayProps {
  /**
   * Fetched on the server and passed down. Reading the catalogue here would
   * pull it into the client bundle, which is the whole reason search moved to
   * a route handler.
   */
  categories: { slug: string; name: string }[];
}

export function SearchOverlay({ categories }: SearchOverlayProps) {
  const open = useIsSearchOpen();
  const closeOverlay = useUiStore((s) => s.closeOverlay);
  const router = useRouter();

  const [query, setQuery] = React.useState("");
  /**
   * Results stored together with the query that produced them. Comparing that
   * query against the current input makes "are these results still valid?" a
   * derived value, so nothing has to be cleared imperatively when the user
   * types or deletes — and stale results can never flash for a newer query.
   */
  const [data, setData] = React.useState<{
    query: string;
    results: Suggestion[];
  }>({ query: "", results: [] });
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Reset between openings so the panel never reopens mid-search. Done during
  // render rather than in an effect — it is a reaction to a prop change, and
  // an effect would render the stale query for a frame first.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    // Clearing the query is enough: results are derived from whether they
    // match the current input, so stale ones stop showing immediately.
    if (open) setQuery("");
  }

  // Focus once the panel's open transition has settled.
  React.useEffect(() => {
    if (!open) return;
    const focus = setTimeout(() => inputRef.current?.focus(), 260);
    return () => clearTimeout(focus);
  }, [open]);

  const trimmed = query.trim();

  /**
   * Debounced fetch against /api/search.
   *
   * The AbortController is not just tidiness: without it a slow response for
   * "au" can land after a fast one for "aurelia" and overwrite the newer
   * results. Aborting the previous request makes the last keystroke win.
   */
  React.useEffect(() => {
    if (trimmed.length < 2) return;

    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}&limit=6`,
          { signal: controller.signal }
        );
        if (!response.ok) throw new Error(`Search failed: ${response.status}`);

        const payload = (await response.json()) as { results: Suggestion[] };
        setData({ query: trimmed, results: payload.results ?? [] });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("[search]", error);
          setData({ query: trimmed, results: [] });
        }
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  // Derived, not stored: results only count when they match what is typed now.
  const settled = data.query === trimmed;
  const results = settled ? data.results : [];
  const searching = trimmed.length > 1 && !settled;
  const noResults = trimmed.length > 1 && settled && results.length === 0;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!trimmed) return;
    closeOverlay();
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !next && closeOverlay()}>
      <SheetContent
        side="top"
        showClose={false}
        className="max-h-[92vh] overflow-y-auto"
      >
        <SheetTitle className="sr-only">Search</SheetTitle>

        <div className="container-shell py-8 lg:py-12">
          <form onSubmit={submit} className="flex items-center gap-4">
            <Search
              className="size-5 shrink-0 text-muted-foreground"
              strokeWidth={1.25}
            />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="search"
              placeholder="Search the maison"
              aria-label="Search products"
              className="h-14 w-full border-0 bg-transparent font-display text-2xl font-light outline-none placeholder:text-muted-foreground/60 lg:text-4xl"
            />
            <button
              type="button"
              onClick={closeOverlay}
              aria-label="Close search"
              className="grid size-10 shrink-0 place-items-center text-muted-foreground transition-colors duration-400 hover:text-foreground"
            >
              <X className="size-5" strokeWidth={1.25} />
            </button>
          </form>

          {/* The rule doubles as the loading indicator: a hairline that fills
              while a request is in flight, rather than a spinner. */}
          <div className="mt-2 h-px w-full overflow-hidden bg-hairline">
            <span
              className={cn(
                "block h-full w-full origin-left bg-champagne-dark transition-transform duration-500 ease-out",
                searching ? "scale-x-100" : "scale-x-0"
              )}
              aria-hidden="true"
            />
          </div>
          <span role="status" aria-live="polite" className="sr-only">
            {searching
              ? "Searching"
              : trimmed.length > 1
                ? `${results.length} results for ${trimmed}`
                : ""}
          </span>

          {results.length > 0 ? (
            <div className="mt-10">
              <p className="eyebrow-sm mb-6 text-muted-foreground">
                Products
              </p>
              <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
                {results.map((product) => (
                  <li key={product.id}>
                    <Link
                      href={`/products/${product.slug}`}
                      onClick={closeOverlay}
                      className="group/result flex items-center gap-4"
                    >
                      <div className="relative aspect-3/4 w-16 shrink-0 overflow-hidden bg-secondary">
                        {product.image && (
                          <Image
                            src={product.image.url}
                            alt={product.image.alt}
                            fill
                            sizes="4rem"
                            className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/result:scale-105"
                          />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-display text-base font-normal">
                          {product.name}
                        </p>
                        <p className="mt-0.5 truncate text-xs font-light text-muted-foreground">
                          {product.tagline}
                        </p>
                        <p className="mt-1 font-display text-sm font-semibold tabular-nums">
                          {formatPrice(product.price, {
                            currency: product.currency as "USD" | "EUR" | "GBP",
                          })}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={submit}
                className="link-draw mt-10 eyebrow-sm text-foreground"
              >
                View all results for “{trimmed}”
              </button>
            </div>
          ) : noResults ? (
            <div className="mt-14 space-y-3">
              <p className="font-display text-2xl font-light">
                Nothing matches “{trimmed}”
              </p>
              <p className="text-sm font-light text-muted-foreground">
                Try a house name, a material, or the category you have in mind.
              </p>
            </div>
          ) : (
            <div className="mt-12 grid gap-12 sm:grid-cols-2">
              <div>
                <p className="eyebrow-sm mb-5 text-muted-foreground">
                  Suggestions
                </p>
                <ul className="flex flex-wrap gap-x-6 gap-y-3">
                  {SUGGESTIONS.map((suggestion) => (
                    <li key={suggestion}>
                      <button
                        type="button"
                        onClick={() => setQuery(suggestion)}
                        className="link-draw text-sm font-light text-foreground/80 hover:text-foreground"
                      >
                        {suggestion}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="eyebrow-sm mb-5 text-muted-foreground">
                  Collections
                </p>
                <ul className="grid grid-cols-2 gap-x-6 gap-y-3">
                  {categories.map((category) => (
                    <li key={category.slug}>
                      <Link
                        href={`/category/${category.slug}`}
                        onClick={closeOverlay}
                        className="link-draw text-sm font-light text-foreground/80 hover:text-foreground"
                      >
                        {category.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
