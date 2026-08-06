"use client";

import { useWishlistStore } from "@/store/wishlist-store";

/**
 * The saved-items count for the overview tiles.
 *
 * Reads the same localStorage-backed store the wishlist page renders from.
 * The account layer also exposes `getWishlistProductIds()` against the
 * `wishlist_items` table, but nothing writes to that table yet — using it here
 * would show 0 on the overview while the wishlist page listed real pieces.
 * One source of truth until saved items are migrated server-side.
 */
export function WishlistStat() {
  const count = useWishlistStore((s) => s.productIds.length);
  const hydrated = useWishlistStore((s) => s.hydrated);

  // An em dash rather than 0 before hydration: showing a wrong number and
  // then correcting it reads worse than showing none.
  return <>{hydrated ? count : "—"}</>;
}
