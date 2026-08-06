"use client";

import { useWishlistStore } from "@/store/wishlist-store";
import { pluralize } from "@/lib/utils";

/** Reads from localStorage, so it renders a neutral sentence until hydrated. */
export function WishlistCount() {
  const count = useWishlistStore((s) => s.productIds.length);
  const hydrated = useWishlistStore((s) => s.hydrated);

  if (!hydrated) return <>You have pieces saved for later.</>;

  if (count === 0)
    return <>Nothing saved yet — the heart on any piece adds it here.</>;

  return (
    <>
      You have {count} {pluralize(count, "piece")} saved.
    </>
  );
}
