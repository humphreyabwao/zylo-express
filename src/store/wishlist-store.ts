"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface WishlistState {
  productIds: string[];
  hydrated: boolean;
  setHydrated: () => void;

  toggle: (productId: string) => boolean;
  add: (productId: string) => void;
  remove: (productId: string) => void;
  has: (productId: string) => boolean;
  clear: () => void;
}

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      productIds: [],
      hydrated: false,
      setHydrated: () => set({ hydrated: true }),

      /** Returns the resulting state so callers can word the toast correctly. */
      toggle: (productId) => {
        const exists = get().productIds.includes(productId);
        set((state) => ({
          productIds: exists
            ? state.productIds.filter((id) => id !== productId)
            : [productId, ...state.productIds],
        }));
        return !exists;
      },

      add: (productId) =>
        set((state) =>
          state.productIds.includes(productId)
            ? state
            : { productIds: [productId, ...state.productIds] }
        ),

      remove: (productId) =>
        set((state) => ({
          productIds: state.productIds.filter((id) => id !== productId),
        })),

      has: (productId) => get().productIds.includes(productId),
      clear: () => set({ productIds: [] }),
    }),
    {
      name: "zylo.wishlist",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ productIds: state.productIds }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
        if (!state) useWishlistStore.setState({ hydrated: true });
      },
    }
  )
);
