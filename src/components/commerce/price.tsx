"use client";

import { cn, discountPercent } from "@/lib/utils";
import { formatCurrency } from "@/lib/currency";
import { useCurrency } from "@/components/commerce/currency-provider";

/**
 * A catalogue price, in the shopper's display currency.
 *
 * A Client Component since the display currency lives in context. That is
 * cheap here — this is a leaf, so importing it into a Server Component turns
 * only this span into client code, not the page around it.
 *
 * `amount` and `compareAt` are always **base-currency minor units**, exactly as
 * stored. Conversion happens here and nowhere else, so there is one place a
 * price can be wrong rather than fifty.
 */

interface PriceProps {
  /** Base-currency minor units, as stored on the product row. */
  amount: number;
  compareAt?: number | null;
  /**
   * Force a currency instead of the shopper's.
   *
   * For money that has already been recorded — an order total, a payment —
   * where converting at today's rate would show a number nobody was charged.
   * Pass the currency the amount was booked in.
   */
  currency?: string;
  className?: string;
  /** `lg` is used on the product page, `sm` inside the cart. */
  size?: "sm" | "md" | "lg";
  showDiscount?: boolean;
}

export function Price({
  amount,
  compareAt,
  currency,
  className,
  size = "md",
  showDiscount = false,
}: PriceProps) {
  const { format } = useCurrency();

  // A fixed currency skips conversion entirely: the amount is already in it.
  const render = (value: number) =>
    currency ? formatCurrency(value, currency) : format(value);

  const onSale = typeof compareAt === "number" && compareAt > amount;

  // Price is set in the interface face, not the display serif — a semibold
  // sans reads heavier at small sizes and is what the shopper scans for.
  const sizes = {
    sm: "text-[0.9375rem]",
    md: "text-base",
    lg: "text-2xl",
  } as const;

  return (
    <span className={cn("inline-flex items-baseline gap-2.5", className)}>
      <span
        className={cn(
          "font-sans font-semibold tracking-tight tabular-nums",
          sizes[size],
          onSale && "text-destructive"
        )}
      >
        {render(amount)}
      </span>

      {onSale && (
        <>
          <span
            className={cn(
              "font-sans font-normal tabular-nums text-muted-foreground line-through",
              size === "lg" ? "text-base" : "text-sm"
            )}
          >
            {render(compareAt)}
          </span>
          {showDiscount && (
            // Percentages are currency-free: the discount is the same whichever
            // currency it is expressed in, so this is computed on the base
            // amounts and never on the converted ones, where rounding could
            // move it by a point.
            <span className="eyebrow-sm text-destructive">
              −{discountPercent(compareAt, amount)}%
            </span>
          )}
        </>
      )}
    </span>
  );
}
