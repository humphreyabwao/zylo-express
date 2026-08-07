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

/**
 * An SSE handler is a request that deliberately never returns, and every
 * serverless platform caps execution time. Declaring the ceiling makes the cut
 * predictable instead of platform-defined: `EventSource` reconnects on its own
 * (see `use-realtime.ts`), so a capped connection is a seam, not an outage.
 *
 * 60s sits inside the lowest Vercel plan limit. Every reconnect re-establishes
 * a Supabase subscription, so a shorter window costs more, not less — raise
 * this on a plan that permits it. If genuinely persistent connections ever
 * matter more than the rest of the deployment story, this one route is the
 * piece that wants a long-lived container rather than a function.
 */
export const maxDuration = 60;

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
  categories: {
    table: "categories",
    project: (row: Record<string, unknown>) => ({
      categoryId: row.id,
      slug: row.slug,
      isActive: row.is_active,
    }),
  },
  collections: {
    table: "collections",
    project: (row: Record<string, unknown>) => ({
      collectionId: row.id,
      slug: row.slug,
      isActive: row.is_active,
      isFeatured: row.is_featured,
    }),
  },
  media: {
    table: "product_images",
    project: (row: Record<string, unknown>) => ({
      imageId: row.id,
      productId: row.product_id,
      // The path, not a URL. A subscriber that wants to render it resolves it
      // through `storageUrl` like every other read path does.
      storagePath: row.storage_path,
    }),
  },
  journal: {
    table: "articles",
    project: (row: Record<string, unknown>) => ({
      articleId: row.id,
      slug: row.slug,
      isPublished: row.is_published,
    }),
  },
  pages: {
    table: "content_pages",
    project: (row: Record<string, unknown>) => ({
      pageId: row.id,
      slug: row.slug,
      section: row.section,
      isPublished: row.is_published,
    }),
  },
  messages: {
    table: "contact_messages",
    /**
     * Status and nothing else.
     *
     * This is the one channel carrying a table of personal data — a name, an
     * email address and whatever the sender chose to write. Broadcasting any
     * of that would hand it to every browser holding the page open, and the
     * subscription runs on the service key so RLS would not stop it. The id
     * is enough: a client that is allowed to see the message re-fetches it
     * through the admin read path, which is RLS-bound.
     */
    project: (row: Record<string, unknown>) => ({
      messageId: row.id,
      status: row.status,
    }),
  },
  appointments: {
    table: "appointments",
    /**
     * Reference and status only.
     *
     * Same reasoning as `messages`: the diary records who is visiting which
     * boutique and when, which is exactly the pattern-of-life detail not to
     * fan out to every open browser. The reference is already quoted back to
     * the customer, so it discloses nothing further, and it gives an operator
     * something to recognise in a notification. Anything more is re-fetched
     * through the RLS-bound admin read.
     */
    project: (row: Record<string, unknown>) => ({
      appointmentId: row.id,
      reference: row.reference,
      status: row.status,
    }),
  },
  subscribers: {
    table: "newsletter_subscribers",
    /**
     * Deliberately not the email address.
     *
     * A mailing list broadcast over a channel any signed-in browser can open
     * is a mailing list that has left the building. The id is enough to say
     * "the audience changed"; the list itself stays behind the admin-only
     * select policy.
     */
    project: (row: Record<string, unknown>) => ({
      subscriberId: row.id,
      source: row.source,
      subscribed: row.unsubscribed_at === null,
    }),
  },
  settings: {
    table: "site_settings",
    /**
     * The key only, never the value.
     *
     * This is the one channel a *storefront* visitor subscribes to — the
     * currency provider listens on it so an admin changing the store currency
     * reaches tabs that are already open. Everything in `site_settings` is
     * publicly readable today, but broadcasting values would mean the day
     * somebody adds a key that should not be public, it is already on the
     * wire. The key is enough to say "re-read the settings".
     */
    project: (row: Record<string, unknown>) => ({ key: row.key }),
  },
} as const;

/**
 * Which cache tags a channel's traffic invalidates.
 *
 * Previously every change dropped `products` and `facets` regardless of what
 * moved, which was correct only because those were the only two tables being
 * watched. A category rename has to drop `categories` or the storefront nav
 * keeps the old name for an hour — and dropping `products` for a media upload
 * evicts the whole catalogue to fix one image.
 */
const CHANNEL_TAGS: Record<ChannelName, string[]> = {
  inventory: [CacheTags.products, CacheTags.facets],
  products: [CacheTags.products, CacheTags.facets],
  categories: [CacheTags.categories, CacheTags.products, CacheTags.facets],
  collections: [CacheTags.collections, CacheTags.products],
  media: [CacheTags.products],
  journal: [CacheTags.articles],
  pages: [CacheTags.pages],
  // Nothing on the storefront reads these, so there is no cached view to drop.
  // The events exist purely to wake the admin lists.
  messages: [],
  appointments: [],
  subscribers: [],
  // Prices, shipping thresholds and the announcement bar all read these, so
  // the whole catalogue view is downstream of a settings change.
  settings: [CacheTags.settings, CacheTags.products, CacheTags.facets],
};

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

            // A row changed, so the cached view of it is now wrong. Dropping
            // the tags here means the next reader rebuilds from Postgres
            // instead of serving a stale price, name or stock state.
            void invalidateTags(CHANNEL_TAGS[requested as ChannelName]);
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
