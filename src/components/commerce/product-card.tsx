"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";

import type { Product } from "@/lib/types";
import { defaultVariant } from "@/lib/variants";
import { flagLabel } from "@/lib/filters";
import { getCountry } from "@/lib/countries";
import { useCartStore } from "@/store/cart-store";
import { useUiStore } from "@/store/ui-store";
import { cn } from "@/lib/utils";
import { Price } from "@/components/commerce/price";
import { WishlistButton } from "@/components/commerce/wishlist-button";

interface ProductCardProps {
  product: Product;
  /** Sets the `sizes` hint so the browser picks a sensible source. */
  layout?: "grid" | "rail" | "compact";
  priority?: boolean;
  className?: string;
  showQuickAdd?: boolean;
}

const SIZES = {
  grid: "(min-width: 1280px) 24vw, (min-width: 768px) 33vw, 50vw",
  rail: "(min-width: 1024px) 28vw, (min-width: 640px) 45vw, 78vw",
  compact: "(min-width: 768px) 20vw, 40vw",
} as const;

export function ProductCard({
  product,
  layout = "grid",
  priority = false,
  className,
  showQuickAdd = true,
}: ProductCardProps) {
  const addLine = useCartStore((s) => s.addLine);
  const openCart = useUiStore((s) => s.openCart);

  const [primary, secondary] = product.images;
  const colors = product.options.find((o) => o.type === "color")?.values ?? [];
  const soldOut = !product.available;
  const flag = product.flags[0];
  const country = getCountry(product.originCountry);

  const handleQuickAdd = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    const variant = defaultVariant(product);
    const result = addLine(product, variant, 1);

    if (!result.ok) {
      toast.error("Unable to add", { description: result.reason });
      return;
    }

    toast("Added to your bag", {
      description: `${product.name} — ${variant.title}`,
      action: { label: "View bag", onClick: openCart },
    });
  };

  return (
    <article className={cn("group/card relative flex flex-col", className)}>
      <Link
        href={`/products/${product.slug}`}
        className="flex flex-1 flex-col focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-ring"
      >
        <div className="media-zoom relative aspect-3/4 w-full overflow-hidden bg-secondary">
          <Image
            src={primary.url}
            alt={primary.alt}
            fill
            sizes={SIZES[layout]}
            priority={priority}
            className={cn(
              "object-cover",
              secondary && "group-hover/card:opacity-0",
              "transition-opacity duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
            )}
          />

          {secondary && (
            <Image
              src={secondary.url}
              alt=""
              aria-hidden
              fill
              sizes={SIZES[layout]}
              className="object-cover opacity-0 transition-opacity duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/card:opacity-100"
            />
          )}

          {flag && (
            <span className="absolute left-4 top-4 eyebrow-sm bg-background/85 px-2.5 py-1.5 text-foreground backdrop-blur-sm">
              {flagLabel(flag)}
            </span>
          )}

          {soldOut && (
            <span className="absolute inset-x-0 bottom-0 bg-background/85 py-3 text-center eyebrow-sm text-muted-foreground backdrop-blur-sm">
              Sold out
            </span>
          )}

          {showQuickAdd && !soldOut && (
            <div
              className={cn(
                "absolute inset-x-3 bottom-3 hidden md:block",
                "translate-y-3 opacity-0 transition-all duration-600 ease-[cubic-bezier(0.16,1,0.3,1)]",
                "group-hover/card:translate-y-0 group-hover/card:opacity-100",
                "group-focus-within/card:translate-y-0 group-focus-within/card:opacity-100"
              )}
            >
              <button
                type="button"
                onClick={handleQuickAdd}
                className="w-full bg-background/92 py-3.5 eyebrow-sm text-foreground backdrop-blur-sm transition-colors duration-400 hover:bg-primary hover:text-primary-foreground"
              >
                Add to bag
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-1.5 pt-5">
          <h3 className="font-display text-lg font-normal leading-snug">
            {product.name}
          </h3>
          <p className="line-clamp-1 text-sm font-light text-muted-foreground">
            {product.tagline}
          </p>

          {country && (
            <p
              className="flex items-center gap-1.5 pt-0.5 text-xs font-light text-muted-foreground"
              // The flag is decoration; the country name carries the meaning,
              // so screen readers get the sentence without the emoji name.
              aria-label={`Ships from ${country.name}`}
            >
              <span aria-hidden="true" className="text-sm leading-none">
                {country.flag}
              </span>
              <span>Ships from {country.name}</span>
            </p>
          )}

          {/* Tight gap first: at two cards per row on a 320px screen the price
              and a full set of swatches do not both fit at gap-4. */}
          <div className="mt-auto flex items-center justify-between gap-2 pt-2.5 sm:gap-4">
            <Price
              amount={product.price}
              compareAt={product.compareAtPrice}
              currency={product.currency}
              size="sm"
            />

            {colors.length > 1 && (
              <span
                className="flex items-center gap-1.5"
                aria-label={`${colors.length} colours available`}
              >
                {colors.slice(0, 4).map((color) => (
                  <span
                    key={color.value}
                    title={color.label}
                    className="size-2.5 rounded-full ring-1 ring-inset ring-black/15"
                    style={{ backgroundColor: color.hex }}
                  />
                ))}
                {colors.length > 4 && (
                  <span className="text-[0.625rem] font-light text-muted-foreground">
                    +{colors.length - 4}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
      </Link>

      <WishlistButton
        productId={product.id}
        productName={product.name}
        className="absolute right-3 top-3 opacity-0 transition-opacity duration-500 focus-visible:opacity-100 group-hover/card:opacity-100 md:opacity-0"
        size="sm"
      />
    </article>
  );
}
