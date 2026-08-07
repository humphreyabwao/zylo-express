"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { useRealtime } from "@/hooks/use-realtime";

/**
 * Keeps a server-rendered list current, without polling.
 *
 * Renders nothing. It subscribes to the SSE proxy and calls `router.refresh()`,
 * which re-runs the page on the server and streams a new RSC payload into the
 * existing tree — scroll position, focus, open menus and form state all
 * survive. The list itself stays a Server Component.
 *
 * There is no connection indicator. A badge reading "Live" is chrome on every
 * screen that says nothing an operator can act on: when it works the table is
 * simply current, and when it does not, `EventSource` reconnects on its own.
 */

/**
 * Changes arrive in bursts — a bulk publish, an order decrementing six variants
 * at once. Refreshing per event would mean six server renders for one logical
 * change, so the window collects them into one.
 */
const COALESCE_MS = 400;

export function RealtimeRefresh({
  channel,
}: {
  channel:
    | "products"
    | "inventory"
    | "orders"
    | "sales"
    | "categories"
    | "collections"
    | "media"
    | "journal"
    | "pages"
    | "messages"
    | "appointments"
    | "subscribers"
    | "settings";
}) {
  const router = useRouter();
  const timer = React.useRef<number | null>(null);

  useRealtime(channel, () => {
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
