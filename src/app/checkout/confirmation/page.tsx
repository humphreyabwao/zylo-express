import type { Metadata } from "next";

import { readOrderAccess } from "@/lib/order-access";
import { getOrderById } from "@/lib/orders";
import { getSucceededPayment } from "@/lib/payments";
import { ClearCart } from "@/components/checkout/clear-cart";
import {
  ConfirmationFallback,
  ConfirmationView,
} from "@/components/checkout/confirmation-view";
import { PendingPayment } from "@/components/checkout/pending-payment";

export const metadata: Metadata = {
  title: "Order Confirmed",
  description: "Your order has been received.",
  robots: { index: false, follow: false },
};

/**
 * The confirmation.
 *
 * Rendered from the order row rather than anything the browser carried across
 * the redirect, because every payment method here leaves the site and comes
 * back. Entitlement is the httpOnly cookie a verified payment set, so a
 * guessed `?ref=` shows the generic acknowledgement and nothing else.
 */
export default async function ConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const read = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  // A payment the provider had not decided on when the customer came back.
  const pending = read("pending");
  if (pending) {
    return (
      <section className="container-shell py-20 lg:py-28">
        <PendingPayment reference={pending} />
      </section>
    );
  }

  const orderId = await readOrderAccess();
  const order = orderId ? await getOrderById(orderId) : null;

  // `pending` here means the payment never settled — showing a paid-order
  // summary for it would be a lie, so it falls through to the generic view.
  if (!order || order.status === "pending" || order.status === "cancelled") {
    return (
      <section className="container-shell py-20 lg:py-28">
        <ConfirmationFallback reference={read("ref")} />
      </section>
    );
  }

  const payment = await getSucceededPayment(order.id);

  return (
    <section className="container-shell py-20 lg:py-28">
      <ClearCart />
      <ConfirmationView order={order} payment={payment} />
    </section>
  );
}
