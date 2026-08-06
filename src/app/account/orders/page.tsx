import type { Metadata } from "next";
import Link from "next/link";

import { DEMO_ORDERS } from "@/data/account";
import { Button } from "@/components/ui/button";
import { OrderCard } from "@/components/account/order-card";

export const metadata: Metadata = {
  title: "Orders",
  description: "Follow and revisit your orders.",
  robots: { index: false, follow: false },
};

export default function OrdersPage() {
  if (DEMO_ORDERS.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-6 border border-hairline px-8 py-24 text-center">
        <h2 className="font-display text-3xl font-light">No orders yet</h2>
        <p className="max-w-md text-sm font-light leading-relaxed text-muted-foreground">
          When you place an order it will appear here, with tracking and the
          option to arrange a return.
        </p>
        <Button asChild>
          <Link href="/collections/all">Browse the collection</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-display text-2xl font-light">Orders</h2>
      <p className="mt-3 text-sm font-light text-muted-foreground">
        Returns can be arranged within thirty days of delivery. Made-to-order
        and engraved pieces are final sale.
      </p>

      <ul className="mt-8 space-y-8">
        {DEMO_ORDERS.map((order) => (
          <li key={order.id}>
            <OrderCard order={order} />
          </li>
        ))}
      </ul>
    </div>
  );
}
