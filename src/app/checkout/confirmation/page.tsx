import { Suspense } from "react";
import type { Metadata } from "next";

import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmationView } from "@/components/checkout/confirmation-view";

export const metadata: Metadata = {
  title: "Order Confirmed",
  description: "Your order has been received.",
  robots: { index: false, follow: false },
};

export default function ConfirmationPage() {
  return (
    <section className="container-shell py-20 lg:py-28">
      {/* useSearchParams needs a boundary so the shell can stream first. */}
      <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-3xl" />}>
        <ConfirmationView />
      </Suspense>
    </section>
  );
}
