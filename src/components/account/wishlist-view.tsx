"use client";

import Link from "next/link";
import { Heart } from "lucide-react";

import type { Product } from "@/lib/types";
import { useWishlistStore } from "@/store/wishlist-store";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/components/commerce/product-card";

/**
 * The full catalogue is passed in from the server and filtered against the
 * locally-saved ids — no round trip, and the order matches how they were saved.
 */
export function WishlistView({ products }: { products: Product[] }) {
  const productIds = useWishlistStore((s) => s.productIds);
  const hydrated = useWishlistStore((s) => s.hydrated);
  const clear = useWishlistStore((s) => s.clear);

  if (!hydrated) {
    return (
      <ul className="grid grid-cols-2 gap-x-3 gap-y-10 sm:gap-x-5 sm:gap-y-12 lg:grid-cols-3 lg:gap-x-8">
        {[0, 1, 2].map((i) => (
          <li key={i} className="space-y-4">
            <Skeleton className="aspect-3/4 w-full" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </li>
        ))}
      </ul>
    );
  }

  const saved = productIds
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is Product => Boolean(p));

  if (saved.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 border border-hairline px-8 py-24 text-center">
        <Heart className="size-8 text-muted-foreground" strokeWidth={0.75} />
        <div className="space-y-3">
          <h2 className="font-display text-3xl font-light">Nothing saved yet</h2>
          <p className="mx-auto max-w-md text-sm font-light leading-relaxed text-muted-foreground">
            The heart on any piece adds it here. We will write to you if
            something you have saved is running low.
          </p>
        </div>
        <Button asChild>
          <Link href="/shop">Browse the collection</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <h2 className="font-display text-2xl font-light">
          Saved items
          <span className="ml-3 text-base text-muted-foreground">
            ({saved.length})
          </span>
        </h2>
        <button
          type="button"
          onClick={clear}
          className="link-draw eyebrow-sm text-muted-foreground hover:text-foreground"
        >
          Clear all
        </button>
      </div>

      <ul className="mt-8 grid grid-cols-2 gap-x-3 gap-y-10 sm:gap-x-5 sm:gap-y-12 lg:grid-cols-3 lg:gap-x-8">
        {saved.map((product) => (
          <li key={product.id}>
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </div>
  );
}
