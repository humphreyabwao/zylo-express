"use client";

import * as React from "react";

import { useCartStore } from "@/store/cart-store";

/**
 * Empties the bag once an order is actually confirmed.
 *
 * The checkout deliberately leaves the cart alone when it hands the customer
 * to Paystack or PayPal — nothing has been paid at that point, and someone who
 * backs out must come back to a full bag. Clearing belongs here, on the one
 * page that only renders after money has moved.
 *
 * Renders nothing.
 */
export function ClearCart() {
  const clear = useCartStore((s) => s.clear);
  const hydrated = useCartStore((s) => s.hydrated);

  React.useEffect(() => {
    // Waiting for rehydration matters: clearing before localStorage has been
    // read lets the persisted cart load in afterwards and reappear.
    if (hydrated) clear();
  }, [hydrated, clear]);

  return null;
}
