/**
 * Variant matrix resolution.
 *
 * Operates purely on a Product handed in by the caller, so it imports no data
 * and is safe in Client Components — the product detail page needs this logic
 * running in the browser as the shopper clicks swatches.
 */

import type { Product, ProductVariant } from "@/lib/types";

/** Finds the variant matching a full set of selected options. */
export function findVariant(
  product: Product,
  selected: Record<string, string>
): ProductVariant | undefined {
  return product.variants.find((variant) =>
    Object.entries(selected).every(
      ([name, value]) => variant.selectedOptions[name] === value
    )
  );
}

/** The variant a product page should open on: first in stock, else first. */
export function defaultVariant(product: Product): ProductVariant {
  return product.variants.find((v) => v.available) ?? product.variants[0];
}

/**
 * Given a partial selection, reports which values of `optionName` still lead
 * to a purchasable variant. Drives the disabled state on swatches and sizes.
 */
export function availableValuesFor(
  product: Product,
  optionName: string,
  selected: Record<string, string>
): Set<string> {
  const others = Object.entries(selected).filter(([k]) => k !== optionName);

  const values = new Set<string>();
  for (const variant of product.variants) {
    if (!variant.available) continue;
    const compatible = others.every(
      ([name, value]) => variant.selectedOptions[name] === value
    );
    if (compatible) values.add(variant.selectedOptions[optionName]);
  }
  return values;
}
