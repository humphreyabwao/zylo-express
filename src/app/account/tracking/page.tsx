import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, ExternalLink, Navigation } from "lucide-react";

import {
  getAccountTracking,
  selectActiveTracking,
  type AccountTracking,
} from "@/lib/account";
import { ORDER_STATUS } from "@/lib/order-status";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TrackingTimeline } from "@/components/account/tracking-timeline";
import { CopyLink } from "@/components/account/copy-link";

export const metadata: Metadata = {
  title: "Tracking",
  description: "Follow every parcel on its way to you.",
  robots: { index: false, follow: false },
};

const TONE_CLASS = {
  neutral: "border-hairline text-muted-foreground",
  active: "border-champagne-dark/40 text-champagne-dark",
  good: "border-emerald-600/30 text-emerald-700 dark:text-emerald-400",
  warn: "border-amber-600/40 text-amber-700 dark:text-amber-400",
} as const;

export default async function TrackingPage() {
  const orders = await getAccountTracking();
  const active = selectActiveTracking(orders);

  // Everything else, so a customer can still look up a parcel that arrived last
  // week without hunting through the Orders list for it.
  const past = orders.filter((order) => !active.includes(order));

  if (orders.length === 0) {
    return (
      <div className="border border-hairline px-8 py-20 text-center">
        <Navigation
          className="mx-auto size-7 text-champagne-dark"
          strokeWidth={1}
          aria-hidden="true"
        />
        <h2 className="mt-6 font-display text-2xl font-light">
          Nothing to track yet
        </h2>
        <p className="mx-auto mt-3 max-w-sm text-sm font-light leading-relaxed text-muted-foreground">
          Once you order, every parcel appears here with its progress, where it
          has reached, and a link you can open from anywhere.
        </p>
        <Button asChild className="mt-8">
          <Link href="/shop">Browse the catalogue</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-display text-2xl font-light">Tracking</h2>
      <p className="mt-3 max-w-xl text-sm font-light leading-relaxed text-muted-foreground">
        Pieces from different countries travel separately, so an order can be
        part-delivered. Each parcel updates here as it moves, and we email you at
        every step.
      </p>

      {active.length > 0 && (
        <section className="mt-8">
          <h3 className="eyebrow-sm text-muted-foreground">On the way</h3>
          <ul className="mt-4 space-y-6">
            {active.map((order) => (
              <li key={order.id}>
                <TrackingCard order={order} open />
              </li>
            ))}
          </ul>
        </section>
      )}

      {past.length > 0 && (
        <section className={cn(active.length > 0 && "mt-12")}>
          <h3 className="eyebrow-sm text-muted-foreground">Completed</h3>
          <ul className="mt-4 space-y-6">
            {past.map((order) => (
              <li key={order.id}>
                <TrackingCard order={order} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * One parcel.
 *
 * `<details>` rather than a state hook: this is a Server Component rendering
 * order history, and disclosure is exactly what the element is for. It also
 * means the timeline is in the document for anyone reading with assistive
 * technology or printing the page, rather than existing only after hydration.
 */
function TrackingCard({
  order,
  open = false,
}: {
  order: AccountTracking;
  /** Parcels in transit start expanded — it is why the page was opened. */
  open?: boolean;
}) {
  const status = ORDER_STATUS[order.status];
  const latest = order.events[0];

  return (
    <article className="border border-hairline">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-hairline p-5 lg:p-6">
        <div className="min-w-0">
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
            {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
          </p>
        </div>

        <div className="flex items-center gap-4">
          {order.thumbnails.length > 0 && (
            <ul className="flex shrink-0 -space-x-3">
              {order.thumbnails.map((url) => (
                <li
                  key={url}
                  className="relative size-10 overflow-hidden rounded-sm border border-background bg-secondary ring-1 ring-hairline"
                >
                  <Image
                    src={url}
                    alt=""
                    fill
                    sizes="2.5rem"
                    className="object-cover"
                  />
                </li>
              ))}
            </ul>
          )}

          <span
            className={cn(
              "rounded-full border px-3 py-1 eyebrow-sm",
              TONE_CLASS[status.tone]
            )}
          >
            {status.label}
          </span>
        </div>
      </header>

      {open ? (
        <div className="p-5 lg:p-6">
          <TrackingTimeline
            status={order.status}
            events={order.events}
            cancelledAt={order.cancelledAt}
            cancelReason={order.cancelReason}
            className="[&>ol:first-child]:pt-1"
          />
        </div>
      ) : (
        /*
          A finished order's full journey is a dozen lines of history nobody
          scrolled here for. `<details>` rather than a state hook because this
          is a Server Component and disclosure is exactly what the element does
          — it also means the timeline is in the document for assistive
          technology and for print, rather than existing only after hydration.
        */
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-xs font-light text-muted-foreground transition-colors duration-300 hover:text-foreground lg:px-6 [&::-webkit-details-marker]:hidden">
            <span>
              {order.events.length}{" "}
              {order.events.length === 1 ? "update" : "updates"}
            </span>
            <ChevronDown
              className="size-4 shrink-0 transition-transform duration-300 group-open:rotate-180"
              strokeWidth={1.25}
              aria-hidden="true"
            />
          </summary>

          <div className="border-t border-hairline p-5 lg:p-6">
            <TrackingTimeline
              status={order.status}
              events={order.events}
              cancelledAt={order.cancelledAt}
              cancelReason={order.cancelReason}
              className="[&>ol:first-child]:pt-1"
            />
          </div>
        </details>
      )}

      {(order.trackingNumber || order.trackingUrl || latest) && (
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-hairline px-5 py-4 lg:px-6">
          <div className="min-w-0">
            {order.trackingNumber ? (
              <p className="text-xs font-light text-muted-foreground">
                {order.trackingCarrier ? `${order.trackingCarrier} · ` : ""}
                <span className="tabular-nums text-foreground">
                  {order.trackingNumber}
                </span>
              </p>
            ) : (
              <p className="text-xs font-light text-muted-foreground">
                Share or revisit this parcel with its own link.
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-4">
            <CopyLink
              path={`/track/${order.trackingToken}`}
              label={order.reference}
            />

            {order.trackingUrl && (
              <Link
                href={order.trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 eyebrow-sm transition-opacity duration-500 hover:opacity-60"
              >
                Carrier
                <ExternalLink className="size-3.5" strokeWidth={1.25} />
              </Link>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
