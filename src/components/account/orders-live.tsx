"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useRealtime } from "@/hooks/use-realtime";
import { ORDER_STATUS, ORDER_STATUS_NEWS } from "@/lib/order-status";
import type { OrderStatusDb } from "@/lib/supabase/types";

/**
 * Keeps the customer's account current while they are looking at it.
 *
 * Renders nothing. Mounted once in the account shell rather than per page, so
 * one connection covers the overview, the order list and everything else under
 * `/account` — and a customer who is watching for a parcel sees it move without
 * pulling to refresh.
 *
 * ## Why this is safe to put on a storefront page
 *
 * It subscribes to `my-orders`, not `orders`. The two carry the same three
 * fields, but the route filters `my-orders` server-side to rows whose `user_id`
 * matches the session — see `src/app/api/realtime/route.ts`. The admin channel
 * carries every order in the shop and refuses anyone without the module.
 *
 * ## Why a seed is needed
 *
 * The event says what an order's status *is*, never what it was. An operator
 * saving a tracking number updates the row too, so without knowing the previous
 * status this would announce "your order is Confirmed" every time somebody
 * typed a courier reference. The seed is the statuses as the server rendered
 * them; the ref is updated as events arrive, so a second change in the same
 * session is judged against the first rather than against page load.
 */

/**
 * Changes can arrive together — a status change and a tracking number saved a
 * moment apart. One refresh for the burst rather than one each.
 */
const COALESCE_MS = 400;

export function OrdersLive({
  seed,
}: {
  seed: { id: string; reference: string; status: OrderStatusDb }[];
}) {
  const router = useRouter();
  const timer = React.useRef<number | null>(null);

  // Built once from the server-rendered statuses. Not state: nothing renders
  // from it, and writing to it must not schedule another render on top of the
  // refresh already queued.
  const known = React.useRef<Map<string, OrderStatusDb>>(
    new Map(seed.map((order) => [order.id, order.status]))
  );

  useRealtime("my-orders", (change) => {
    const status = change.status as OrderStatusDb;
    const previous = known.current.get(change.orderId);

    if (change.type === "DELETE") {
      known.current.delete(change.orderId);
    } else {
      known.current.set(change.orderId, status);
    }

    // Announced only when the status actually moved, and only for the
    // transitions worth interrupting somebody for. An INSERT is the customer's
    // own checkout, which the confirmation page has already told them about.
    if (change.type === "UPDATE" && previous && previous !== status) {
      const news = ORDER_STATUS_NEWS[status];
      if (news) {
        toast(`${change.reference} ${news}`, {
          description: ORDER_STATUS[status]?.label,
        });
      }
    }

    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => router.refresh(), COALESCE_MS);
  });

  React.useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    []
  );

  return null;
}
