import type { Metadata } from "next";

import { CheckoutFlow } from "@/components/checkout/checkout-flow";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Complete your order.",
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return (
    <section className="container-shell py-12 lg:py-16">
      <h1 className="mb-12 font-display text-4xl font-light leading-[1.04] lg:text-5xl">
        Checkout
      </h1>
      <CheckoutFlow />
    </section>
  );
}
