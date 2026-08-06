import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { formatPrice } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin/guard";
import {
  getDashboardMetrics,
  listOrders,
  listProducts,
  LOW_STOCK_THRESHOLD,
} from "@/lib/admin/queries";
import {
  Badge,
  EmptyState,
  PageHeader,
  Panel,
  PanelHeader,
  StatCard,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/admin/primitives";
import { ORDER_STATUS_TONE } from "@/lib/admin/status";

export const metadata = { title: "Dashboard" };

export default async function AdminDashboardPage() {
  const identity = await requireAdmin();

  const [metrics, recentOrders, recentProducts] = await Promise.all([
    getDashboardMetrics(),
    listOrders({ pageSize: 6 }),
    listProducts({ pageSize: 5, sort: "recent" }),
  ]);

  const firstName = identity.profile.first_name ?? "there";

  return (
    <>
      <PageHeader
        title={`Good day, ${firstName}`}
        description="Everything trading right now, in one place."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Revenue"
          value={formatPrice(metrics.revenue)}
          hint="Excludes cancelled and refunded orders"
        />
        <StatCard
          label="Orders"
          value={String(metrics.orderCount)}
          hint={
            metrics.orderCount === 0
              ? "No orders placed yet"
              : "All time, every status"
          }
        />
        <StatCard
          label="Customers"
          value={String(metrics.customerCount)}
          hint="Registered accounts"
        />
        <StatCard
          label="Published"
          value={`${metrics.publishedCount} / ${metrics.productCount}`}
          hint="Live products against the full catalogue"
        />
      </div>

      {/* Things wanting attention are separated from the headline figures:
          these are prompts to act, not measures of the business. */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Out of stock"
          value={String(metrics.outOfStockCount)}
          tone={metrics.outOfStockCount > 0 ? "critical" : "neutral"}
          hint="Variants unavailable to buy"
        />
        <StatCard
          label="Low stock"
          value={String(metrics.lowStockCount)}
          tone={metrics.lowStockCount > 0 ? "warning" : "neutral"}
          hint={`At or below ${LOW_STOCK_THRESHOLD} units`}
        />
        <StatCard
          label="Open enquiries"
          value={String(metrics.openMessageCount)}
          tone={metrics.openMessageCount > 0 ? "warning" : "neutral"}
          hint="Unresolved contact messages"
        />
        <StatCard
          label="Active promotions"
          value={String(metrics.activePromotionCount)}
          hint="Codes currently redeemable"
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Panel>
          <PanelHeader
            title="Recent orders"
            action={
              <Link
                href="/admin/orders"
                className="flex items-center gap-1 text-[0.75rem] font-semibold text-admin-muted transition-colors duration-200 hover:text-admin-fg"
              >
                View all
                <ArrowUpRight className="size-3.5" strokeWidth={2} />
              </Link>
            }
          />

          {recentOrders.rows.length === 0 ? (
            <EmptyState
              title="No orders yet"
              description="Orders will appear here as soon as the first customer checks out."
            />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Reference</Th>
                  <Th>Customer</Th>
                  <Th>Status</Th>
                  <Th align="right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.rows.map((order) => (
                  <Tr key={order.id}>
                    <Td className="font-semibold">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="transition-opacity hover:opacity-70"
                      >
                        {order.reference}
                      </Link>
                    </Td>
                    <Td className="text-admin-muted">{order.email}</Td>
                    <Td>
                      <Badge tone={ORDER_STATUS_TONE[order.status]}>
                        {order.status}
                      </Badge>
                    </Td>
                    <Td align="right" className="admin-figure font-semibold">
                      {formatPrice(order.total)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>

        <Panel>
          <PanelHeader
            title="Recently published"
            action={
              <Link
                href="/admin/products"
                className="flex items-center gap-1 text-[0.75rem] font-semibold text-admin-muted transition-colors duration-200 hover:text-admin-fg"
              >
                Catalogue
                <ArrowUpRight className="size-3.5" strokeWidth={2} />
              </Link>
            }
          />

          {recentProducts.rows.length === 0 ? (
            <EmptyState
              title="Catalogue is empty"
              description="Add a product to see it here."
            />
          ) : (
            <ul className="divide-y divide-admin-line">
              {recentProducts.rows.map((product) => (
                <li key={product.id}>
                  <Link
                    href={`/admin/products/${product.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 transition-colors duration-200 hover:bg-admin-hover"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[0.8125rem] font-medium text-admin-fg">
                        {product.name}
                      </span>
                      <span className="admin-figure block text-[0.75rem] text-admin-faint">
                        {product.variant_count} variants · {product.stock} in stock
                      </span>
                    </span>

                    <span className="admin-figure shrink-0 text-[0.8125rem] font-semibold">
                      {formatPrice(product.price)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
