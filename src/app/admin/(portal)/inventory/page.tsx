import Link from "next/link";
import { CircleAlert, Layers, TrendingDown, Wallet } from "lucide-react";

import { requireAdmin } from "@/lib/admin/guard";
import {
  LOW_STOCK_THRESHOLD,
  getInventorySummary,
  listInventory,
  normalisePage,
  type StockStatus,
} from "@/lib/admin/queries";
import {
  Badge,
  EmptyState,
  PageHeader,
  Panel,
  StatCard,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/admin/primitives";
import { Money } from "@/components/admin/admin-currency";
import { InventoryActions } from "@/components/admin/inventory-actions";
import { ListToolbar } from "@/components/admin/toolbar";
import { Pagination } from "@/components/admin/pagination";
import { RealtimeRefresh } from "@/components/admin/realtime-refresh";

export const metadata = { title: "Inventory" };

/**
 * Inventory.
 *
 * Variant-level, because that is where stock actually lives: the product row
 * has none of its own, and `reserve_inventory` decrements exactly these rows
 * at checkout. A product-shaped list would have to sum its children and could
 * offer nothing to edit.
 *
 * Live by default — this is the screen most likely to be open while orders are
 * coming in, and a stock figure that is quietly ten minutes stale is worse
 * than no figure at all.
 */
export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin("inventory");

  const params = await searchParams;
  const read = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const filters = {
    page: normalisePage(read("page")),
    search: read("q"),
    status: (read("status") ?? "all") as StockStatus,
    sort: (read("sort") ?? "stock-asc") as
      | "stock-asc"
      | "stock-desc"
      | "value-desc"
      | "sku"
      | "product",
  };

  const [page, summary] = await Promise.all([
    listInventory(filters),
    getInventorySummary(),
  ]);

  const filtered =
    Boolean(filters.search) || filters.status !== "all";

  return (
    <>
      <PageHeader
        title="Inventory"
      >
        <RealtimeRefresh channel="inventory" />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Units in stock"
          value={summary.unit_count.toLocaleString()}
          hint={`Across ${summary.variant_count} option${summary.variant_count === 1 ? "" : "s"}`}
          icon={Layers}
        />
        <StatCard
          label="Retail value"
          value={<Money amount={summary.retail_value} />}
          hint="Stock at asking price, not cost"
          icon={Wallet}
        />
        <StatCard
          label="Low stock"
          value={String(summary.low_stock)}
          tone={summary.low_stock > 0 ? "warning" : "neutral"}
          hint={`At or below ${LOW_STOCK_THRESHOLD} units`}
          icon={TrendingDown}
          href="/admin/inventory?status=low"
        />
        <StatCard
          label="Sold out"
          value={String(summary.out_of_stock)}
          tone={summary.out_of_stock > 0 ? "critical" : "neutral"}
          hint={
            summary.live_out_of_stock > 0
              ? `${summary.live_out_of_stock} on published products`
              : "None on published products"
          }
          icon={CircleAlert}
          href="/admin/inventory?status=out"
        />
      </div>

      <Panel className="mt-6">
        <ListToolbar
          searchPlaceholder="Search by SKU, option or product…"
          filters={[
            {
              name: "status",
              label: "Stock",
              options: [
                { value: "", label: "All stock levels" },
                { value: "out", label: "Sold out" },
                { value: "low", label: "Low stock" },
                { value: "in-stock", label: "In stock" },
              ],
            },
            {
              name: "sort",
              label: "Sort",
              options: [
                { value: "", label: "Scarcest first" },
                { value: "stock-desc", label: "Most stock first" },
                { value: "value-desc", label: "Highest price first" },
                { value: "product", label: "Product A–Z" },
                { value: "sku", label: "SKU" },
              ],
            },
          ]}
        />

        {page.rows.length === 0 ? (
          <EmptyState
            title={filtered ? "Nothing matches" : "No stock to show"}
            description={
              filtered
                ? "No options match these filters. Try widening them."
                : "Inventory appears here once the catalogue has products with variants."
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-[34%]">Option</Th>
                <Th>SKU</Th>
                <Th>Status</Th>
                <Th align="right">Price</Th>
                <Th align="right">Value</Th>
                <Th align="right" className="w-44">
                  Stock
                </Th>
              </tr>
            </thead>

            <tbody>
              {page.rows.map((row) => {
                const out = row.inventory_quantity <= 0;
                const low = !out && row.inventory_quantity <= LOW_STOCK_THRESHOLD;

                return (
                  <Tr key={row.id}>
                    <Td>
                      <Link
                        href={`/admin/products/${row.product_id}`}
                        className="block transition-opacity duration-200 hover:opacity-75"
                      >
                        <span className="block truncate font-medium">
                          {row.product_name}
                        </span>
                        <span className="block truncate text-[0.75rem] text-admin-faint">
                          {row.title}
                          {!row.product_active && " · product is a draft"}
                        </span>
                      </Link>
                    </Td>

                    <Td className="admin-figure text-admin-muted">{row.sku}</Td>

                    <Td>
                      {/* Derived from stock by a database trigger, so this
                          reports the state rather than setting it. */}
                      <Badge tone={out ? "critical" : low ? "warning" : "positive"}>
                        {out ? "Sold out" : low ? "Low" : "In stock"}
                      </Badge>
                    </Td>

                    <Td align="right" className="admin-figure font-semibold">
                      <Money amount={row.price} />
                    </Td>

                    <Td align="right" className="admin-figure text-admin-muted">
                      <Money amount={row.price * row.inventory_quantity} />
                    </Td>

                    <Td align="right">
                      <InventoryActions row={row} />
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}

        <Pagination
          page={page}
          basePath="/admin/inventory"
          label="options"
          searchParams={{
            q: filters.search,
            status: read("status"),
            sort: read("sort"),
          }}
        />
      </Panel>
    </>
  );
}
