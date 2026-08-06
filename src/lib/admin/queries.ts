import "server-only";

import { createOperatorClient } from "@/lib/admin/guard";
import type {
  InventorySummaryRpcResult,
  OrderRow,
  OrderStatusDb,
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
    console.error("[admin] product list failed:", error);
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
    // The object is spread rather than logged directly: a PostgrestError has
    // no own enumerable properties that survive structured logging, so
    // `console.error(msg, error)` prints `{}` and tells nobody anything.
    if (error?.code === "PGRST202") {
      console.warn(
        "[admin] inventory_summary() is missing — apply migration 9 " +
          "(npm run schema -- --from 7). Showing zeroed totals meanwhile."
      );
    } else {
      console.error("[admin] inventory summary failed:", {
        code: error?.code,
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
      });
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
    console.error("[admin] inventory list failed:", error);
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
): Promise<Page<ProfileRow>> {
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
    console.error("[admin] staff list failed:", error);
    return toPage<ProfileRow>([], 0, page, pageSize);
  }

  return toPage(data, count, page, pageSize);
}

/* -------------------------------------------------------------------- orders */

export async function listOrders(
  filters: { page?: number; pageSize?: number; status?: OrderStatusDb | "all" } = {}
): Promise<Page<OrderRow>> {
  const supabase = await createOperatorClient();
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;

  let query = supabase.from("orders").select("*", { count: "exact" });
  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  const { data, count, error } = await query
    .order("placed_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (error) {
    console.error("[admin] order list failed:", error);
    return toPage<OrderRow>([], 0, page, pageSize);
  }

  return toPage(data, count, page, pageSize);
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
    console.error("[admin] promotion list failed:", error);
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
