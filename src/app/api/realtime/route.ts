import { createAdminClient } from "@/lib/supabase/admin";
import {
  RateLimits,
  clientIdentifier,
  rateLimit,
} from "@/lib/rate-limit";
import { CacheTags, invalidateTags } from "@/lib/cache";

/**
 * Realtime, proxied as Server-Sent Events.
 *
 * Supabase Realtime normally runs as a WebSocket opened by the browser, which
 * requires the publishable key to be present client-side. This app keeps every
 * Supabase credential on the server, so instead the server holds one
 * subscription and fans changes out to browsers over SSE.
 *
 * SSE rather than a WebSocket because the traffic is strictly one-way —
 * server to client — and SSE reconnects automatically, needs no extra
 * protocol handling, and survives ordinary HTTP infrastructure.
 *
 * What is broadcast is deliberately thin: an entity type and an id. A client
 * that cares re-fetches through the normal, RLS-protected read path. Pushing
 * row contents down this channel would bypass RLS, since the subscription is
 * held with the service key.
 */

export const dynamic = "force-dynamic";

/** Only these may be subscribed to. Anything else is rejected. */
const CHANNELS = {
  inventory: {
    table: "product_variants",
    /** Fields safe to broadcast — never the whole row. */
    project: (row: Record<string, unknown>) => ({
      variantId: row.id,
      productId: row.product_id,
      available: row.available,
      // Exact stock is a business signal; "low" is all a shopper needs.
      low: typeof row.inventory_quantity === "number" && row.inventory_quantity <= 3,
    }),
  },
  products: {
    table: "products",
    project: (row: Record<string, unknown>) => ({
      productId: row.id,
      slug: row.slug,
      available: row.available,
      price: row.price,
    }),
  },
} as const;

type ChannelName = keyof typeof CHANNELS;

const HEARTBEAT_MS = 25_000;

export async function GET(request: Request) {
  const identifier = await clientIdentifier();
  const limit = await rateLimit("realtime", identifier, RateLimits.stream);

  if (!limit.success) {
    return new Response("Too many connections", { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const requested = searchParams.get("channel") ?? "inventory";

  if (!(requested in CHANNELS)) {
    return new Response("Unknown channel", { status: 400 });
  }

  const channel = CHANNELS[requested as ChannelName];
  const supabase = createAdminClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Client vanished between the check and the write.
          closed = true;
        }
      };

      const subscription = supabase
        .channel(`sse:${requested}:${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: channel.table },
          (payload) => {
            const row = (payload.new ?? payload.old) as Record<string, unknown>;
            if (!row) return;

            send("change", {
              type: payload.eventType,
              ...channel.project(row),
            });

            // A row changed, so the cached catalogue is now wrong. Dropping
            // the tag here means the next reader rebuilds from Postgres
            // instead of serving a stale price or stock state.
            void invalidateTags([CacheTags.products, CacheTags.facets]);
          }
        )
        .subscribe();

      send("open", { channel: requested });

      // Proxies commonly kill an idle connection after 30–60s. A comment
      // frame keeps it warm without being delivered as an event.
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          closed = true;
        }
      }, HEARTBEAT_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        void supabase.removeChannel(subscription);
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };

      // Without this the Supabase channel outlives the browser tab and the
      // server slowly accumulates dead subscriptions.
      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Connection: "keep-alive",
      // Nginx buffers proxied responses by default, which would hold events
      // back until the buffer fills — defeating the point of streaming.
      "X-Accel-Buffering": "no",
    },
  });
}
