"use client";

import * as React from "react";

/**
 * Subscribes to the server's realtime SSE proxy.
 *
 * The browser talks only to our own origin — no Supabase client, no key. See
 * `src/app/api/realtime/route.ts` for why the subscription lives server-side.
 *
 * `EventSource` reconnects on its own after a network drop, so there is no
 * retry logic here; the only failure worth handling is the page going away.
 */

export interface InventoryChange {
  type: "INSERT" | "UPDATE" | "DELETE";
  variantId: string;
  productId: string;
  available: boolean;
  low: boolean;
}

export interface ProductChange {
  type: "INSERT" | "UPDATE" | "DELETE";
  productId: string;
  slug: string;
  available: boolean;
  price: number;
}

type ChannelMap = {
  inventory: InventoryChange;
  products: ProductChange;
};

export function useRealtime<C extends keyof ChannelMap>(
  channel: C,
  onChange: (change: ChannelMap[C]) => void,
  options: { enabled?: boolean } = {}
): { connected: boolean } {
  const { enabled = true } = options;
  const [connected, setConnected] = React.useState(false);

  // Kept in a ref so a caller passing an inline arrow does not tear down and
  // re-open the connection on every render.
  const handler = React.useRef(onChange);
  React.useEffect(() => {
    handler.current = onChange;
  }, [onChange]);

  React.useEffect(() => {
    if (!enabled) return;

    const source = new EventSource(`/api/realtime?channel=${channel}`);

    const onOpen = () => setConnected(true);
    const onMessage = (event: MessageEvent<string>) => {
      try {
        handler.current(JSON.parse(event.data) as ChannelMap[C]);
      } catch (error) {
        console.error("[realtime] malformed payload", error);
      }
    };
    const onError = () => {
      // EventSource retries by itself; reflect the gap in the UI meanwhile.
      setConnected(false);
    };

    source.addEventListener("open", onOpen);
    source.addEventListener("change", onMessage as EventListener);
    source.addEventListener("error", onError);

    return () => {
      source.removeEventListener("open", onOpen);
      source.removeEventListener("change", onMessage as EventListener);
      source.removeEventListener("error", onError);
      source.close();
    };
  }, [channel, enabled]);

  return { connected };
}
