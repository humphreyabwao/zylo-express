"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ChevronRight, Truck } from "lucide-react";
import { toast } from "sonner";

import type { Product } from "@/lib/types";
import {
  availableValuesFor,
  defaultVariant,
  findVariant,
  flagLabel,
} from "@/lib/catalog";
import { useCartStore } from "@/store/cart-store";
import { useUiStore } from "@/store/ui-store";
import { cn, formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { Price } from "@/components/commerce/price";
import { RatingStars } from "@/components/commerce/rating-stars";
import { QuantityStepper } from "@/components/commerce/quantity-stepper";
import { WishlistButton } from "@/components/commerce/wishlist-button";
import { ProductGallery } from "@/components/product/product-gallery";

export function ProductDetail({ product }: { product: Product }) {
  const addLine = useCartStore((s) => s.addLine);
  const openCart = useUiStore((s) => s.openCart);

  const initial = React.useMemo(
    () => defaultVariant(product).selectedOptions,
    [product]
  );

  const [selected, setSelected] =
    React.useState<Record<string, string>>(initial);
  const [quantity, setQuantity] = React.useState(1);
  const [adding, setAdding] = React.useState(false);
  const [justAdded, setJustAdded] = React.useState(false);

  const variant = findVariant(product, selected);
  const colorOption = product.options.find((o) => o.type === "color");

  // Selecting a colour brings its plate to the top of the gallery.
  const activeImageIndex = React.useMemo(() => {
    if (!colorOption) return 0;
    const index = colorOption.values.findIndex(
      (v) => v.value === selected[colorOption.name]
    );
    return Math.max(0, Math.min(index, product.images.length - 1));
  }, [colorOption, selected, product.images.length]);

  const choose = (optionName: string, value: string) => {
    setSelected((current) => {
      const next = { ...current, [optionName]: value };
      // If the new combination does not exist, fall back to the first variant
      // that honours the value the shopper just picked.
      if (!findVariant(product, next)) {
        const rescue = product.variants.find(
          (v) => v.selectedOptions[optionName] === value && v.available
        );
        if (rescue) return { ...rescue.selectedOptions };
      }
      return next;
    });
  };

  const handleAdd = async () => {
    if (!variant) return;
    setAdding(true);

    const result = addLine(product, variant, quantity);
    setAdding(false);

    if (!result.ok) {
      toast.error("Unable to add", { description: result.reason });
      return;
    }

    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2400);

    toast("Added to your bag", {
      description: `${product.name} — ${variant.title}`,
      action: { label: "View bag", onClick: openCart },
    });
  };

  const soldOut = !variant?.available;
  const lowStock =
    variant?.available && variant.inventoryQuantity > 0 && variant.inventoryQuantity <= 3;

  return (
    <div className="container-shell grid gap-x-12 gap-y-10 py-8 lg:grid-cols-2 lg:gap-x-20 lg:py-12 xl:gap-x-28">
      <div className="lg:-mx-0">
        <ProductGallery
          images={product.images}
          productName={product.name}
          activeIndex={activeImageIndex}
        />
      </div>

      {/* Sticky purchase panel */}
      <div className="lg:sticky lg:top-28 lg:h-fit lg:py-4">
        {product.flags.length > 0 && (
          <div className="mb-5 flex flex-wrap gap-x-4 gap-y-2">
            {product.flags.map((flag) => (
              <span key={flag} className="eyebrow-sm text-champagne-dark">
                {flagLabel(flag)}
              </span>
            ))}
          </div>
        )}

        <h1 className="font-display text-4xl font-light leading-[1.06] lg:text-5xl">
          {product.name}
        </h1>
        <p className="mt-3 text-base font-light leading-relaxed text-muted-foreground">
          {product.tagline}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Price
            amount={variant?.price ?? product.price}
            compareAt={variant?.compareAtPrice ?? product.compareAtPrice}
            currency={product.currency}
            size="lg"
            showDiscount
          />
          <a href="#reviews" className="transition-opacity hover:opacity-60">
            <RatingStars
              rating={product.rating}
              count={product.reviewCount}
              showValue
            />
          </a>
        </div>

        <Separator className="my-8" />

        {/* Options */}
        <div className="space-y-8">
          {product.options.map((option) => {
            const allowed = availableValuesFor(product, option.name, selected);

            return (
              <fieldset key={option.id}>
                <legend className="mb-4 flex w-full items-baseline justify-between gap-4">
                  <span className="eyebrow-sm text-muted-foreground">
                    {option.name}
                  </span>
                  <span className="text-sm font-light text-foreground">
                    {option.values.find(
                      (v) => v.value === selected[option.name]
                    )?.label ?? "—"}
                  </span>
                </legend>

                {option.type === "color" ? (
                  <div className="flex flex-wrap gap-3">
                    {option.values.map((value) => {
                      const active = selected[option.name] === value.value;
                      const purchasable = allowed.has(value.value);

                      return (
                        <button
                          key={value.value}
                          type="button"
                          onClick={() => choose(option.name, value.value)}
                          aria-pressed={active}
                          aria-label={`${value.label}${purchasable ? "" : " — sold out"}`}
                          title={value.label}
                          className={cn(
                            "relative grid size-11 place-items-center border transition-colors duration-400",
                            active
                              ? "border-foreground"
                              : "border-transparent hover:border-border-strong"
                          )}
                        >
                          <span
                            className="size-7 rounded-full ring-1 ring-inset ring-black/15"
                            style={{ backgroundColor: value.hex }}
                          />
                          {!purchasable && (
                            <span
                              className="absolute inset-x-1.5 h-px rotate-45 bg-destructive/70"
                              aria-hidden
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2.5">
                    {option.values.map((value) => {
                      const active = selected[option.name] === value.value;
                      const purchasable = allowed.has(value.value);

                      return (
                        <button
                          key={value.value}
                          type="button"
                          onClick={() => choose(option.name, value.value)}
                          aria-pressed={active}
                          className={cn(
                            "relative min-w-16 border px-4 py-2.5 text-sm font-light transition-colors duration-400",
                            active
                              ? "border-foreground bg-foreground text-background"
                              : "border-input hover:border-foreground",
                            !purchasable &&
                              "text-muted-foreground/60 hover:border-input"
                          )}
                        >
                          {value.label}
                          {!purchasable && (
                            <span
                              className="absolute inset-x-2 top-1/2 h-px -rotate-12 bg-border-strong"
                              aria-hidden
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </fieldset>
            );
          })}
        </div>

        {/* Purchase */}
        <div className="mt-10 space-y-4">
          {lowStock && (
            <p className="eyebrow-sm text-champagne-dark">
              Only {variant.inventoryQuantity} remaining
            </p>
          )}

          <div className="flex items-stretch gap-3">
            <QuantityStepper
              value={quantity}
              onChange={setQuantity}
              max={Math.max(1, Math.min(10, variant?.inventoryQuantity ?? 1))}
              disabled={soldOut}
              className="h-12 shrink-0"
            />

            <Button
              onClick={handleAdd}
              disabled={soldOut || adding}
              size="lg"
              className="h-12 flex-1"
            >
              {soldOut ? (
                "Sold out"
              ) : justAdded ? (
                <>
                  <Check className="size-4" strokeWidth={1.5} />
                  Added
                </>
              ) : (
                "Add to bag"
              )}
            </Button>

            <div className="flex shrink-0 items-center border border-input">
              <WishlistButton
                productId={product.id}
                productName={product.name}
                variant="bare"
                className="size-[2.875rem]"
              />
            </div>
          </div>

          {soldOut && (
            <p className="text-sm font-light leading-relaxed text-muted-foreground">
              This option has left the workshop.{" "}
              <Link
                href="/help/contact"
                className="underline underline-offset-4"
              >
                Ask a client advisor
              </Link>{" "}
              about the next run.
            </p>
          )}

          <p className="flex items-center gap-2.5 pt-1 text-sm font-light text-muted-foreground">
            <Truck className="size-4 shrink-0" strokeWidth={1.25} />
            Complimentary insured delivery on orders above{" "}
            {formatPrice(50000)}
          </p>
        </div>

        <Separator className="my-10" />

        {/* Details */}
        <Accordion type="single" collapsible defaultValue="description">
          <AccordionItem value="description">
            <AccordionTrigger>Description</AccordionTrigger>
            <AccordionContent>
              <p>{product.description}</p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="details">
            <AccordionTrigger>Details &amp; dimensions</AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-2.5">
                {product.details.map((detail) => (
                  <li key={detail} className="flex gap-3">
                    <span
                      className="mt-2 size-1 shrink-0 rounded-full bg-champagne-dark"
                      aria-hidden
                    />
                    {detail}
                  </li>
                ))}
              </ul>
              <dl className="mt-6 space-y-2 border-t border-hairline pt-5">
                <div className="flex gap-3">
                  <dt className="eyebrow-sm w-28 shrink-0 text-muted-foreground">
                    Composition
                  </dt>
                  <dd>{product.composition}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="eyebrow-sm w-28 shrink-0 text-muted-foreground">
                    Origin
                  </dt>
                  <dd>{product.origin}</dd>
                </div>
                {variant && (
                  <div className="flex gap-3">
                    <dt className="eyebrow-sm w-28 shrink-0 text-muted-foreground">
                      Reference
                    </dt>
                    <dd className="tabular-nums">{variant.sku}</dd>
                  </div>
                )}
              </dl>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="care">
            <AccordionTrigger>Care</AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-2.5">
                {product.care.map((instruction) => (
                  <li key={instruction} className="flex gap-3">
                    <span
                      className="mt-2 size-1 shrink-0 rounded-full bg-champagne-dark"
                      aria-hidden
                    />
                    {instruction}
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="delivery">
            <AccordionTrigger>Delivery &amp; returns</AccordionTrigger>
            <AccordionContent>
              <p>
                Complimentary insured delivery in 3–5 business days, with
                signature on arrival. Express and same-day services are offered
                at checkout where available.
              </p>
              <p className="mt-4">
                Unworn pieces may be returned within thirty days. Collection is
                arranged by us at no charge. Made-to-order and engraved pieces
                are final sale.
              </p>
              <Link
                href="/help/returns"
                className="link-draw mt-5 inline-flex items-center gap-2 eyebrow-sm text-foreground"
              >
                Full policy
                <ChevronRight className="size-3" strokeWidth={1.5} />
              </Link>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  );
}
