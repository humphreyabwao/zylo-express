"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";

import type { Address, CartLine, CartTotals, ShippingSpeed } from "@/lib/types";
import { findShippingMethod } from "@/lib/pricing";
import { useHydrated, useSessionValue } from "@/hooks/use-hydrated";
import { formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

interface StoredOrder {
  reference: string;
  email: string;
  lines: CartLine[];
  totals: CartTotals;
  shippingAddress: Address;
  shippingMethodId: ShippingSpeed;
  placedAt: string;
}

export function ConfirmationView() {
  const searchParams = useSearchParams();
  const reference = searchParams.get("ref");

  // The order snapshot is written by the checkout flow just before redirect.
  const hydrated = useHydrated();
  const raw = useSessionValue("zylo.lastOrder");

  const order = React.useMemo<StoredOrder | null>(() => {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as StoredOrder;
      // Ignore a stale snapshot from an earlier order.
      return !reference || parsed.reference === reference ? parsed : null;
    } catch {
      return null;
    }
  }, [raw, reference]);

  if (!hydrated) {
    return <Skeleton className="h-96 w-full" />;
  }

  const method = order ? findShippingMethod(order.shippingMethodId) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="text-center">
        <span className="mx-auto grid size-14 place-items-center border border-champagne-dark text-champagne-dark">
          <Check className="size-6" strokeWidth={1} />
        </span>

        <h1 className="mt-8 font-display text-4xl font-light leading-[1.06] lg:text-5xl">
          Thank you
        </h1>
        <p className="mt-5 text-base font-light leading-relaxed text-muted-foreground">
          Your order has been received and is being prepared by hand.
          {order?.email ? (
            <>
              {" "}
              A confirmation is on its way to{" "}
              <span className="text-foreground">{order.email}</span>.
            </>
          ) : null}
        </p>

        {reference && (
          <p className="mt-8 inline-block border border-hairline px-6 py-3">
            <span className="eyebrow-sm text-muted-foreground">Reference</span>
            <span className="ml-3 font-display text-lg font-light tabular-nums">
              {reference}
            </span>
          </p>
        )}
      </div>

      {order && (
        <div className="mt-16 border border-hairline p-6 lg:p-10">
          <h2 className="eyebrow-sm text-muted-foreground">Your order</h2>

          <ul className="mt-6 space-y-6">
            {order.lines.map((line) => (
              <li key={line.id} className="flex gap-4">
                <div className="relative aspect-3/4 w-16 shrink-0 overflow-hidden bg-secondary">
                  <Image
                    src={line.image.url}
                    alt={line.image.alt}
                    fill
                    sizes="4rem"
                    className="object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/products/${line.slug}`}
                    className="block truncate font-display text-base font-normal hover:opacity-60"
                  >
                    {line.name}
                  </Link>
                  <p className="mt-1 text-xs font-light text-muted-foreground">
                    {line.variantTitle} · Quantity {line.quantity}
                  </p>
                </div>
                <p className="shrink-0 font-display text-sm font-light tabular-nums">
                  {formatPrice(line.price * line.quantity, {
                    currency: line.currency,
                  })}
                </p>
              </li>
            ))}
          </ul>

          <Separator className="my-8" />

          <dl className="space-y-3">
            <Row
              label="Subtotal"
              value={formatPrice(order.totals.subtotal, {
                currency: order.totals.currency,
              })}
            />
            {order.totals.discount > 0 && (
              <Row
                label="Discount"
                value={`−${formatPrice(order.totals.discount, { currency: order.totals.currency })}`}
              />
            )}
            <Row
              label="Delivery"
              value={
                order.totals.shipping === 0
                  ? "Complimentary"
                  : formatPrice(order.totals.shipping, {
                      currency: order.totals.currency,
                    })
              }
            />
            <Row
              label="Tax"
              value={formatPrice(order.totals.tax, {
                currency: order.totals.currency,
              })}
            />
          </dl>

          <Separator className="my-6" />

          <div className="flex items-baseline justify-between gap-4">
            <span className="eyebrow-sm">Total paid</span>
            <span className="font-display text-2xl font-light tabular-nums">
              {formatPrice(order.totals.total, {
                currency: order.totals.currency,
              })}
            </span>
          </div>

          <Separator className="my-8" />

          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <h3 className="eyebrow-sm text-muted-foreground">
                Delivering to
              </h3>
              <address className="mt-3 text-sm font-light not-italic leading-relaxed">
                {order.shippingAddress.firstName} {order.shippingAddress.lastName}
                <br />
                {order.shippingAddress.line1}
                {order.shippingAddress.line2 && (
                  <>
                    <br />
                    {order.shippingAddress.line2}
                  </>
                )}
                <br />
                {order.shippingAddress.city}, {order.shippingAddress.region}{" "}
                {order.shippingAddress.postalCode}
                <br />
                {order.shippingAddress.country}
              </address>
            </div>

            {method && (
              <div>
                <h3 className="eyebrow-sm text-muted-foreground">Method</h3>
                <p className="mt-3 text-sm font-light leading-relaxed">
                  {method.name}
                  <br />
                  <span className="text-champagne-dark">{method.estimate}</span>
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mt-14 flex flex-wrap justify-center gap-4">
        <Button asChild size="lg">
          <Link href="/account/orders">Track your order</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/collections/all">Continue shopping</Link>
        </Button>
      </div>

      <p className="mt-10 text-center text-sm font-light leading-relaxed text-muted-foreground">
        Questions about this order?{" "}
        <Link href="/help/contact" className="link-draw text-foreground">
          Speak with a client advisor
        </Link>
        .
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-sm font-light text-muted-foreground">{label}</dt>
      <dd className="font-display text-sm font-light tabular-nums">{value}</dd>
    </div>
  );
}
