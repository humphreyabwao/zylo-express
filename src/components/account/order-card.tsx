import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import type { Order } from "@/lib/types";
import { ORDER_STATUS_COPY } from "@/data/account";
import { cn, formatDate, formatPrice, pluralize } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const STATUS_TONE: Record<Order["status"], string> = {
  pending: "text-muted-foreground",
  confirmed: "text-muted-foreground",
  "in-atelier": "text-champagne-dark",
  shipped: "text-champagne-dark",
  delivered: "text-success",
  cancelled: "text-destructive",
  refunded: "text-destructive",
};

export function OrderCard({ order }: { order: Order }) {
  const status = ORDER_STATUS_COPY[order.status];

  return (
    <article className="border border-hairline">
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4 border-b border-hairline p-5 sm:p-7">
        <div className="grid gap-x-10 gap-y-4 sm:grid-cols-3">
          <div>
            <p className="eyebrow-sm text-muted-foreground">Order</p>
            <p className="mt-2 font-display text-base font-light tabular-nums">
              {order.reference}
            </p>
          </div>
          <div>
            <p className="eyebrow-sm text-muted-foreground">Placed</p>
            <p className="mt-2 text-sm font-light">
              {formatDate(order.placedAt, {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
          <div>
            <p className="eyebrow-sm text-muted-foreground">Total</p>
            <p className="mt-2 font-display text-base font-light tabular-nums">
              {formatPrice(order.totals.total, {
                currency: order.totals.currency,
              })}
            </p>
          </div>
        </div>

        <div className="text-right">
          <p className={cn("eyebrow-sm", STATUS_TONE[order.status])}>
            {status.label}
          </p>
          <p className="mt-2 max-w-56 text-xs font-light leading-relaxed text-muted-foreground">
            {status.description}
          </p>
        </div>
      </header>

      <ul className="divide-y divide-hairline">
        {order.lines.map((line) => (
          <li key={line.id} className="flex gap-4 p-5 sm:gap-6 sm:p-7">
            <Link
              href={`/products/${line.slug}`}
              className="media-zoom relative aspect-3/4 w-20 shrink-0 overflow-hidden bg-secondary sm:w-24"
            >
              <Image
                src={line.image.url}
                alt={line.image.alt}
                fill
                sizes="6rem"
                className="object-cover"
              />
            </Link>

            <div className="flex min-w-0 flex-1 flex-col">
              <Link
                href={`/products/${line.slug}`}
                className="truncate font-display text-base font-normal hover:opacity-60"
              >
                {line.name}
              </Link>
              <p className="mt-1 eyebrow-sm text-muted-foreground">
                {line.variantTitle}
              </p>
              <p className="mt-1 text-xs font-light text-muted-foreground">
                Quantity {line.quantity}
              </p>

              <div className="mt-auto pt-4">
                <Button asChild variant="outline" size="sm">
                  <Link href={`/products/${line.slug}`}>Buy again</Link>
                </Button>
              </div>
            </div>

            <p className="shrink-0 font-display text-sm font-light tabular-nums">
              {formatPrice(line.price * line.quantity, {
                currency: line.currency,
              })}
            </p>
          </li>
        ))}
      </ul>

      <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-hairline p-5 sm:p-7">
        <p className="text-sm font-light text-muted-foreground">
          {order.totals.itemCount}{" "}
          {pluralize(order.totals.itemCount, "piece")} ·{" "}
          {order.shippingMethod.name}
        </p>

        <div className="flex flex-wrap gap-3">
          {order.trackingUrl && (
            <Button asChild variant="outline" size="sm">
              <a
                href={order.trackingUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                Track parcel
                <ArrowUpRight className="size-3.5" strokeWidth={1.25} />
              </a>
            </Button>
          )}
          <Button asChild variant="ghost" size="sm">
            <Link href="/help/contact">Need help?</Link>
          </Button>
        </div>
      </footer>
    </article>
  );
}
