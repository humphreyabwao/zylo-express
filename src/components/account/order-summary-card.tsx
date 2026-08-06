import Image from "next/image";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { ORDER_STATUS, SHIPPING_LABEL, type AccountOrder } from "@/lib/account";
import { cn, formatDate, formatPrice } from "@/lib/utils";

const TONE_CLASS: Record<
  (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS]["tone"],
  string
> = {
  neutral: "border-hairline text-muted-foreground",
  active: "border-champagne-dark/40 text-champagne-dark",
  good: "border-emerald-600/30 text-emerald-700 dark:text-emerald-400",
  warn: "border-amber-600/40 text-amber-700 dark:text-amber-400",
};

/**
 * One order, summarised.
 *
 * A Server Component — it renders order history, which is nobody's business
 * but the signed-in customer's, and there is nothing interactive to hydrate.
 */
export function OrderSummaryCard({ order }: { order: AccountOrder }) {
  const status = ORDER_STATUS[order.status];

  return (
    <article className="border border-hairline">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-hairline p-5 lg:p-6">
        <div>
          <p className="font-display text-lg font-normal tabular-nums">
            {order.reference}
          </p>
          <p className="mt-1 text-xs font-light text-muted-foreground">
            {formatDate(order.placedAt, {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            {" · "}
            {SHIPPING_LABEL[order.shippingMethod]}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <span
            className={cn(
              "rounded-full border px-3 py-1 eyebrow-sm",
              TONE_CLASS[status.tone]
            )}
          >
            {status.label}
          </span>
          <span className="font-display text-lg font-semibold tabular-nums">
            {formatPrice(order.total, { currency: order.currency })}
          </span>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-4 p-5 lg:p-6">
        {/* Overlapping thumbnails: the parcel's contents at a glance without
            listing every line on a summary card. */}
        <ul className="flex shrink-0 -space-x-3">
          {order.lines.slice(0, 4).map((line) => (
            <li
              key={line.id}
              className="relative size-14 overflow-hidden rounded-sm border border-background bg-secondary ring-1 ring-hairline"
            >
              {line.imageUrl && (
                <Image
                  src={line.imageUrl}
                  alt={line.productName}
                  fill
                  sizes="3.5rem"
                  className="object-cover"
                />
              )}
            </li>
          ))}
          {order.lines.length > 4 && (
            <li className="grid size-14 place-items-center rounded-sm border border-background bg-secondary text-xs font-light tabular-nums ring-1 ring-hairline">
              +{order.lines.length - 4}
            </li>
          )}
        </ul>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-light text-muted-foreground">
            {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
          </p>

          {/* Origins are the point of a cross-border order: parcels from
              different countries arrive separately, on different clocks. */}
          {order.origins.length > 0 && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-light text-muted-foreground">
              <span>Ships from</span>
              {order.origins.map((country) => (
                <span key={country.code} className="flex items-center gap-1.5">
                  <span aria-hidden="true">{country.flag}</span>
                  {country.name}
                </span>
              ))}
            </p>
          )}
        </div>

        {order.trackingUrl && (
          <Link
            href={order.trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 eyebrow-sm transition-opacity duration-500 hover:opacity-60"
          >
            Track
            <ExternalLink className="size-3.5" strokeWidth={1.25} />
          </Link>
        )}
      </div>
    </article>
  );
}
