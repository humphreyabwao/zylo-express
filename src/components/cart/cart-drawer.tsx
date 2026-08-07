"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";

import { useCartStore } from "@/store/cart-store";
import { useIsCartOpen, useUiStore } from "@/store/ui-store";
import { computeSubtotal } from "@/lib/pricing";
import {pluralize} from "@/lib/utils";
import { useCurrency } from "@/components/commerce/currency-provider";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CartLineItem } from "@/components/cart/cart-line-item";
import { FreeShippingMeter } from "@/components/cart/free-shipping-meter";

export function CartDrawer() {
  const { format } = useCurrency();
  const open = useIsCartOpen();
  const closeOverlay = useUiStore((s) => s.closeOverlay);

  const lines = useCartStore((s) => s.lines);
  const hydrated = useCartStore((s) => s.hydrated);

  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = computeSubtotal(lines);
  const empty = hydrated && lines.length === 0;

  return (
    <Sheet open={open} onOpenChange={(next) => !next && closeOverlay()}>
      <SheetContent side="right" className="w-full sm:max-w-[30rem]">
        <SheetHeader>
          <SheetTitle>
            Shopping Bag
            {hydrated && itemCount > 0 && (
              <span className="ml-2 text-muted-foreground">
                ({itemCount} {pluralize(itemCount, "item")})
              </span>
            )}
          </SheetTitle>
        </SheetHeader>

        {!hydrated ? (
          <div className="flex-1" aria-hidden />
        ) : empty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
            <ShoppingBag
              className="size-8 text-muted-foreground"
              strokeWidth={0.75}
            />
            <div className="space-y-2">
              <p className="font-display text-2xl font-light">
                Your bag is empty
              </p>
              <p className="text-sm font-light text-muted-foreground">
                Everything we make is finished by hand. Take your time.
              </p>
            </div>
            <Button asChild variant="outline" onClick={closeOverlay}>
              <Link href="/collections/new-in">Explore new arrivals</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="border-b border-hairline px-6 py-5 sm:px-8">
              <FreeShippingMeter subtotal={subtotal} />
            </div>

            <ul className="flex-1 divide-y divide-hairline overflow-y-auto px-6 sm:px-8">
              {lines.map((line) => (
                <CartLineItem
                  key={line.id}
                  line={line}
                  onNavigate={closeOverlay}
                />
              ))}
            </ul>

            <SheetFooter>
              <div className="flex items-baseline justify-between">
                <span className="eyebrow-sm text-muted-foreground">
                  Subtotal
                </span>
                <span className="text-2xl font-semibold tabular-nums">
                  {format(subtotal)}
                </span>
              </div>

              <p className="text-xs font-light text-muted-foreground">
                Duties and taxes are calculated at checkout.
              </p>

              <Button asChild block size="lg" className="mt-2">
                <Link href="/checkout" onClick={closeOverlay}>
                  Proceed to checkout
                </Link>
              </Button>

              <Button asChild variant="ghost" block>
                <Link href="/cart" onClick={closeOverlay}>
                  View bag
                </Link>
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
