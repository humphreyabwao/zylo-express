"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type {
  CartLine,
  CartTotals,
  Product,
  ProductVariant,
  ShippingSpeed,
} from "@/lib/types";
import { computeItemCount, computeSubtotal, computeTotals } from "@/lib/pricing";
import { clamp } from "@/lib/utils";

/**
 * Cart state is deliberately client-only and ephemeral — it is the working
 * basket, not the order. On checkout the lines are re-priced server-side by a
 * Supabase Edge Function, which is the authority on what is actually charged.
 */

export const MAX_LINE_QUANTITY = 10;

interface CartState {
  lines: CartLine[];
  promotionCode: string | null;
  shippingMethodId: ShippingSpeed;
  /** Set by the persist rehydration callback; guards SSR/client mismatch. */
  hydrated: boolean;
  setHydrated: () => void;

  addLine: (
    product: Product,
    variant: ProductVariant,
    quantity?: number
  ) => { ok: boolean; reason?: string };
  removeLine: (lineId: string) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  incrementLine: (lineId: string) => void;
  decrementLine: (lineId: string) => void;
  setGiftMessage: (lineId: string, message: string) => void;
  toggleGift: (lineId: string) => void;
  applyPromotion: (code: string | null) => void;
  setShippingMethod: (id: ShippingSpeed) => void;
  clear: () => void;

  getLine: (lineId: string) => CartLine | undefined;
  getSubtotal: () => number;
  getItemCount: () => number;
  getTotals: () => CartTotals;
}

function lineKey(productId: string, variantId: string) {
  return `${productId}:${variantId}`;
}

function toLine(
  product: Product,
  variant: ProductVariant,
  quantity: number
): CartLine {
  const image =
    product.images.find((i) => i.id === variant.imageId) ?? product.images[0];

  return {
    id: lineKey(product.id, variant.id),
    productId: product.id,
    variantId: variant.id,
    slug: product.slug,
    name: product.name,
    variantTitle: variant.title,
    price: variant.price,
    compareAtPrice: variant.compareAtPrice,
    currency: product.currency,
    quantity,
    image: {
      url: image.url,
      alt: image.alt,
      width: image.width,
      height: image.height,
    },
    maxQuantity: Math.min(
      MAX_LINE_QUANTITY,
      Math.max(1, variant.inventoryQuantity)
    ),
    isGift: false,
  };
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      promotionCode: null,
      shippingMethodId: "standard",
      hydrated: false,
      setHydrated: () => set({ hydrated: true }),

      addLine: (product, variant, quantity = 1) => {
        if (!variant.available || variant.inventoryQuantity < 1) {
          return { ok: false, reason: "This piece is no longer available." };
        }

        const id = lineKey(product.id, variant.id);
        const existing = get().lines.find((l) => l.id === id);
        const ceiling = Math.min(
          MAX_LINE_QUANTITY,
          Math.max(1, variant.inventoryQuantity)
        );
        const requested = (existing?.quantity ?? 0) + quantity;

        if (existing && existing.quantity >= ceiling) {
          return {
            ok: false,
            reason: `Only ${ceiling} available in this option.`,
          };
        }

        const next = clamp(requested, 1, ceiling);

        set((state) => ({
          lines: existing
            ? state.lines.map((l) =>
                l.id === id ? { ...l, quantity: next, maxQuantity: ceiling } : l
              )
            : [...state.lines, toLine(product, variant, next)],
        }));

        return { ok: true };
      },

      removeLine: (lineId) =>
        set((state) => ({ lines: state.lines.filter((l) => l.id !== lineId) })),

      setQuantity: (lineId, quantity) =>
        set((state) => ({
          lines:
            quantity <= 0
              ? state.lines.filter((l) => l.id !== lineId)
              : state.lines.map((l) =>
                  l.id === lineId
                    ? { ...l, quantity: clamp(quantity, 1, l.maxQuantity) }
                    : l
                ),
        })),

      incrementLine: (lineId) => {
        const line = get().getLine(lineId);
        if (line) get().setQuantity(lineId, line.quantity + 1);
      },

      decrementLine: (lineId) => {
        const line = get().getLine(lineId);
        if (line) get().setQuantity(lineId, line.quantity - 1);
      },

      setGiftMessage: (lineId, message) =>
        set((state) => ({
          lines: state.lines.map((l) =>
            l.id === lineId ? { ...l, giftMessage: message, isGift: true } : l
          ),
        })),

      toggleGift: (lineId) =>
        set((state) => ({
          lines: state.lines.map((l) =>
            l.id === lineId
              ? {
                  ...l,
                  isGift: !l.isGift,
                  giftMessage: l.isGift ? undefined : l.giftMessage,
                }
              : l
          ),
        })),

      applyPromotion: (code) =>
        set({ promotionCode: code ? code.trim().toUpperCase() : null }),

      setShippingMethod: (id) => set({ shippingMethodId: id }),

      clear: () => set({ lines: [], promotionCode: null }),

      getLine: (lineId) => get().lines.find((l) => l.id === lineId),
      getSubtotal: () => computeSubtotal(get().lines),
      getItemCount: () => computeItemCount(get().lines),
      getTotals: () => {
        const { lines, promotionCode, shippingMethodId } = get();
        return computeTotals({ lines, promotionCode, shippingMethodId });
      },
    }),
    {
      name: "zylo.cart",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        lines: state.lines,
        promotionCode: state.promotionCode,
        shippingMethodId: state.shippingMethodId,
      }),
      onRehydrateStorage: () => (state) => {
        // Fires with the merged state once localStorage has been read, or with
        // `undefined` if reading failed — either way the cart is now usable.
        state?.setHydrated();
        if (!state) useCartStore.setState({ hydrated: true });
      },
    }
  )
);
