import Link from "next/link";

import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion/reveal";
import { ProductCard } from "@/components/commerce/product-card";

interface ProductGridProps {
  products: Product[];
  className?: string;
  columns?: 3 | 4;
  emptyAction?: { href: string; label: string };
}

export function ProductGrid({
  products,
  className,
  columns = 3,
  emptyAction = { href: "/shop", label: "Browse everything" },
}: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className="flex min-h-[24rem] flex-col items-center justify-center gap-6 border border-hairline px-8 py-20 text-center">
        <div className="space-y-3">
          <h2 className="font-display text-3xl font-light">
            Nothing matches those refinements
          </h2>
          <p className="mx-auto max-w-md text-sm font-light leading-relaxed text-muted-foreground">
            Try removing a filter, or widening the price band. The collection is
            small by design.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={emptyAction.href}>{emptyAction.label}</Link>
        </Button>
      </div>
    );
  }

  return (
    <ul
      className={cn(
        // Two per row from the smallest screen up — a single column wastes
        // most of a phone and buries the third product below the fold.
        "grid grid-cols-2 gap-x-3 gap-y-10 sm:gap-x-5 sm:gap-y-12 lg:gap-x-8",
        columns === 3 ? "lg:grid-cols-3" : "lg:grid-cols-3 xl:grid-cols-4",
        className
      )}
    >
      {products.map((product, index) => (
        <li key={product.id}>
          {/* Only the first two rows animate; below the fold the observer handles it. */}
          <Reveal delay={index < 6 ? index * 60 : 0}>
            <ProductCard product={product} priority={index < 3} />
          </Reveal>
        </li>
      ))}
    </ul>
  );
}
