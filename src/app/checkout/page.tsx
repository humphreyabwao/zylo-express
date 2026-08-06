import { Suspense } from "react";
import type { Metadata } from "next";

import { availablePaymentMethods } from "@/lib/payments";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckoutFlow } from "@/components/checkout/checkout-flow";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Complete your order.",
  robots: { index: false, follow: false },
};

/**
 * Rendered per request.
 *
 * Which payment methods exist is read from the environment, and a prerender
 * would bake in whatever was set at *build* time. Adding a provider's
 * credentials afterwards would then change nothing until the next deploy — the
 * checkout would keep offering the old list, or none at all. Nothing here is
 * CDN-cacheable anyway: it is a per-customer, noindex page.
 */
export const dynamic = "force-dynamic";

export default function CheckoutPage() {
  // Which methods to offer is a server fact — it depends on which provider
  // credentials exist. Deciding it in the browser would mean shipping a list
  // of configured providers to everyone, and offering a button that fails.
  const methods = availablePaymentMethods();

  return (
    <section className="container-shell py-12 lg:py-16">
      <h1 className="mb-12 font-display text-4xl font-light leading-[1.04] lg:text-5xl">
        Checkout
      </h1>

      {/* The flow reads `?payment=` off the URL to report a redirect outcome,
          so it needs a boundary for useSearchParams. */}
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <CheckoutFlow availableMethods={methods} />
      </Suspense>
    </section>
  );
}
