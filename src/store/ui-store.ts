"use client";

import { create } from "zustand";

/**
 * Transient interface state — which overlay is open. Never persisted: a
 * refresh should always land the shopper on a clean page.
 */

type Overlay = "cart" | "search" | "nav" | "filters" | null;

interface UiState {
  overlay: Overlay;
  /** Nav item whose mega-menu is open, keyed by label. */
  openMenu: string | null;

  openCart: () => void;
  openSearch: () => void;
  openNav: () => void;
  openFilters: () => void;
  closeOverlay: () => void;
  setOverlay: (overlay: Overlay) => void;

  setOpenMenu: (label: string | null) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  overlay: null,
  openMenu: null,

  openCart: () => set({ overlay: "cart", openMenu: null }),
  openSearch: () => set({ overlay: "search", openMenu: null }),
  openNav: () => set({ overlay: "nav", openMenu: null }),
  openFilters: () => set({ overlay: "filters" }),
  closeOverlay: () => set({ overlay: null }),
  setOverlay: (overlay) => set({ overlay }),

  setOpenMenu: (label) => set({ openMenu: label }),
}));

export const useIsCartOpen = () => useUiStore((s) => s.overlay === "cart");
export const useIsSearchOpen = () => useUiStore((s) => s.overlay === "search");
export const useIsNavOpen = () => useUiStore((s) => s.overlay === "nav");
export const useIsFiltersOpen = () => useUiStore((s) => s.overlay === "filters");
