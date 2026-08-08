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

export interface CategoryChange {
  type: "INSERT" | "UPDATE" | "DELETE";
  categoryId: string;
  slug: string;
  isActive: boolean;
}

export interface CollectionChange {
  type: "INSERT" | "UPDATE" | "DELETE";
  collectionId: string;
  slug: string;
  isActive: boolean;
  isFeatured: boolean;
}

export interface MediaChange {
  type: "INSERT" | "UPDATE" | "DELETE";
  imageId: string;
  productId: string;
  storagePath: string;
}

export interface JournalChange {
  type: "INSERT" | "UPDATE" | "DELETE";
  articleId: string;
  slug: string;
  isPublished: boolean;
}

export interface PageChange {
  type: "INSERT" | "UPDATE" | "DELETE";
  pageId: string;
  slug: string;
  section: string;
  isPublished: boolean;
}

/**
 * Deliberately carries no message content — see the `messages` projection in
 * `src/app/api/realtime/route.ts`. An id and a status, nothing a sender wrote.
 */
export interface MessageChange {
  type: "INSERT" | "UPDATE" | "DELETE";
  messageId: string;
  status: "new" | "in-progress" | "resolved";
}

/** Reference and status only — no name, email or boutique. See the route. */
export interface AppointmentChange {
  type: "INSERT" | "UPDATE" | "DELETE";
  appointmentId: string;
  reference: string;
  status: "requested" | "confirmed" | "completed" | "cancelled";
}

/** Reference and total only — never the customer. See the route. */
export interface SaleChange {
  type: "INSERT" | "UPDATE" | "DELETE";
  saleId: string;
  reference: string;
  total: number;
}

/** Reference and status only — never the address or total. See the route. */
export interface OrderChange {
  type: "INSERT" | "UPDATE" | "DELETE";
  orderId: string;
  reference: string;
  status: string;
}

/**
 * The signed-in customer's own orders.
 *
 * Same shape as `OrderChange` and a separate type on purpose: they are not
 * interchangeable, because `orders` carries every order in the shop and staff
 * are the only ones who may open it, while `my-orders` is filtered server-side
 * to rows belonging to the caller. Sharing one type would make swapping the
 * channel name a one-character edit that compiles.
 */
export interface MyOrderChange {
  type: "INSERT" | "UPDATE" | "DELETE";
  orderId: string;
  reference: string;
  status: string;
}

/** The key that changed, never its value. See the route. */
export interface SettingsChange {
  type: "INSERT" | "UPDATE" | "DELETE";
  key: string;
}

/** Never carries the email address — a mailing list is not a broadcast. */
export interface SubscriberChange {
  type: "INSERT" | "UPDATE" | "DELETE";
  subscriberId: string;
  source: string;
  subscribed: boolean;
}

/**
 * Must stay in step with `CHANNELS` in `src/app/api/realtime/route.ts`. The
 * route rejects an unknown channel with a 400, so a name that exists here and
 * not there fails as a connection that never opens rather than as a type
 * error — which is why both lists are short and sit next to their comment.
 */
type ChannelMap = {
  inventory: InventoryChange;
  products: ProductChange;
  orders: OrderChange;
  "my-orders": MyOrderChange;
  sales: SaleChange;
  categories: CategoryChange;
  collections: CollectionChange;
  media: MediaChange;
  journal: JournalChange;
  pages: PageChange;
  messages: MessageChange;
  appointments: AppointmentChange;
  subscribers: SubscriberChange;
  settings: SettingsChange;
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
