import type { Metadata } from "next";
import Link from "next/link";
import { Package } from "lucide-react";

import { getAccountOrders } from "@/lib/account";
import { Button } from "@/components/ui/button";
import { OrderSummaryCard } from "@/components/account/order-summary-card";
import { OrderLines } from "@/components/account/order-lines";

export const metadata: Metadata = {
  title: "Orders",
  description: "Follow and revisit your orders.",
  robots: { index: false, follow: false },
};

export default async function OrdersPage() {
  const orders = await getAccountOrders(50);

  if (orders.length === 0) {
    return (
      <div className="border border-hairline px-8 py-20 text-center">
        <Package
          className="mx-auto size-7 text-champagne-dark"
          strokeWidth={1}
          aria-hidden="true"
        />
        <h2 className="mt-6 font-display text-2xl font-light">No orders yet</h2>
        <p className="mx-auto mt-3 max-w-sm text-sm font-light leading-relaxed text-muted-foreground">
          Once you order, every parcel appears here with its origin country,
          dispatch window and tracking.
        </p>
        <Button asChild className="mt-8">
          <Link href="/shop">Browse the catalogue</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-display text-2xl font-light">Orders</h2>
      <p className="mt-3 max-w-xl text-sm font-light leading-relaxed text-muted-foreground">
        Pieces from different countries ship separately and may arrive on
        different days. Returns can be arranged within thirty days of delivery;
        made-to-order and engraved pieces are final sale.
      </p>

      <ul className="mt-8 space-y-8">
        {orders.map((order) => (
          <li key={order.id} className="space-y-px">
            <OrderSummaryCard order={order} />
            <OrderLines order={order} />
          </li>
        ))}
      </ul>
    </div>
  );
}
