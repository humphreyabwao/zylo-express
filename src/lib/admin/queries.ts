import "server-only";

import { createOperatorClient } from "@/lib/admin/guard";
import { logQueryFailure } from "@/lib/admin/errors";
import type {
  AppointmentRow,
  AppointmentStatusDb,
  ArticleRow,
  CategoryRow,
  CollectionRow,
  ContactMessageRow,
  ContentPageRow,
  MessageStatusDb,
  NewsletterSubscriberRow,
  SaleItemRow,
  SalePaymentMethodDb,
  SaleRow,
  SaleStatusDb,
  InventorySummaryRpcResult,
  OrderItemRow,
  OrderRow,
  OrderStatusDb,
  ProductImageRow,
  ProductRow,
  ProductVariantRow,
  ProfileRow,
  PromotionRow,
  UserRoleDb,
} from "@/lib/supabase/types";

/**
 * Read paths for the admin portal.
 *
 * Every query runs through `createOperatorClient()` — the RLS-bound client, as
 * the signed-in operator. The service-role client is not used here: reads that
 * bypass RLS would mean the portal shows rows the policies say this operator
 * cannot see, and the first time that matters it will be a privacy incident
 * rather than a bug.
 *
 * Counting: PostgREST returns an exact count in the Content-Range header when
 * asked, which is what lets a table say "page 3 of 47" rather than only
 * discovering the end by walking off it.
 */

export const DEFAULT_PAGE_SIZE = 20;

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

function toPage<T>(
  rows: T[] | null,
  count: number | null,
  page: number,
  pageSize: number
): Page<T> {
  const total = count ?? 0;
  return {
    rows: rows ?? [],
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Clamps a user-supplied page number into range. */
export function normalisePage(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? "1"), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

/* ------------------------------------------------------------------ metrics */

export interface DashboardMetrics {
  revenue: number;
  orderCount: number;
  customerCount: number;
  productCount: number;
  publishedCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  openMessageCount: number;
  activePromotionCount: number;
}

/** A variant at or below this is surfaced as "low stock". */
export const LOW_STOCK_THRESHOLD = 3;

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const supabase = await createOperatorClient();

  // `head: true` asks for the count without transferring any rows, and running
  // them together costs one round trip's worth of latency rather than eight.
  const [
    orders,
    customerCount,
    productCount,
    publishedCount,
    lowStock,
    outOfStock,
    openMessages,
    activePromotions,
  ] = await Promise.all([
    supabase.from("orders").select("total, status"),
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "customer")
      .then((r) => r.count ?? 0),
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .then((r) => r.count ?? 0),
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true)
      .then((r) => r.count ?? 0),
    supabase
      .from("product_variants")
      .select("*", { count: "exact", head: true })
      .gt("inventory_quantity", 0)
      .lte("inventory_quantity", LOW_STOCK_THRESHOLD)
      .then((r) => r.count ?? 0),
    supabase
      .from("product_variants")
      .select("*", { count: "exact", head: true })
      .lte("inventory_quantity", 0)
      .then((r) => r.count ?? 0),
    supabase
      .from("contact_messages")
      .select("*", { count: "exact", head: true })
      .neq("status", "resolved")
      .then((r) => r.count ?? 0),
    supabase
      .from("promotions")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true)
      .then((r) => r.count ?? 0),
  ]);

  // Cancelled and refunded orders are excluded from revenue. Counting them
  // would make the headline figure disagree with any accounting export.
  const billable = (orders.data ?? []).filter(
    (o) => o.status !== "cancelled" && o.status !== "refunded"
  );

  return {
    revenue: billable.reduce((sum, o) => sum + (o.total ?? 0), 0),
    orderCount: (orders.data ?? []).length,
    customerCount,
    productCount,
    publishedCount,
    lowStockCount: lowStock,
    outOfStockCount: outOfStock,
    openMessageCount: openMessages,
    activePromotionCount: activePromotions,
  };
}

/* ------------------------------------------------------------------ products */

export interface ProductListRow extends ProductRow {
  variant_count: number;
  stock: number;
  image_path: string | null;
}

export interface ProductFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "all" | "active" | "draft";
  categorySlug?: string;
  sort?: "recent" | "name" | "price-asc" | "price-desc";
}

export async function listProducts(
  filters: ProductFilters = {}
): Promise<Page<ProductListRow>> {
  const supabase = await createOperatorClient();
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;

  let query = supabase
    .from("products")
    .select(
      "*, product_variants(inventory_quantity), product_images(storage_path, position)",
      { count: "exact" }
    );

  if (filters.search?.trim()) {
    // Escaped: a comma or parenthesis in the term would otherwise be read as
    // PostgREST filter syntax rather than as text.
    const term = filters.search.trim().replace(/[(),*]/g, " ");
    query = query.or(`name.ilike.%${term}%,slug.ilike.%${term}%`);
  }

  if (filters.status === "active") query = query.eq("is_active", true);
  if (filters.status === "draft") query = query.eq("is_active", false);
  if (filters.categorySlug) query = query.eq("category_slug", filters.categorySlug);

  switch (filters.sort) {
    case "name":
      query = query.order("name", { ascending: true });
      break;
    case "price-asc":
      query = query.order("price", { ascending: true });
      break;
    case "price-desc":
      query = query.order("price", { ascending: false });
      break;
    default:
      query = query.order("published_at", { ascending: false });
  }

  const { data, count, error } = await query.range(from, from + pageSize - 1);
  if (error) {
    logQueryFailure("product list", error);
    return toPage<ProductListRow>([], 0, page, pageSize);
  }

  type Joined = ProductRow & {
    product_variants: { inventory_quantity: number }[] | null;
    product_images: { storage_path: string; position: number }[] | null;
  };

  // `as unknown as` because `Database["public"]["Tables"]` declares
  // `Relationships: []` — joins are spelled out in the select string rather
  // than inferred, so postgrest-js types an embedded select as
  // `SelectQueryError`. Same cast as `src/lib/catalog.ts`.
  const rows = (data as unknown as Joined[]).map((row) => {
    const { product_variants, product_images, ...product } = row;
    const images = [...(product_images ?? [])].sort(
      (a, b) => a.position - b.position
    );

    return {
      ...product,
      variant_count: product_variants?.length ?? 0,
      stock: (product_variants ?? []).reduce(
        (sum, v) => sum + (v.inventory_quantity ?? 0),
        0
      ),
      image_path: images[0]?.storage_path ?? null,
    } satisfies ProductListRow;
  });

  return toPage(rows, count, page, pageSize);
}

/* ----------------------------------------------------------------- inventory */

/**
 * A variant, with the product it belongs to.
 *
 * Inventory is variant-level: the product row has no stock of its own, and
 * `reserve_inventory` decrements exactly these rows at checkout. A product-
 * shaped inventory list would have to sum its children and could not offer an
 * edit, because there is nothing on the parent to edit.
 */
export interface InventoryRow extends ProductVariantRow {
  product_name: string;
  product_slug: string;
  product_active: boolean;
}

export type StockStatus = "all" | "in-stock" | "low" | "out";

export interface InventoryFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: StockStatus;
  sort?: "stock-asc" | "stock-desc" | "value-desc" | "sku" | "product";
}

export async function getInventorySummary(): Promise<InventorySummaryRpcResult> {
  const supabase = await createOperatorClient();

  const { data, error } = await supabase.rpc("inventory_summary", {
    p_low_threshold: LOW_STOCK_THRESHOLD,
  });

  if (error || !data) {
    // PGRST202 is "no such function" — the migration that adds
    // `inventory_summary` has not been applied to this database. That is a
    // setup step, not a failure, and it deserves a line that says so rather
    // than a generic error the reader has to go and decode.
    //
    // `logQueryFailure` unpacks the error: a PostgrestError has no own
    // enumerable properties, so logging one directly prints `{}`.
    if (error?.code === "PGRST202") {
      console.warn(
        "[admin] inventory_summary() is missing — apply migration 9 " +
          "(npm run schema -- --from 7). Showing zeroed totals meanwhile."
      );
    } else {
      logQueryFailure("inventory summary", error);
    }

    // Zeroes rather than a thrown error: the table below this summary reads
    // from ordinary queries and is perfectly usable, so failing the whole page
    // over a missing aggregate would take away the working half too.
    return {
      variant_count: 0,
      unit_count: 0,
      out_of_stock: 0,
      low_stock: 0,
      retail_value: 0,
      live_out_of_stock: 0,
    };
  }

  return data;
}

export async function listInventory(
  filters: InventoryFilters = {}
): Promise<Page<InventoryRow>> {
  const supabase = await createOperatorClient();
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;

  // `!inner` rather than a plain embed: an inventory row with no product is
  // meaningless, and the inner join is also what lets the sort below order by
  // a column on the joined table.
  let query = supabase
    .from("product_variants")
    .select("*, products!inner(name, slug, is_active)", { count: "exact" });

  const term = filters.search?.trim();
  if (term) {
    // Escaped: a comma or parenthesis would otherwise be read as PostgREST
    // filter syntax rather than as text.
    const safe = term.replace(/[(),*]/g, " ");

    // Product name lives on the joined table, and PostgREST cannot OR across
    // an embed and the base table in one expression. Resolving the ids first
    // costs a round trip only when someone is actually searching.
    const { data: matches } = await supabase
      .from("products")
      .select("id")
      .ilike("name", `%${safe}%`)
      .limit(200);

    const ids = (matches ?? []).map((row) => row.id);
    const clauses = [`sku.ilike.%${safe}%`, `title.ilike.%${safe}%`];
    if (ids.length) clauses.push(`product_id.in.(${ids.join(",")})`);

    query = query.or(clauses.join(","));
  }

  switch (filters.status) {
    case "out":
      query = query.lte("inventory_quantity", 0);
      break;
    case "low":
      query = query
        .gt("inventory_quantity", 0)
        .lte("inventory_quantity", LOW_STOCK_THRESHOLD);
      break;
    case "in-stock":
      query = query.gt("inventory_quantity", LOW_STOCK_THRESHOLD);
      break;
    default:
      break;
  }

  switch (filters.sort) {
    case "stock-desc":
      query = query.order("inventory_quantity", { ascending: false });
      break;
    case "value-desc":
      // No expression sort over price × quantity through PostgREST, so this
      // approximates by price. Ordering by true stock value would need a view
      // or a generated column; the honest approximation beats a silent lie.
      query = query.order("price", { ascending: false });
      break;
    case "sku":
      query = query.order("sku", { ascending: true });
      break;
    case "product":
      query = query.order("name", {
        ascending: true,
        referencedTable: "products",
      });
      break;
    default:
      // Scarcest first. This screen exists to surface what needs restocking,
      // so the default order is the one that answers that without a filter.
      query = query.order("inventory_quantity", { ascending: true });
  }

  const { data, count, error } = await query.range(from, from + pageSize - 1);

  if (error) {
    logQueryFailure("inventory list", error);
    return toPage<InventoryRow>([], 0, page, pageSize);
  }

  type Joined = ProductVariantRow & {
    products: { name: string; slug: string; is_active: boolean } | null;
  };

  const rows = (data as unknown as Joined[]).map((row) => {
    const { products, ...variant } = row;
    return {
      ...variant,
      product_name: products?.name ?? "—",
      product_slug: products?.slug ?? "",
      product_active: products?.is_active ?? false,
    } satisfies InventoryRow;
  });

  return toPage(rows, count, page, pageSize);
}

/* --------------------------------------------------------------------- staff */

/**
 * A portal account, with whether Supabase is currently refusing it a token.
 *
 * `suspended` does not live in `profiles`. It is an auth-level ban, so the
 * enforcement is Supabase's rather than ours — a flag in a table would only be
 * as good as the code that remembered to check it. That means one extra
 * service-role call to read it back, which is why it is merged here rather
 * than fetched per row.
 */
export interface StaffListRow extends ProfileRow {
  suspended: boolean;
}

export interface StaffFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: "all" | UserRoleDb;
}

/**
 * Staff and customers share the `profiles` table; role is what separates them.
 * The default filter is deliberately "staff and admin only" — the Customers
 * module owns the other direction, and mixing 10,000 shoppers into a staff list
 * makes it useless.
 */
export async function listStaff(
  filters: StaffFilters = {}
): Promise<Page<StaffListRow>> {
  const supabase = await createOperatorClient();
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;

  let query = supabase.from("profiles").select("*", { count: "exact" });

  query =
    !filters.role || filters.role === "all"
      ? query.in("role", ["staff", "admin"])
      : query.eq("role", filters.role);

  if (filters.search?.trim()) {
    const term = filters.search.trim().replace(/[(),*]/g, " ");
    query = query.or(
      `email.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`
    );
  }

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) {
    logQueryFailure("staff list", error);
    return toPage<StaffListRow>([], 0, page, pageSize);
  }

  const rows = data as ProfileRow[];
  const suspended = await getSuspendedIds(rows.map((row) => row.id));

  return toPage(
    rows.map((row) => ({ ...row, suspended: suspended.has(row.id) })),
    count,
    page,
    pageSize
  );
}

/**
 * Which of these accounts Supabase is currently refusing.
 *
 * `banned_until` lives on `auth.users`, which PostgREST does not expose and RLS
 * does not govern — reading it needs the service-role client and the Admin API.
 * Failure is swallowed: a staff list that renders without suspension badges is
 * far better than one that does not render.
 */
async function getSuspendedIds(ids: string[]): Promise<Set<string>> {
  const suspended = new Set<string>();
  if (ids.length === 0) return suspended;

  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    // One page covers any plausible staff list. Customers are filtered out of
    // this view before it is called, so the ceiling is generous.
    const { data, error } = await createAdminClient().auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });

    if (error) {
      logQueryFailure("suspension lookup", error);
      return suspended;
    }

    const wanted = new Set(ids);
    const now = Date.now();

    for (const user of data.users) {
      if (!wanted.has(user.id)) continue;
      const until = (user as { banned_until?: string | null }).banned_until;
      if (until && Date.parse(until) > now) suspended.add(user.id);
    }
  } catch (error) {
    logQueryFailure("suspension lookup threw", error);
  }

  return suspended;
}

/* ----------------------------------------------------------------- customers */

export interface CustomerRow extends ProfileRow {
  order_count: number;
  /** Excludes cancelled and refunded, matching the dashboard's revenue. */
  lifetime_value: number;
  last_order_at: string | null;
}

export interface CustomerFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: "all" | UserRoleDb;
  sort?: "recent" | "spend" | "orders" | "name";
}

/**
 * Customer accounts, with what each has actually bought.
 *
 * Two round trips rather than one: profiles, then the order aggregates for
 * exactly the ids on this page. PostgREST cannot GROUP BY through an embed, so
 * the alternative is either a view or pulling every order for every customer
 * and summing in Node — the second of which stops working at the first
 * thousand orders.
 *
 * **This returns nothing unless the caller is a real admin.** The RLS policy on
 * `profiles` is `auth.uid() = id or public.is_admin()`, so a request with no
 * session — which is what `ADMIN_PREVIEW` produces, since the preview identity
 * is fabricated in application code and never reaches Postgres — matches zero
 * rows. That is the policy working, not a bug, and it is why this list looks
 * empty in preview mode.
 */
export async function listCustomers(
  filters: CustomerFilters = {}
): Promise<Page<CustomerRow>> {
  const supabase = await createOperatorClient();
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;

  let query = supabase.from("profiles").select("*", { count: "exact" });

  // Defaults to customers only. Staff have their own module, and mixing them
  // in makes "how many customers do we have" unanswerable at a glance.
  if (!filters.role || filters.role === "all") {
    query = query.eq("role", "customer");
  } else {
    query = query.eq("role", filters.role);
  }

  if (filters.search?.trim()) {
    const term = filters.search.trim().replace(/[(),*]/g, " ");
    query = query.or(
      `email.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`
    );
  }

  // Spend and order count live on another table, so they cannot be sorted on
  // here. Those two options sort the page in memory below, which is honest
  // for a page of twenty and clearly signposted at the call site.
  query =
    filters.sort === "name"
      ? query.order("first_name", { ascending: true, nullsFirst: false })
      : query.order("created_at", { ascending: false });

  const { data, count, error } = await query.range(from, from + pageSize - 1);

  if (error) {
    logQueryFailure("customer list", error);
    return toPage<CustomerRow>([], 0, page, pageSize);
  }

  const profiles = data ?? [];
  if (profiles.length === 0) return toPage<CustomerRow>([], count, page, pageSize);

  const { data: orders } = await supabase
    .from("orders")
    .select("user_id, total, status, placed_at")
    .in(
      "user_id",
      profiles.map((p) => p.id)
    );

  const stats = new Map<string, { n: number; total: number; last: string | null }>();
  for (const order of orders ?? []) {
    if (!order.user_id) continue;
    const entry = stats.get(order.user_id) ?? { n: 0, total: 0, last: null };

    entry.n += 1;
    // Cancelled and refunded are excluded so lifetime value agrees with the
    // dashboard's revenue figure rather than quietly using a different rule.
    if (order.status !== "cancelled" && order.status !== "refunded") {
      entry.total += order.total ?? 0;
    }
    if (!entry.last || order.placed_at > entry.last) entry.last = order.placed_at;

    stats.set(order.user_id, entry);
  }

  const rows: CustomerRow[] = profiles.map((profile) => {
    const entry = stats.get(profile.id);
    return {
      ...profile,
      order_count: entry?.n ?? 0,
      lifetime_value: entry?.total ?? 0,
      last_order_at: entry?.last ?? null,
    };
  });

  if (filters.sort === "spend") {
    rows.sort((a, b) => b.lifetime_value - a.lifetime_value);
  } else if (filters.sort === "orders") {
    rows.sort((a, b) => b.order_count - a.order_count);
  }

  return toPage(rows, count, page, pageSize);
}

/* -------------------------------------------------------------------- orders */

export interface OrderFilters {
  page?: number;
  pageSize?: number;
  status?: OrderStatusDb | "all";
  /** Reference or email. The toolbar has always offered this box. */
  search?: string;
}

export interface OrderListRow extends OrderRow {
  item_count: number;
  /**
   * Whether money has actually settled against this order.
   *
   * Carried on the row because it decides whether the Delete action is offered
   * at all: `delete_order` refuses a settled order, and a menu item that always
   * fails is worse than one that is visibly unavailable. Derived from
   * `payments`, so it is true even for an order whose status was later moved by
   * hand.
   */
  paid: boolean;
}

export async function listOrders(
  filters: OrderFilters = {}
): Promise<Page<OrderListRow>> {
  const supabase = await createOperatorClient();
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;

  // `order_items(id)` rather than the whole line: the count is all the list
  // needs, and the drawer fetches the lines themselves only when opened.
  let query = supabase
    .from("orders")
    .select("*, order_items(id)", { count: "exact" });

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  const search = filters.search?.trim();
  if (search) {
    // Commas and parentheses are the `or` filter's own syntax; a search for
    // "a,b" would otherwise be read as two conditions and 400 the request.
    const safe = search.replace(/[(),]/g, " ").trim();
    if (safe) query = query.or(`reference.ilike.%${safe}%,email.ilike.%${safe}%`);
  }

  const { data, count, error } = await query
    .order("placed_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) {
    logQueryFailure("order list", error);
    return toPage<OrderListRow>([], 0, page, pageSize);
  }

  const orders = (data ?? []) as unknown as (OrderRow & {
    order_items: { id: string }[] | null;
  })[];

  // One follow-up query for the whole page rather than a correlated subquery
  // per row. PostgREST cannot express "exists a settled payment" as a column,
  // and twenty round trips to answer a yes/no is not a trade worth making.
  const paidIds = new Set<string>();
  if (orders.length > 0) {
    const { data: payments } = await supabase
      .from("payments")
      .select("order_id")
      .in("order_id", orders.map((order) => order.id))
      .in("status", ["succeeded", "refunded"]);

    for (const payment of payments ?? []) {
      if (payment.order_id) paidIds.add(payment.order_id);
    }
  }

  const rows: OrderListRow[] = orders.map(({ order_items, ...order }) => ({
    ...order,
    item_count: order_items?.length ?? 0,
    paid: paidIds.has(order.id),
  }));

  return toPage(rows, count, page, pageSize);
}

/* ------------------------------------------------------ one order, in full */

export interface OrderDetail extends OrderRow {
  items: OrderItemRow[];
  payments: OrderPaymentRow[];
}

/** The slice of a payment the drawer shows. Never the authorization URL. */
export interface OrderPaymentRow {
  id: string;
  provider: string;
  method: string;
  status: string;
  reference: string;
  provider_reference: string | null;
  amount: number;
  charge_amount: number;
  charge_currency: string;
  paid_at: string | null;
  failure_reason: string | null;
  created_at: string;
}

/**
 * A single order with its lines and its payment attempts.
 *
 * Read through the operator client, so the RLS policy is what decides whether
 * this operator sees it — the module guard in the calling action decides whether
 * they may ask at all. Both, not either.
 */
export async function getOrderDetail(id: string): Promise<OrderDetail | null> {
  const supabase = await createOperatorClient();

  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logQueryFailure("order detail", error);
    return null;
  }
  if (!data) return null;

  const { order_items, ...order } = data as unknown as OrderRow & {
    order_items: OrderItemRow[] | null;
  };

  const { data: payments } = await supabase
    .from("payments")
    .select(
      "id, provider, method, status, reference, provider_reference, amount, charge_amount, charge_currency, paid_at, failure_reason, created_at"
    )
    .eq("order_id", id)
    .order("created_at", { ascending: false });

  return {
    ...order,
    // Cheapest line last reads as an afterthought; the order they were bought
    // in is the order the customer will read them back in.
    items: order_items ?? [],
    payments: (payments ?? []) as unknown as OrderPaymentRow[],
  };
}

/**
 * Whether a code actually redeems today.
 *
 * `is_active` is only intent; a code can be flagged active and still be
 * unusable because its window has not opened, has closed, or its usage limit is
 * spent. Computed here rather than in the page because it depends on the
 * current time, and reading the clock during render is exactly the kind of
 * impurity that makes a component's output depend on when it happened to
 * re-render.
 */
export type PromotionState =
  | "live"
  | "paused"
  | "scheduled"
  | "ended"
  | "exhausted";

export interface PromotionListRow extends PromotionRow {
  state: PromotionState;
}

function promotionState(promotion: PromotionRow, now: number): PromotionState {
  if (promotion.usage_limit !== null && promotion.usage_count >= promotion.usage_limit) {
    return "exhausted";
  }
  if (promotion.ends_at && Date.parse(promotion.ends_at) < now) return "ended";
  if (promotion.starts_at && Date.parse(promotion.starts_at) > now) {
    return "scheduled";
  }
  return promotion.is_active ? "live" : "paused";
}

export async function listPromotions(
  filters: { page?: number; pageSize?: number } = {}
): Promise<Page<PromotionListRow>> {
  const supabase = await createOperatorClient();
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;

  const { data, count, error } = await supabase
    .from("promotions")
    .select("*", { count: "exact" })
    .order("is_active", { ascending: false })
    .order("code", { ascending: true })
    .range(from, from + pageSize - 1);

  if (error) {
    logQueryFailure("promotion list", error);
    return toPage<PromotionListRow>([], 0, page, pageSize);
  }

  const now = Date.now();
  const rows = (data ?? []).map((promotion) => ({
    ...promotion,
    state: promotionState(promotion, now),
  }));

  return toPage(rows, count, page, pageSize);
}

/* ------------------------------------------------------------- notifications */

export interface AdminNotification {
  id: string;
  kind: "stock" | "order" | "message";
  title: string;
  detail: string;
  href: string;
  at: string | null;
}

/**
 * The bell menu.
 *
 * Derived from current state rather than stored as an event log: "eleven
 * variants are out of stock" is a fact about now, and a notification table
 * would have to be reconciled every time stock moved. Anything that genuinely
 * needs an audit trail belongs in its own module, not here.
 */
export async function getNotifications(): Promise<AdminNotification[]> {
  const supabase = await createOperatorClient();

  const [outOfStock, pendingOrders, newMessages] = await Promise.all([
    supabase
      .from("product_variants")
      .select("id, sku, title, product_id")
      .lte("inventory_quantity", 0)
      .limit(5),
    supabase
      .from("orders")
      .select("id, reference, total, placed_at")
      .eq("status", "pending")
      .order("placed_at", { ascending: false })
      .limit(5),
    supabase
      .from("contact_messages")
      .select("id, name, subject")
      .eq("status", "new")
      .limit(5),
  ]);

  const notifications: AdminNotification[] = [];

  for (const order of pendingOrders.data ?? []) {
    notifications.push({
      id: `order-${order.id}`,
      kind: "order",
      title: `Order ${order.reference} awaiting confirmation`,
      detail: "Pending since it was placed",
      href: `/admin/orders/${order.id}`,
      at: order.placed_at,
    });
  }

  for (const message of newMessages.data ?? []) {
    notifications.push({
      id: `message-${message.id}`,
      kind: "message",
      title: message.subject || "New enquiry",
      detail: `From ${message.name}`,
      href: "/admin/messages",
      at: null,
    });
  }

  for (const variant of outOfStock.data ?? []) {
    notifications.push({
      id: `stock-${variant.id}`,
      kind: "stock",
      title: `${variant.sku} is out of stock`,
      detail: variant.title,
      href: `/admin/inventory`,
      at: null,
    });
  }

  return notifications;
}

/* ---------------------------------------------------------------- categories */

/**
 * A category with the size of the catalogue behind it.
 *
 * `product_count` is what makes the list actionable rather than decorative:
 * it is the number Delete has to warn about, and the one that tells an
 * operator which categories are real and which were created and forgotten.
 */
export interface CategoryListRow extends CategoryRow {
  product_count: number;
}

export interface CategoryFilters {
  search?: string;
  status?: "all" | "active" | "draft";
  group?: string;
  sort?: "position" | "name" | "products";
}

/**
 * Every category, unpaginated.
 *
 * Deliberately not paged. Categories are the navigation of the shop — a few
 * dozen at the outside — and `position` is only meaningful against the whole
 * ordered set. Paging a sortable list means an operator can move something to
 * "first" and watch it vanish onto another page.
 */
export async function listCategories(
  filters: CategoryFilters = {}
): Promise<CategoryListRow[]> {
  const supabase = await createOperatorClient();

  let query = supabase.from("categories").select("*, products(count)");

  if (filters.search?.trim()) {
    const term = filters.search.trim().replace(/[(),*]/g, " ");
    query = query.or(`name.ilike.%${term}%,slug.ilike.%${term}%`);
  }

  if (filters.status === "active") query = query.eq("is_active", true);
  if (filters.status === "draft") query = query.eq("is_active", false);
  if (filters.group) query = query.eq("group", filters.group);

  const { data, error } = await query;
  if (error) {
    logQueryFailure("category list", error);
    return [];
  }

  // Same `as unknown as` as `listProducts`: the generated types declare
  // `Relationships: []`, so postgrest-js cannot infer an embedded select.
  type Joined = CategoryRow & { products: { count: number }[] | null };

  const rows = (data as unknown as Joined[]).map((row) => {
    const { products, ...category } = row;
    return {
      ...category,
      product_count: products?.[0]?.count ?? 0,
    } satisfies CategoryListRow;
  });

  // Sorted here rather than in Postgres because `products` sorts on an
  // aggregate over an embedded resource, which PostgREST cannot order by. The
  // set is small enough that this is free.
  return rows.sort((a, b) => {
    switch (filters.sort) {
      case "name":
        return a.name.localeCompare(b.name);
      case "products":
        return b.product_count - a.product_count;
      default:
        return a.position - b.position || a.name.localeCompare(b.name);
    }
  });
}

/** The distinct nav groupings in use, for the filter control. */
export async function listCategoryGroups(): Promise<string[]> {
  const supabase = await createOperatorClient();
  const { data, error } = await supabase.from("categories").select("group");

  if (error) {
    logQueryFailure("category groups", error);
    return [];
  }

  const groups = new Set(
    (data as { group: string }[])
      .map((row) => row.group?.trim())
      .filter((group): group is string => Boolean(group))
  );

  return [...groups].sort((a, b) => a.localeCompare(b));
}

/* --------------------------------------------------------------- collections */

export interface CollectionListRow extends CollectionRow {
  product_count: number;
}

export interface CollectionFilters {
  search?: string;
  status?: "all" | "active" | "draft";
  featured?: "all" | "featured" | "standard";
  sort?: "position" | "name" | "products";
}

/** Every collection. Unpaginated, for the same reason as `listCategories`. */
export async function listCollections(
  filters: CollectionFilters = {}
): Promise<CollectionListRow[]> {
  const supabase = await createOperatorClient();

  let query = supabase
    .from("collections")
    .select("*, product_collections(count)");

  if (filters.search?.trim()) {
    const term = filters.search.trim().replace(/[(),*]/g, " ");
    query = query.or(`name.ilike.%${term}%,slug.ilike.%${term}%`);
  }

  if (filters.status === "active") query = query.eq("is_active", true);
  if (filters.status === "draft") query = query.eq("is_active", false);
  if (filters.featured === "featured") query = query.eq("is_featured", true);
  if (filters.featured === "standard") query = query.eq("is_featured", false);

  const { data, error } = await query;
  if (error) {
    logQueryFailure("collection list", error);
    return [];
  }

  type Joined = CollectionRow & {
    product_collections: { count: number }[] | null;
  };

  const rows = (data as unknown as Joined[]).map((row) => {
    const { product_collections, ...collection } = row;
    return {
      ...collection,
      product_count: product_collections?.[0]?.count ?? 0,
    } satisfies CollectionListRow;
  });

  return rows.sort((a, b) => {
    switch (filters.sort) {
      case "name":
        return a.name.localeCompare(b.name);
      case "products":
        return b.product_count - a.product_count;
      default:
        return a.position - b.position || a.name.localeCompare(b.name);
    }
  });
}

/** Products, in the order they sit inside one collection. */
export interface CollectionMemberRow {
  product_id: string;
  position: number;
  name: string;
  slug: string;
  is_active: boolean;
}

export async function listCollectionMembers(
  collectionId: string
): Promise<CollectionMemberRow[]> {
  const supabase = await createOperatorClient();

  const { data, error } = await supabase
    .from("product_collections")
    .select("product_id, position, products(name, slug, is_active)")
    .eq("collection_id", collectionId)
    .order("position");

  if (error) {
    logQueryFailure("collection members", error);
    return [];
  }

  type Joined = {
    product_id: string;
    position: number;
    products: { name: string; slug: string; is_active: boolean } | null;
  };

  return (data as unknown as Joined[])
    // A product deleted out from under the join leaves a row with no parent.
    // Skipped rather than rendered as a blank line.
    .filter((row) => row.products !== null)
    .map((row) => ({
      product_id: row.product_id,
      position: row.position,
      name: row.products!.name,
      slug: row.products!.slug,
      is_active: row.products!.is_active,
    }));
}

/* -------------------------------------------------------------------- media */

/**
 * One object in the media bucket, with what the catalogue knows about it.
 *
 * `usage` is the join that makes this a library rather than a file listing: an
 * operator deleting a file needs to know whether a product page is about to
 * lose its photograph. `null` means nothing references it — an orphan, which
 * is safe to remove and is usually the residue of a failed upload.
 */
export interface MediaAsset {
  path: string;
  name: string;
  size: number;
  contentType: string | null;
  updatedAt: string | null;
  /** The `product_images` row pointing at this object, if there is one. */
  usage: {
    imageId: string;
    alt: string;
    productId: string;
    productName: string;
    productSlug: string;
    position: number;
  } | null;
}

export interface MediaFilters {
  search?: string;
  usage?: "all" | "attached" | "orphan";
  sort?: "recent" | "name" | "size";
}

/** Objects live under prefixes; these are the ones this app writes. */
const MEDIA_PREFIXES = ["products", "collections", "campaign", "editorial"];

/** Supabase Storage caps `list` at 100 per call unless asked otherwise. */
const STORAGE_PAGE = 100;

/**
 * The media library.
 *
 * Storage is the source of truth for *what exists*, and `product_images` for
 * *what is used* — so this reads both and joins them in memory. There is no
 * single query that could do it: the objects are not rows.
 */
export async function listMedia(filters: MediaFilters = {}): Promise<MediaAsset[]> {
  const supabase = await createOperatorClient();

  // One listing per prefix. Storage has no recursive list, and walking
  // arbitrary depth would mean a request per directory discovered — these four
  // are the only prefixes anything writes to.
  const listings = await Promise.all(
    MEDIA_PREFIXES.map(async (prefix) => {
      const { data, error } = await supabase.storage.from("media").list(prefix, {
        limit: STORAGE_PAGE,
        sortBy: { column: "updated_at", order: "desc" },
      });

      if (error) {
        // A prefix that has never been written to returns empty, not an error;
        // a real failure here should not blank the whole library.
        logQueryFailure(`media list (${prefix})`, error);
        return [];
      }

      return (data ?? [])
        // Storage returns a zero-byte placeholder row for nested folders.
        .filter((object) => object.id !== null)
        .map((object) => ({
          path: `${prefix}/${object.name}`,
          name: object.name,
          size: (object.metadata?.size as number | undefined) ?? 0,
          contentType: (object.metadata?.mimetype as string | undefined) ?? null,
          updatedAt: object.updated_at ?? object.created_at ?? null,
        }));
    })
  );

  const objects = listings.flat();
  if (objects.length === 0) return [];

  const { data: imageRows, error: imageError } = await supabase
    .from("product_images")
    .select("id, product_id, storage_path, alt, position, products(name, slug)")
    .in(
      "storage_path",
      objects.map((object) => object.path)
    );

  if (imageError) {
    logQueryFailure("media usage lookup", imageError);
  }

  type JoinedImage = Pick<
    ProductImageRow,
    "id" | "product_id" | "storage_path" | "alt" | "position"
  > & { products: { name: string; slug: string } | null };

  const usageByPath = new Map<string, MediaAsset["usage"]>();
  for (const row of (imageRows ?? []) as unknown as JoinedImage[]) {
    usageByPath.set(row.storage_path, {
      imageId: row.id,
      alt: row.alt,
      productId: row.product_id,
      productName: row.products?.name ?? "Unknown product",
      productSlug: row.products?.slug ?? "",
      position: row.position,
    });
  }

  let assets: MediaAsset[] = objects.map((object) => ({
    ...object,
    usage: usageByPath.get(object.path) ?? null,
  }));

  if (filters.search?.trim()) {
    const term = filters.search.trim().toLowerCase();
    assets = assets.filter(
      (asset) =>
        asset.path.toLowerCase().includes(term) ||
        (asset.usage?.productName.toLowerCase().includes(term) ?? false)
    );
  }

  if (filters.usage === "attached") assets = assets.filter((a) => a.usage);
  if (filters.usage === "orphan") assets = assets.filter((a) => !a.usage);

  return assets.sort((a, b) => {
    switch (filters.sort) {
      case "name":
        return a.path.localeCompare(b.path);
      case "size":
        return b.size - a.size;
      default:
        return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
    }
  });
}

/* ------------------------------------------------------------------ journal */

export interface ArticleFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "all" | "published" | "draft" | "scheduled";
  sort?: "recent" | "oldest" | "title";
}

export type ArticleStatus = "published" | "draft" | "scheduled";

/**
 * An article with its status already decided.
 *
 * Resolved here rather than in the page, because working it out needs the
 * current time and reading the clock during render is exactly the impurity
 * React's linter objects to. The query already has a `now` for its own
 * filtering, so this costs nothing and gives the list one fewer thing to
 * compute per row.
 */
export interface ArticleListRow extends ArticleRow {
  status: ArticleStatus;
}

/**
 * Editorial articles.
 *
 * Paged, unlike categories and collections: a journal accumulates
 * indefinitely, and its order is chronological rather than curated — so there
 * is no whole-set operation that paging would break.
 *
 * "Scheduled" is not a column. An article is scheduled when it is published
 * with a `published_at` in the future: the storefront's read policy is
 * `using (is_published)` and `getJournal()` orders by `published_at desc`, so
 * a future date is live in the database and simply sits at the top of a list
 * nobody is looking at yet. Surfacing it as its own status is what stops that
 * being a surprise.
 */
export async function listArticles(
  filters: ArticleFilters = {}
): Promise<Page<ArticleListRow>> {
  const supabase = await createOperatorClient();
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const now = new Date().toISOString();

  let query = supabase.from("articles").select("*", { count: "exact" });

  if (filters.search?.trim()) {
    const term = filters.search.trim().replace(/[(),*]/g, " ");
    query = query.or(`title.ilike.%${term}%,slug.ilike.%${term}%`);
  }

  switch (filters.status) {
    case "published":
      query = query.eq("is_published", true).lte("published_at", now);
      break;
    case "draft":
      query = query.eq("is_published", false);
      break;
    case "scheduled":
      query = query.eq("is_published", true).gt("published_at", now);
      break;
  }

  switch (filters.sort) {
    case "oldest":
      query = query.order("published_at", { ascending: true });
      break;
    case "title":
      query = query.order("title", { ascending: true });
      break;
    default:
      query = query.order("published_at", { ascending: false });
  }

  const { data, count, error } = await query.range(from, from + pageSize - 1);
  if (error) {
    logQueryFailure("article list", error);
    return toPage<ArticleListRow>([], 0, page, pageSize);
  }

  const rows = (data as ArticleRow[]).map((article) => ({
    ...article,
    status: !article.is_published
      ? ("draft" as const)
      : article.published_at > now
        ? ("scheduled" as const)
        : ("published" as const),
  }));

  return toPage(rows, count, page, pageSize);
}

/* -------------------------------------------------------------------- pages */

export interface ContentPageFilters {
  search?: string;
  section?: string;
  status?: "all" | "published" | "draft";
}

/**
 * CMS pages, grouped by the section that namespaces them.
 *
 * Unpaginated and returned in section order: these back a fixed set of
 * storefront routes (/help/…, /legal/…), so the list is a site map rather than
 * a feed, and there will never be enough of them to page.
 */
export async function listContentPages(
  filters: ContentPageFilters = {}
): Promise<ContentPageRow[]> {
  const supabase = await createOperatorClient();

  let query = supabase.from("content_pages").select("*");

  if (filters.search?.trim()) {
    const term = filters.search.trim().replace(/[(),*]/g, " ");
    query = query.or(`title.ilike.%${term}%,slug.ilike.%${term}%`);
  }

  if (filters.section) query = query.eq("section", filters.section);
  if (filters.status === "published") query = query.eq("is_published", true);
  if (filters.status === "draft") query = query.eq("is_published", false);

  const { data, error } = await query
    .order("section")
    .order("position")
    .order("title");

  if (error) {
    logQueryFailure("content page list", error);
    return [];
  }

  return data as ContentPageRow[];
}

/** The distinct sections in use, for the filter control. */
export async function listContentSections(): Promise<string[]> {
  const supabase = await createOperatorClient();
  const { data, error } = await supabase.from("content_pages").select("section");

  if (error) {
    logQueryFailure("content sections", error);
    return [];
  }

  const sections = new Set(
    (data as { section: string }[])
      .map((row) => row.section?.trim())
      .filter((section): section is string => Boolean(section))
  );

  return [...sections].sort((a, b) => a.localeCompare(b));
}

/* ----------------------------------------------------------------- messages */

export interface MessageFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "all" | MessageStatusDb;
  sort?: "recent" | "oldest";
}

export interface MessageCounts {
  all: number;
  new: number;
  "in-progress": number;
  resolved: number;
}

/**
 * The contact inbox.
 *
 * `contact_messages` is write-only to the public and admin-only to read — see
 * the policies in migration 4. That asymmetry is the point: anyone may send,
 * nobody may scrape the list back, and this query is the only way in.
 */
export async function listMessages(
  filters: MessageFilters = {}
): Promise<Page<ContactMessageRow>> {
  const supabase = await createOperatorClient();
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;

  let query = supabase.from("contact_messages").select("*", { count: "exact" });

  if (filters.search?.trim()) {
    const term = filters.search.trim().replace(/[(),*]/g, " ");
    query = query.or(
      `name.ilike.%${term}%,email.ilike.%${term}%,subject.ilike.%${term}%,order_reference.ilike.%${term}%`
    );
  }

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  query = query.order("created_at", {
    ascending: filters.sort === "oldest",
  });

  const { data, count, error } = await query.range(from, from + pageSize - 1);
  if (error) {
    logQueryFailure("message list", error);
    return toPage<ContactMessageRow>([], 0, page, pageSize);
  }

  return toPage(data as ContactMessageRow[], count, page, pageSize);
}

/**
 * How many messages sit in each status.
 *
 * Four `head: true` counts rather than reading every row and tallying in
 * memory: the inbox is unbounded, and the badge on an empty filter should not
 * cost a full table read. PostgREST returns the count in a header, so these
 * transfer no rows at all.
 */
export async function getMessageCounts(): Promise<MessageCounts> {
  const supabase = await createOperatorClient();

  const count = async (status?: MessageStatusDb) => {
    let query = supabase
      .from("contact_messages")
      .select("id", { count: "exact", head: true });
    if (status) query = query.eq("status", status);

    const { count: total, error } = await query;
    if (error) {
      logQueryFailure("message count", error);
      return 0;
    }
    return total ?? 0;
  };

  const [all, unread, inProgress, resolved] = await Promise.all([
    count(),
    count("new"),
    count("in-progress"),
    count("resolved"),
  ]);

  return { all, new: unread, "in-progress": inProgress, resolved };
}

/* ------------------------------------------------------------- appointments */

export interface AppointmentFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "all" | AppointmentStatusDb;
  mode?: "all" | "in-person" | "video";
  boutique?: string;
  /** "upcoming" sorts by the date being asked for; the rest by arrival. */
  sort?: "upcoming" | "recent" | "oldest";
}

export interface AppointmentCounts {
  all: number;
  requested: number;
  confirmed: number;
  /** Confirmed or requested, with a preferred date already in the past. */
  overdue: number;
}

/**
 * An appointment with `overdue` already decided.
 *
 * Resolved here rather than in the page for the same reason as
 * `ArticleListRow`: working it out needs the clock, and reading the clock
 * during render is the impurity React's linter objects to. Doing it once per
 * query also means every row in a table is judged against the same instant,
 * which a per-row `Date.now()` would not guarantee.
 */
export interface AppointmentListRow extends AppointmentRow {
  /** Still open, and the time being held has passed. */
  is_overdue: boolean;
}

/**
 * The appointment diary.
 *
 * `appointments` is write-only to the public and admin-only to read — the same
 * asymmetry as `contact_messages`, and for a sharper reason: a readable diary
 * discloses who is visiting which boutique and when.
 */
export async function listAppointments(
  filters: AppointmentFilters = {}
): Promise<Page<AppointmentListRow>> {
  const supabase = await createOperatorClient();
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const now = new Date().toISOString();

  let query = supabase.from("appointments").select("*", { count: "exact" });

  if (filters.search?.trim()) {
    const term = filters.search.trim().replace(/[(),*]/g, " ");
    query = query.or(
      `name.ilike.%${term}%,email.ilike.%${term}%,reference.ilike.%${term}%,interest.ilike.%${term}%`
    );
  }

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.mode && filters.mode !== "all") query = query.eq("mode", filters.mode);
  if (filters.boutique) query = query.eq("boutique", filters.boutique);

  switch (filters.sort) {
    case "recent":
      query = query.order("created_at", { ascending: false });
      break;
    case "oldest":
      query = query.order("created_at", { ascending: true });
      break;
    default:
      // Soonest first: the diary is read to answer "what is next", and a
      // request for tomorrow matters more than one that arrived first.
      query = query.order("preferred_at", { ascending: true });
  }

  const { data, count, error } = await query.range(from, from + pageSize - 1);
  if (error) {
    logQueryFailure("appointment list", error);
    return toPage<AppointmentListRow>([], 0, page, pageSize);
  }

  const rows = (data as AppointmentRow[]).map((appointment) => ({
    ...appointment,
    is_overdue:
      (appointment.status === "requested" || appointment.status === "confirmed") &&
      // The agreed time if there is one, otherwise the time being asked for.
      (appointment.confirmed_at ?? appointment.preferred_at) < now,
  }));

  return toPage(rows, count, page, pageSize);
}

export async function getAppointmentCounts(): Promise<AppointmentCounts> {
  const supabase = await createOperatorClient();
  const now = new Date().toISOString();

  const base = () =>
    supabase.from("appointments").select("id", { count: "exact", head: true });

  const run = async (query: ReturnType<typeof base>) => {
    const { count, error } = await query;
    if (error) {
      logQueryFailure("appointment count", error);
      return 0;
    }
    return count ?? 0;
  };

  const [all, requested, confirmed, overdue] = await Promise.all([
    run(base()),
    run(base().eq("status", "requested")),
    run(base().eq("status", "confirmed")),
    // Still open, and the date being asked for has passed. This is the number
    // that means somebody has been left waiting.
    run(base().in("status", ["requested", "confirmed"]).lt("preferred_at", now)),
  ]);

  return { all, requested, confirmed, overdue };
}

/** Distinct boutiques with a booking against them, for the filter control. */
export async function listAppointmentBoutiques(): Promise<string[]> {
  const supabase = await createOperatorClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("boutique")
    .not("boutique", "is", null);

  if (error) {
    logQueryFailure("appointment boutiques", error);
    return [];
  }

  const boutiques = new Set(
    (data as { boutique: string | null }[])
      .map((row) => row.boutique?.trim())
      .filter((value): value is string => Boolean(value))
  );

  return [...boutiques].sort((a, b) => a.localeCompare(b));
}

/* -------------------------------------------------------------- subscribers */

export interface SubscriberFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "all" | "subscribed" | "unsubscribed" | "unconfirmed";
  source?: string;
  sort?: "recent" | "oldest" | "email";
}

export interface SubscriberCounts {
  all: number;
  subscribed: number;
  unsubscribed: number;
  unconfirmed: number;
}

/**
 * The mailing list.
 *
 * Unsubscribing sets `unsubscribed_at` rather than deleting the row. That is
 * not sentimentality about data: a deleted row is indistinguishable from
 * someone who never subscribed, so the next import or signup form would
 * happily add them back to a list they asked to leave.
 */
export async function listSubscribers(
  filters: SubscriberFilters = {}
): Promise<Page<NewsletterSubscriberRow>> {
  const supabase = await createOperatorClient();
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;

  let query = supabase
    .from("newsletter_subscribers")
    .select("*", { count: "exact" });

  if (filters.search?.trim()) {
    const term = filters.search.trim().replace(/[(),*]/g, " ");
    query = query.ilike("email", `%${term}%`);
  }

  if (filters.source) query = query.eq("source", filters.source);

  switch (filters.status) {
    case "subscribed":
      query = query.is("unsubscribed_at", null);
      break;
    case "unsubscribed":
      query = query.not("unsubscribed_at", "is", null);
      break;
    case "unconfirmed":
      query = query.eq("is_confirmed", false).is("unsubscribed_at", null);
      break;
  }

  switch (filters.sort) {
    case "oldest":
      query = query.order("created_at", { ascending: true });
      break;
    case "email":
      query = query.order("email", { ascending: true });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  const { data, count, error } = await query.range(from, from + pageSize - 1);
  if (error) {
    logQueryFailure("subscriber list", error);
    return toPage<NewsletterSubscriberRow>([], 0, page, pageSize);
  }

  return toPage(data as NewsletterSubscriberRow[], count, page, pageSize);
}

export async function getSubscriberCounts(): Promise<SubscriberCounts> {
  const supabase = await createOperatorClient();

  const base = () =>
    supabase
      .from("newsletter_subscribers")
      .select("id", { count: "exact", head: true });

  const run = async (query: ReturnType<typeof base>) => {
    const { count, error } = await query;
    if (error) {
      logQueryFailure("subscriber count", error);
      return 0;
    }
    return count ?? 0;
  };

  const [all, subscribed, unsubscribed, unconfirmed] = await Promise.all([
    run(base()),
    run(base().is("unsubscribed_at", null)),
    run(base().not("unsubscribed_at", "is", null)),
    run(base().eq("is_confirmed", false).is("unsubscribed_at", null)),
  ]);

  return { all, subscribed, unsubscribed, unconfirmed };
}

/** Distinct signup sources, for the filter control. */
export async function listSubscriberSources(): Promise<string[]> {
  const supabase = await createOperatorClient();
  const { data, error } = await supabase
    .from("newsletter_subscribers")
    .select("source");

  if (error) {
    logQueryFailure("subscriber sources", error);
    return [];
  }

  const sources = new Set(
    (data as { source: string }[])
      .map((row) => row.source?.trim())
      .filter((value): value is string => Boolean(value))
  );

  return [...sources].sort((a, b) => a.localeCompare(b));
}

/**
 * Every subscribed address, for export.
 *
 * Not paged, and deliberately separate from `listSubscribers`: an export is a
 * different operation from a list view, and reusing the paged query would mean
 * an operator quietly exporting page one and believing it was the list.
 *
 * Capped. A mailing list large enough to exceed this wants a background job,
 * not a Server Action holding a response open.
 */
export async function getSubscriberExport(): Promise<
  Pick<NewsletterSubscriberRow, "email" | "source" | "created_at">[]
> {
  const supabase = await createOperatorClient();
  const { data, error } = await supabase
    .from("newsletter_subscribers")
    .select("email, source, created_at")
    .is("unsubscribed_at", null)
    .order("created_at", { ascending: false })
    .limit(10_000);

  if (error) {
    logQueryFailure("subscriber export", error);
    return [];
  }

  return data as Pick<
    NewsletterSubscriberRow,
    "email" | "source" | "created_at"
  >[];
}

/* -------------------------------------------------------------------- POS */

/** A sellable line at the counter. */
export interface PosItem {
  variant_id: string;
  product_name: string;
  variant_title: string;
  sku: string;
  price: number;
  inventory_quantity: number;
  image_path: string | null;
}

/**
 * Everything sellable, for the till's search.
 *
 * Loaded whole and filtered in the browser rather than queried per keystroke.
 * A counter needs the list to respond as fast as somebody types, and a round
 * trip per character to a database half a second away does not. The ceiling
 * keeps that honest — past it, this wants a server-side search.
 *
 * Out-of-stock variants are included rather than hidden: an operator searching
 * for something needs to be told it is finished, not shown nothing.
 */
export async function listPosItems(): Promise<PosItem[]> {
  const supabase = await createOperatorClient();

  const { data, error } = await supabase
    .from("product_variants")
    .select(
      "id, sku, title, price, inventory_quantity, products(name, is_active, product_images(storage_path, position))"
    )
    .order("sku")
    .limit(500);

  if (error) {
    logQueryFailure("POS item list", error);
    return [];
  }

  type Joined = {
    id: string;
    sku: string;
    title: string;
    price: number;
    inventory_quantity: number;
    products: {
      name: string;
      is_active: boolean;
      product_images: { storage_path: string; position: number }[] | null;
    } | null;
  };

  return (data as unknown as Joined[])
    // A variant whose product row is gone cannot be sold or named.
    .filter((row) => row.products !== null)
    .map((row) => {
      const images = [...(row.products!.product_images ?? [])].sort(
        (a, b) => a.position - b.position
      );

      return {
        variant_id: row.id,
        product_name: row.products!.name,
        variant_title: row.title,
        sku: row.sku,
        price: row.price,
        inventory_quantity: row.inventory_quantity,
        image_path: images[0]?.storage_path ?? null,
      } satisfies PosItem;
    });
}

/* ------------------------------------------------------------------ sales */

export interface SaleListRow extends SaleRow {
  item_count: number;
}

export interface SaleFilters {
  page?: number;
  pageSize?: number;
  search?: string;
  method?: "all" | SalePaymentMethodDb;
  /** Calendar day boundaries are the operator's, not UTC's. */
  range?: SaleRange;
  status?: "all" | SaleStatusDb;
}

/**
 * Periods the sales list offers.
 *
 * `today` is the default rather than `all`, because the question a counter
 * asks this screen twenty times a day is "what have we taken today" — and an
 * all-time list answers it only after a filter change.
 */
export type SaleRange =
  | "all"
  | "today"
  | "yesterday"
  | "week"
  | "month";

/** Half-open [start, end) in ISO. `end` is null for ranges with no upper bound. */
export function saleRangeBounds(range: SaleRange | undefined): {
  start: string | null;
  end: string | null;
} {
  const now = new Date();
  const midnight = (offsetDays = 0) =>
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + offsetDays);

  switch (range) {
    case "today":
      return { start: midnight().toISOString(), end: null };
    case "yesterday":
      // Bounded at both ends — the only range that is, since "yesterday"
      // excludes today rather than running up to now.
      return {
        start: midnight(-1).toISOString(),
        end: midnight().toISOString(),
      };
    case "week":
      return { start: midnight(-6).toISOString(), end: null };
    case "month":
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
        end: null,
      };
    default:
      return { start: null, end: null };
  }
}

export interface SalesSummary {
  todayTotal: number;
  todayCount: number;
  weekTotal: number;
  allCount: number;
}

export async function listSales(
  filters: SaleFilters = {}
): Promise<Page<SaleListRow>> {
  const supabase = await createOperatorClient();
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;

  let query = supabase
    .from("sales")
    .select("*, sale_items(id)", { count: "exact" });

  if (filters.search?.trim()) {
    const term = filters.search.trim().replace(/[(),*]/g, " ");
    query = query.or(
      `reference.ilike.%${term}%,customer_name.ilike.%${term}%,operator_name.ilike.%${term}%`
    );
  }

  if (filters.method && filters.method !== "all") {
    query = query.eq("payment_method", filters.method);
  }

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  const bounds = saleRangeBounds(filters.range);
  if (bounds.start) query = query.gte("created_at", bounds.start);
  if (bounds.end) query = query.lt("created_at", bounds.end);

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) {
    logQueryFailure("sales list", error);
    return toPage<SaleListRow>([], 0, page, pageSize);
  }

  type Joined = SaleRow & { sale_items: { id: string }[] | null };

  const rows = (data as unknown as Joined[]).map((row) => {
    const { sale_items, ...sale } = row;
    return { ...sale, item_count: sale_items?.length ?? 0 } satisfies SaleListRow;
  });

  return toPage(rows, count, page, pageSize);
}

/* ------------------------------------------------------- one sale, in full */

export type { SaleItemRow };

export interface SaleDetail extends SaleRow {
  items: SaleItemRow[];
}

/** A single sale with its lines — what the view drawer and the receipt read. */
export async function getSaleDetail(id: string): Promise<SaleDetail | null> {
  const supabase = await createOperatorClient();

  const { data, error } = await supabase
    .from("sales")
    .select("*, sale_items(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    logQueryFailure("sale detail", error);
    return null;
  }
  if (!data) return null;

  const { sale_items, ...sale } = data as unknown as SaleRow & {
    sale_items: SaleItemRow[] | null;
  };

  return { ...sale, items: sale_items ?? [] };
}

/* ----------------------------------------------------------------- export */

/**
 * Every sale matching the filters, lines included, with no pagination.
 *
 * Separate from `listSales` because an export must not silently stop at the
 * end of page one — the whole point is that the file matches what the operator
 * filtered to. Capped so a year of trading cannot exhaust the request's memory
 * on a serverless instance; the cap is reported so the UI can say the file was
 * truncated rather than let somebody file a short VAT return.
 */
export const SALES_EXPORT_LIMIT = 5000;

export interface SalesExport {
  rows: (SaleRow & { items: SaleItemRow[] })[];
  truncated: boolean;
}

export async function listSalesForExport(
  filters: SaleFilters = {}
): Promise<SalesExport> {
  const supabase = await createOperatorClient();

  let query = supabase.from("sales").select("*, sale_items(*)");

  if (filters.search?.trim()) {
    const term = filters.search.trim().replace(/[(),*]/g, " ");
    query = query.or(
      `reference.ilike.%${term}%,customer_name.ilike.%${term}%,operator_name.ilike.%${term}%`
    );
  }
  if (filters.method && filters.method !== "all") {
    query = query.eq("payment_method", filters.method);
  }
  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  const bounds = saleRangeBounds(filters.range);
  if (bounds.start) query = query.gte("created_at", bounds.start);
  if (bounds.end) query = query.lt("created_at", bounds.end);

  // One over the cap, so "there was more" is knowable rather than guessed.
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(SALES_EXPORT_LIMIT + 1);

  if (error) {
    logQueryFailure("sales export", error);
    return { rows: [], truncated: false };
  }

  const joined = (data ?? []) as unknown as (SaleRow & {
    sale_items: SaleItemRow[] | null;
  })[];

  const truncated = joined.length > SALES_EXPORT_LIMIT;

  return {
    rows: joined.slice(0, SALES_EXPORT_LIMIT).map(({ sale_items, ...sale }) => ({
      ...sale,
      items: sale_items ?? [],
    })),
    truncated,
  };
}

/** Local midnight, as an ISO instant. */
function startOfToday(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

/** Local midnight seven days ago. */
function startOfWeek(): string {
  const now = new Date();
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 6
  ).toISOString();
}

export async function getSalesSummary(): Promise<SalesSummary> {
  const supabase = await createOperatorClient();

  const [today, week, all] = await Promise.all([
    supabase.from("sales").select("total").gte("created_at", startOfToday()),
    supabase.from("sales").select("total").gte("created_at", startOfWeek()),
    supabase.from("sales").select("id", { count: "exact", head: true }),
  ]);

  if (today.error || week.error || all.error) {
    logQueryFailure("sales summary", today.error ?? week.error ?? all.error);
    return { todayTotal: 0, todayCount: 0, weekTotal: 0, allCount: 0 };
  }

  const sum = (rows: { total: number }[] | null) =>
    (rows ?? []).reduce((acc, row) => acc + (row.total ?? 0), 0);

  return {
    todayTotal: sum(today.data),
    todayCount: (today.data ?? []).length,
    weekTotal: sum(week.data),
    allCount: all.count ?? 0,
  };
}

/** The lines on one sale, for the receipt view. */
export async function getSaleItems(saleId: string): Promise<SaleItemRow[]> {
  const supabase = await createOperatorClient();

  const { data, error } = await supabase
    .from("sale_items")
    .select("*")
    .eq("sale_id", saleId);

  if (error) {
    logQueryFailure("sale items", error);
    return [];
  }

  return data as SaleItemRow[];
}
