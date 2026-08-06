"use client";

import Image from "next/image";
import Link from "next/link";

import type { CartLine, CartTotals } from "@/lib/types";
import { cn, formatPrice, pluralize } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

interface OrderSummaryProps {
  lines: CartLine[];
  totals: CartTotals;
  className?: string;
  /** Renders the line thumbnails — used on checkout, omitted on the cart page. */
  showLines?: boolean;
  heading?: string;
}

export function OrderSummary({
  lines,
  totals,
  className,
  showLines = false,
  heading = "Order summary",
}: OrderSummaryProps) {
  return (
    <div className={cn("border border-hairline p-6 lg:p-8", className)}>
      <h2 className="eyebrow-sm text-muted-foreground">{heading}</h2>

      {showLines && lines.length > 0 && (
        <>
          <ul className="mt-6 space-y-5">
            {lines.map((line) => (
              <li key={line.id} className="flex gap-4">
                <Link
                  href={`/products/${line.slug}`}
                  className="relative aspect-3/4 w-16 shrink-0 overflow-hidden bg-secondary"
                >
                  <Image
                    src={line.image.url}
                    alt={line.image.alt}
                    fill
                    sizes="4rem"
                    className="object-cover"
                  />
                  <span className="absolute right-0 top-0 grid size-5 place-items-center bg-obsidian text-[0.625rem] tabular-nums text-porcelain">
                    {line.quantity}
                  </span>
                </Link>

                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-sm font-normal">
                    {line.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs font-light text-muted-foreground">
                    {line.variantTitle}
                  </p>
                </div>

                <p className="shrink-0 text-sm font-semibold tabular-nums">
                  {formatPrice(line.price * line.quantity, {
                    currency: line.currency,
                  })}
                </p>
              </li>
            ))}
          </ul>
          <Separator className="my-6" />
        </>
      )}

      <dl className={cn("space-y-3.5", !showLines && "mt-6")}>
        <Row
          label={`Subtotal (${totals.itemCount} ${pluralize(totals.itemCount, "item")})`}
          value={formatPrice(totals.subtotal, { currency: totals.currency })}
        />

        {totals.discount > 0 && (
          <Row
            label="Discount"
            value={`−${formatPrice(totals.discount, { currency: totals.currency })}`}
            accent
          />
        )}

        <Row
          label="Delivery"
          value={
            totals.shipping === 0
              ? "Complimentary"
              : formatPrice(totals.shipping, { currency: totals.currency })
          }
        />

        <Row
          label="Estimated tax"
          value={formatPrice(totals.tax, { currency: totals.currency })}
        />
      </dl>

      <Separator className="my-6" />

      <div className="flex items-baseline justify-between gap-4">
        <span className="eyebrow-sm text-foreground">Total</span>
        <span className="text-2xl font-semibold tabular-nums">
          {formatPrice(totals.total, { currency: totals.currency })}
        </span>
      </div>

      <p className="mt-4 text-xs font-light leading-relaxed text-muted-foreground">
        Duties are included for delivery within the United States. Final tax is
        confirmed once the delivery address is entered.
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-sm font-light text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "font-display text-sm font-light tabular-nums",
          accent ? "text-champagne-dark" : "text-foreground"
        )}
      >
        {value}
      </dd>
    </div>
  );
}
