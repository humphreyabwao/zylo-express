import type { Metadata } from "next";

import { getFeaturedProducts } from "@/lib/catalog";
import { Breadcrumbs } from "@/components/catalog/catalog-page";
import { SectionHeading } from "@/components/layout/section-heading";
import { ProductRail } from "@/components/commerce/product-rail";
import { CartView } from "@/components/cart/cart-view";

export const metadata: Metadata = {
  title: "Shopping Bag",
  description: "Review the pieces in your bag before checkout.",
  robots: { index: false, follow: false },
};

export default async function CartPage() {
  const suggestions = await getFeaturedProducts(8);

  return (
    <>
      <section className="container-shell pt-12 lg:pt-16">
        <Breadcrumbs
          crumbs={[{ label: "Home", href: "/" }, { label: "Shopping Bag" }]}
        />
        <h1 className="mt-8 font-display text-4xl font-light leading-[1.04] lg:text-5xl">
          Shopping Bag
        </h1>
      </section>

      <section className="container-shell py-12 lg:py-16">
        <CartView />
      </section>

      <section className="border-t border-hairline">
        <div className="container-shell py-section">
          <SectionHeading
            eyebrow="Also considered"
            title="Pieces that pair well"
            link={{ href: "/shop", label: "Shop all" }}
          />
          <div className="mt-14">
            <ProductRail products={suggestions} />
          </div>
        </div>
      </section>
    </>
  );
}
