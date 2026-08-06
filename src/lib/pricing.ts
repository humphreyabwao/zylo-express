import {
  FREE_SHIPPING_THRESHOLD,
  PROMOTIONS,
  SHIPPING_METHODS,
  TAX_RATE,
} from "@/data/catalog";
import type {
  CartLine,
  CartTotals,
  Currency,
  PromotionCode,
  ShippingMethod,
  ShippingSpeed,
} from "@/lib/types";

/**
 * Order of operations, fixed so the client preview and the server's
 * authoritative total never disagree:
 *
 *   subtotal → discount → shipping → tax on (subtotal − discount) → total
 *
 * Everything is integer cents; rounding happens once, at the tax step.
 */

export interface PriceInput {
  lines: CartLine[];
  promotionCode?: string | null;
  shippingMethodId?: ShippingSpeed;
  currency?: Currency;
}

export function findPromotion(code?: string | null): PromotionCode | undefined {
  if (!code) return undefined;
  const normalised = code.trim().toUpperCase();
  return PROMOTIONS.find((p) => p.code === normalised);
}

export function findShippingMethod(id?: ShippingSpeed): ShippingMethod {
  return (
    SHIPPING_METHODS.find((m) => m.id === id) ?? SHIPPING_METHODS[0]
  );
}

export function lineSubtotal(line: CartLine): number {
  return line.price * line.quantity;
}

export function computeSubtotal(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + lineSubtotal(line), 0);
}

export function computeItemCount(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export interface PromotionResult {
  promotion?: PromotionCode;
  discount: number;
  freeShipping: boolean;
  /** Set when a code was supplied but could not be applied. */
  rejection?: "unknown" | "minimum-not-met";
}

export function evaluatePromotion(
  subtotal: number,
  code?: string | null
): PromotionResult {
  if (!code) return { discount: 0, freeShipping: false };

  const promotion = findPromotion(code);
  if (!promotion)
    return { discount: 0, freeShipping: false, rejection: "unknown" };

  if (subtotal < promotion.minimumSubtotal) {
    return {
      promotion,
      discount: 0,
      freeShipping: false,
      rejection: "minimum-not-met",
    };
  }

  switch (promotion.kind) {
    case "percentage":
      return {
        promotion,
        discount: Math.round((subtotal * promotion.value) / 100),
        freeShipping: false,
      };
    case "fixed":
      return {
        promotion,
        discount: Math.min(promotion.value, subtotal),
        freeShipping: false,
      };
    case "free-shipping":
      return { promotion, discount: 0, freeShipping: true };
  }
}

export function computeTotals({
  lines,
  promotionCode,
  shippingMethodId,
  currency = "USD",
}: PriceInput): CartTotals {
  const subtotal = computeSubtotal(lines);
  const { discount, freeShipping } = evaluatePromotion(subtotal, promotionCode);

  const discounted = Math.max(0, subtotal - discount);
  const method = findShippingMethod(shippingMethodId);

  let shipping = method.price;
  if (freeShipping) shipping = 0;
  else if (method.id === "standard" && discounted >= FREE_SHIPPING_THRESHOLD)
    shipping = 0;

  const tax = lines.length ? Math.round(discounted * TAX_RATE) : 0;
  const total = discounted + shipping + tax;

  return {
    subtotal,
    discount,
    shipping,
    tax,
    total,
    itemCount: computeItemCount(lines),
    currency,
  };
}

/** Amount still needed to unlock complimentary standard delivery. */
export function amountToFreeShipping(subtotal: number): number {
  return Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
}

export function freeShippingProgress(subtotal: number): number {
  if (FREE_SHIPPING_THRESHOLD <= 0) return 1;
  return Math.min(1, subtotal / FREE_SHIPPING_THRESHOLD);
}

export { SHIPPING_METHODS, FREE_SHIPPING_THRESHOLD, TAX_RATE };
