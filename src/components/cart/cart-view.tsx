"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";

import { useCartStore } from "@/store/cart-store";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CartLineItem } from "@/components/cart/cart-line-item";
import { FreeShippingMeter } from "@/components/cart/free-shipping-meter";
import { OrderSummary } from "@/components/cart/order-summary";
import { PromotionForm } from "@/components/cart/promotion-form";

export function CartView() {
  const lines = useCartStore((s) => s.lines);
  const hydrated = useCartStore((s) => s.hydrated);
  const getTotals = useCartStore((s) => s.getTotals);

  // Reading totals through the store getter keeps promotion and shipping
  // selections in the same calculation the drawer and checkout use.
  const totals = getTotals();

  if (!hydrated) {
    return (
      <div className="grid gap-12 lg:grid-cols-[1fr_22rem] lg:gap-16">
        <div className="space-y-8">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-6">
              <Skeleton className="aspect-3/4 w-28 sm:w-36" />
              <div className="flex-1 space-y-3 py-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="mt-8 h-8 w-28" />
              </div>
            </div>
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-7 border border-hairline px-8 py-28 text-center">
        <ShoppingBag
          className="size-9 text-muted-foreground"
          strokeWidth={0.75}
        />
        <div className="space-y-3">
          <h2 className="font-display text-3xl font-light">
            Your bag is empty
          </h2>
          <p className="mx-auto max-w-md text-sm font-light leading-relaxed text-muted-foreground">
            Everything we make is finished by hand and made in small numbers.
            Take your time — and save what you like while you decide.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          <Button asChild size="lg">
            <Link href="/collections/new-in">New arrivals</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/collections">Browse collections</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-12 lg:grid-cols-[1fr_22rem] lg:gap-16 xl:gap-20">
      <div>
        <FreeShippingMeter subtotal={totals.subtotal} className="pb-8" />

        <ul className="divide-y divide-hairline border-y border-hairline">
          {lines.map((line) => (
            <CartLineItem key={line.id} line={line} variant="full" />
          ))}
        </ul>

        <div className="mt-8">
          <PromotionForm subtotal={totals.subtotal} className="max-w-sm" />
        </div>
      </div>

      <div className="lg:sticky lg:top-28 lg:h-fit">
        <OrderSummary lines={lines} totals={totals} />

        <Button asChild block size="lg" className="mt-5">
          <Link href="/checkout">Proceed to checkout</Link>
        </Button>

        <Button asChild block variant="ghost" className="mt-2">
          <Link href="/shop">Continue shopping</Link>
        </Button>

        <ul className="mt-8 space-y-3 text-xs font-light leading-relaxed text-muted-foreground">
          <li>Complimentary insured delivery, signature on arrival.</li>
          <li>Thirty-day returns, collection arranged by us.</li>
          <li>Lacquered box and hand-written card at no charge.</li>
        </ul>
      </div>
    </div>
  );
}
