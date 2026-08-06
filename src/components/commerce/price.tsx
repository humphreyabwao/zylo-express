import type { Currency } from "@/lib/types";
import { cn, discountPercent, formatPrice } from "@/lib/utils";

interface PriceProps {
  amount: number;
  compareAt?: number | null;
  currency?: Currency;
  className?: string;
  /** `lg` is used on the product page, `sm` inside the cart. */
  size?: "sm" | "md" | "lg";
  showDiscount?: boolean;
}

export function Price({
  amount,
  compareAt,
  currency = "USD",
  className,
  size = "md",
  showDiscount = false,
}: PriceProps) {
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
        {formatPrice(amount, { currency })}
      </span>

      {onSale && (
        <>
          <span
            className={cn(
              "font-sans font-normal tabular-nums text-muted-foreground line-through",
              size === "lg" ? "text-base" : "text-sm"
            )}
          >
            {formatPrice(compareAt, { currency })}
          </span>
          {showDiscount && (
            <span className="eyebrow-sm text-destructive">
              −{discountPercent(compareAt, amount)}%
            </span>
          )}
        </>
      )}
    </span>
  );
}
