"use client";

import { amountToFreeShipping, freeShippingProgress } from "@/lib/pricing";
import { cn, formatPrice } from "@/lib/utils";

export function FreeShippingMeter({
  subtotal,
  className,
}: {
  subtotal: number;
  className?: string;
}) {
  const remaining = amountToFreeShipping(subtotal);
  const progress = freeShippingProgress(subtotal);
  const unlocked = remaining === 0;

  return (
    <div className={cn("space-y-2.5", className)}>
      <p className="eyebrow-sm text-muted-foreground">
        {unlocked ? (
          <span className="text-champagne-dark">
            Complimentary insured delivery unlocked
          </span>
        ) : (
          <>
            {formatPrice(remaining)} more for complimentary delivery
          </>
        )}
      </p>

      <div
        className="h-px w-full bg-hairline"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-label="Progress towards complimentary delivery"
      >
        <div
          className={cn(
            "h-px origin-left transition-transform duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]",
            unlocked ? "bg-champagne-dark" : "bg-foreground"
          )}
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
    </div>
  );
}
