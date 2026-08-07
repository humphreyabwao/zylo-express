"use client";

import { amountToFreeShipping, freeShippingProgress } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/components/commerce/currency-provider";

export function FreeShippingMeter({
  subtotal,
  className,
}: {
  subtotal: number;
  className?: string;
}) {
  const { format, freeShippingThreshold } = useCurrency();
  // The live threshold, not the bundled constant, so editing it in
  // Settings moves the meter as well as the charge.
  const remaining = amountToFreeShipping(subtotal, freeShippingThreshold);
  const progress = freeShippingProgress(subtotal, freeShippingThreshold);
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
            {format(remaining)} more for complimentary delivery
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
