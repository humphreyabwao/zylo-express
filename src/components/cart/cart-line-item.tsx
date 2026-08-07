"use client";

import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";

import type { CartLine } from "@/lib/types";
import { useCartStore } from "@/store/cart-store";
import {cn} from "@/lib/utils";
import { useCurrency } from "@/components/commerce/currency-provider";
import { QuantityStepper } from "@/components/commerce/quantity-stepper";

interface CartLineItemProps {
  line: CartLine;
  onNavigate?: () => void;
  /** `compact` is the drawer treatment; `full` is the cart page. */
  variant?: "compact" | "full";
}

export function CartLineItem({
  line,
  onNavigate,
  variant = "compact",
}: CartLineItemProps) {
  const { format } = useCurrency();
  const setQuantity = useCartStore((s) => s.setQuantity);
  const removeLine = useCartStore((s) => s.removeLine);

  const lineTotal = line.price * line.quantity;
  const compareTotal = line.compareAtPrice
    ? line.compareAtPrice * line.quantity
    : null;
  const lowStock = line.maxQuantity <= 3;

  return (
    <li
      className={cn(
        "flex gap-4",
        variant === "full" ? "gap-6 py-8" : "gap-4 py-6"
      )}
    >
      <Link
        href={`/products/${line.slug}`}
        onClick={onNavigate}
        className={cn(
          "media-zoom relative shrink-0 overflow-hidden bg-secondary",
          variant === "full" ? "w-28 sm:w-36" : "w-24"
        )}
      >
        <div className="relative aspect-3/4">
          <Image
            src={line.image.url}
            alt={line.image.alt}
            fill
            sizes={variant === "full" ? "9rem" : "6rem"}
            className="object-cover"
          />
        </div>
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/products/${line.slug}`}
              onClick={onNavigate}
              className="block truncate font-display text-base font-normal leading-snug hover:opacity-60"
            >
              {line.name}
            </Link>
            <p className="mt-1 eyebrow-sm text-muted-foreground">
              {line.variantTitle}
            </p>
          </div>

          <button
            type="button"
            onClick={() => removeLine(line.id)}
            aria-label={`Remove ${line.name} from bag`}
            className="-mr-1 -mt-1 grid size-8 shrink-0 place-items-center text-muted-foreground transition-colors duration-400 hover:text-foreground"
          >
            <X className="size-3.5" strokeWidth={1.25} />
          </button>
        </div>

        {lowStock && (
          <p className="mt-2 text-xs font-light text-champagne-dark">
            Only {line.maxQuantity} remaining
          </p>
        )}

        {line.isGift && (
          <p className="mt-2 eyebrow-sm text-champagne-dark">Gift wrapped</p>
        )}

        <div className="mt-auto flex items-end justify-between gap-4 pt-4">
          <QuantityStepper
            value={line.quantity}
            onChange={(next) => setQuantity(line.id, next)}
            max={line.maxQuantity}
            size="sm"
            label={`quantity for ${line.name}`}
          />

          <div className="text-right">
            {compareTotal && compareTotal > lineTotal && (
              <p className="text-xs font-normal text-muted-foreground line-through">
                {format(compareTotal)}
              </p>
            )}
            <p
              className={cn(
                "text-[0.9375rem] font-semibold tabular-nums",
                compareTotal && compareTotal > lineTotal && "text-destructive"
              )}
            >
              {format(lineTotal)}
            </p>
          </div>
        </div>
      </div>
    </li>
  );
}
