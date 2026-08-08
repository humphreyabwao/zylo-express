import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminIdentity } from "@/lib/admin/guard";
import { getCurrentUser } from "@/lib/supabase/server";
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
 *
 * ## Scopes
 *
 * The subscription runs on the service key, so RLS is not in the path and *this
 * handler* is the access check. Every channel therefore declares who may open
 * it:
 *
 *   public   anyone, signed in or not. Catalogue movement and site settings —
 *            the same facts the storefront renders to a stranger anyway.
 *   admin    a portal account holding the named module. Orders, sales, the
 *            inbox, the diary and the mailing list all describe business
 *            activity, and until this existed any visitor who guessed the query
 *            string could watch every order reference and status change in the
 *            shop go past in real time.
 *   self     a signed-in customer, and every event is filtered to rows that
 *            belong to them. Their own order moving to "shipped" is theirs to
 *            see; the shop's order flow is not.
 *
 * A `self` channel is the only one that reads a column it does not broadcast:
 * the filter needs `user_id`, and `user_id` never leaves the server.
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

type Row = Record<string, unknown>;

/** Who may open a channel. See the scopes note above. */
type Scope =
  | { kind: "public" }
  /** `module` is the portal segment the operator must hold, as in `nav.ts`. */
  | { kind: "admin"; module: string }
  | { kind: "self" };

interface ChannelConfig {
  table: string;
  scope: Scope;
  /** Fields safe to broadcast — never the whole row. */
  project: (row: Row) => Record<string, unknown>;
  /**
   * `self` channels only: whether this row belongs to the viewer.
   *
   * Returning false drops the event silently. It must fail *closed* — a row
   * missing the column it filters on is not delivered — because the alternative
   * is one customer's order landing in another's browser.
   */
  belongsTo?: (row: Row, userId: string) => boolean;
}

/** Only these may be subscribed to. Anything else is rejected. */
const CHANNELS = {
  inventory: {
    table: "product_variants",
    // Stock movement is already visible on the product page.
    scope: { kind: "public" },
    project: (row: Row) => ({
      variantId: row.id,
      productId: row.product_id,
      available: row.available,
      // Exact stock is a business signal; "low" is all a shopper needs.
      low: typeof row.inventory_quantity === "number" && row.inventory_quantity <= 3,
    }),
  },
  products: {
    table: "products",
    scope: { kind: "public" },
    project: (row: Row) => ({
      productId: row.id,
      slug: row.slug,
      available: row.available,
      price: row.price,
    }),
  },
  orders: {
    table: "orders",
    /**
     * Staff only, since migration 23.
     *
     * Reference and status are thin, but a stream of them is the shop's order
     * book: how many orders arrive, when, and how they progress. That is not a
     * fact about a visitor's own session, and it was readable by anyone who
     * opened this URL until the scope existed. Customers watching their own
     * orders use `my-orders` below.
     */
    scope: { kind: "admin", module: "orders" },
    project: (row: Row) => ({
      orderId: row.id,
      reference: row.reference,
      status: row.status,
    }),
  },
  "my-orders": {
    table: "orders",
    /**
     * The customer's own orders, and nothing else.
     *
     * What makes `/account/orders` update the moment an operator marks a parcel
     * shipped. The projection is the same three fields the admin channel sends,
     * because the page re-reads through RLS anyway — what differs is that the
     * filter below means a customer only ever learns about rows that are theirs.
     */
    scope: { kind: "self" },
    belongsTo: (row: Row, userId: string) => row.user_id === userId,
    project: (row: Row) => ({
      orderId: row.id,
      reference: row.reference,
      status: row.status,
    }),
  },
  sales: {
    table: "sales",
    /**
     * Reference and total only — no customer name or email.
     *
     * The till and the sales list both watch this so a second terminal, or the
     * office, sees a sale the moment it is rung up. Staff only: a live feed of
     * takings is exactly the figure a shop does not publish.
     */
    scope: { kind: "admin", module: "sales" },
    project: (row: Row) => ({
      saleId: row.id,
      reference: row.reference,
      total: row.total,
    }),
  },
  categories: {
    table: "categories",
    scope: { kind: "public" },
    project: (row: Row) => ({
      categoryId: row.id,
      slug: row.slug,
      isActive: row.is_active,
    }),
  },
  collections: {
    table: "collections",
    scope: { kind: "public" },
    project: (row: Row) => ({
      collectionId: row.id,
      slug: row.slug,
      isActive: row.is_active,
      isFeatured: row.is_featured,
    }),
  },
  media: {
    table: "product_images",
    scope: { kind: "public" },
    project: (row: Row) => ({
      imageId: row.id,
      productId: row.product_id,
      // The path, not a URL. A subscriber that wants to render it resolves it
      // through `storageUrl` like every other read path does.
      storagePath: row.storage_path,
    }),
  },
  journal: {
    table: "articles",
    scope: { kind: "public" },
    project: (row: Row) => ({
      articleId: row.id,
      slug: row.slug,
      isPublished: row.is_published,
    }),
  },
  pages: {
    table: "content_pages",
    scope: { kind: "public" },
    project: (row: Row) => ({
      pageId: row.id,
      slug: row.slug,
      section: row.section,
      isPublished: row.is_published,
    }),
  },
  messages: {
    table: "contact_messages",
    /**
     * Status and nothing else, to staff holding the inbox.
     *
     * This is the one channel carrying a table of personal data — a name, an
     * email address and whatever the sender chose to write. Broadcasting any
     * of that would hand it to every browser holding the page open, and the
     * subscription runs on the service key so RLS would not stop it. The id
     * is enough: a client that is allowed to see the message re-fetches it
     * through the admin read path, which is RLS-bound.
     */
    scope: { kind: "admin", module: "messages" },
    project: (row: Row) => ({
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
    scope: { kind: "admin", module: "appointments" },
    project: (row: Row) => ({
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
    scope: { kind: "admin", module: "subscribers" },
    project: (row: Row) => ({
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
    scope: { kind: "public" },
    project: (row: Row) => ({ key: row.key }),
  },
} as const satisfies Record<string, ChannelConfig>;

type ChannelName = keyof typeof CHANNELS;

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
  // Stock is decremented on checkout, so a new order changes the catalogue.
  orders: [CacheTags.products, CacheTags.facets],
  // One customer's own orders say nothing about the catalogue, and dropping the
  // product cache from a customer's tab would let any signed-in visitor evict it
  // for everybody by opening and closing a page.
  "my-orders": [],
  // A counter sale decrements stock, so availability everywhere is stale.
  sales: [CacheTags.products, CacheTags.facets],
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

const HEARTBEAT_MS = 25_000;

/**
 * Resolve the viewer for a channel, or the response that refuses them.
 *
 * Returns the user id for a `self` channel — the value the row filter compares
 * against — and null for the others, which need no per-row decision.
 */
async function authorise(
  scope: Scope
): Promise<{ userId: string | null } | Response> {
  if (scope.kind === "public") return { userId: null };

  if (scope.kind === "self") {
    const user = await getCurrentUser();
    if (!user) return new Response("Sign in required", { status: 401 });
    return { userId: user.id };
  }

  const identity = await getAdminIdentity();
  if (!identity) return new Response("Sign in required", { status: 401 });

  // The same module grant the portal page checks. A staff account with only
  // Inventory has no more business watching the order feed than a stranger.
  if (!identity.can(scope.module)) {
    return new Response("Not authorised", { status: 403 });
  }

  return { userId: null };
}

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

  const channel: ChannelConfig = CHANNELS[requested as ChannelName];

  // Before the subscription is opened, not after: a refused caller must not
  // cost a Supabase channel, and an SSE stream that starts and then closes is
  // indistinguishable to `EventSource` from a network blip, so it would retry
  // the refusal forever.
  const viewer = await authorise(channel.scope);
  if (viewer instanceof Response) return viewer;

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
            const row = (payload.new ?? payload.old) as Row;
            if (!row) return;

            // A `self` channel drops everything it cannot positively attribute
            // to this viewer. DELETE only carries the full old row because
            // migration 23 sets `replica identity full` on `orders`; without it
            // this would silently stop delivering deletions rather than start
            // leaking them, which is the right way round for it to fail.
            if (channel.belongsTo) {
              if (!viewer.userId) return;
              if (!channel.belongsTo(row, viewer.userId)) return;
            }

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
