import type { Metadata } from "next";

import { getAllProducts } from "@/lib/catalog";
import { WishlistView } from "@/components/account/wishlist-view";

export const metadata: Metadata = {
  title: "Saved Items",
  description: "The pieces you have saved for later.",
  robots: { index: false, follow: false },
};

export default async function WishlistPage() {
  return <WishlistView products={await getAllProducts()} />;
}
