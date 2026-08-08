import { Truck } from "lucide-react";

import { formatDate } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin/guard";
import { listOrders, normalisePage } from "@/lib/admin/queries";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
} from "@/lib/admin/status";
import type { OrderStatusDb } from "@/lib/supabase/types";
import {
  Badge,
  EmptyState,
  PageHeader,
  Panel,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/admin/primitives";
import { Money } from "@/components/admin/admin-currency";
import { ListToolbar } from "@/components/admin/toolbar";
import { RealtimeRefresh } from "@/components/admin/realtime-refresh";
import { Pagination } from "@/components/admin/pagination";
import { OrderActions } from "@/components/admin/order-actions";

export const metadata = { title: "Orders" };

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const identity = await requireAdmin("orders");

  const params = await searchParams;
  const read = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const search = read("q");
  const status = (read("status") ?? "all") as OrderStatusDb | "all";

  const page = await listOrders({
    page: normalisePage(read("page")),
    status,
    search,
  });

  const filtered = Boolean(search || status !== "all");

  return (
    <>
      <PageHeader title="Orders">
        <RealtimeRefresh channel="orders" />
      </PageHeader>

      <Panel>
        <ListToolbar
          searchPlaceholder="Search by reference or email…"
          filters={[
            {
              name: "status",
              label: "Status",
              options: [
                { value: "", label: "All statuses" },
                ...ORDER_STATUSES.map((status) => ({
                  value: status,
                  label: ORDER_STATUS_LABEL[status],
                })),
              ],
            },
          ]}
        />

        {page.rows.length === 0 ? (
          <EmptyState
            title={filtered ? "No orders match" : "No orders yet"}
            description={
              filtered
                ? "Nothing matches these filters. Try widening them."
                : "Orders appear here the moment a customer completes checkout. Nothing has been placed against this database."
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Reference</Th>
                <Th>Customer</Th>
                <Th>Placed</Th>
                <Th>Status</Th>
                <Th align="right">Items</Th>
                <Th align="right">Total</Th>
                <Th align="right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>

            <tbody>
              {page.rows.map((order) => (
                <Tr key={order.id}>
                  <Td className="font-semibold">
                    <span className="admin-figure">{order.reference}</span>
                    {/* A parcel that is on its way is the one thing an operator
                        scans this column for, and it is otherwise invisible
                        until the drawer is opened. */}
                    {(order.tracking_number || order.tracking_url) && (
                      <Truck
                        className="ml-1.5 inline size-3.5 align-[-0.15em] text-admin-faint"
                        strokeWidth={1.7}
                        aria-label="Tracking recorded"
                      />
                    )}
                  </Td>

                  <Td className="text-admin-muted">{order.email}</Td>

                  <Td className="admin-figure text-admin-faint">
                    {formatDate(order.placed_at, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </Td>

                  <Td>
                    <Badge tone={ORDER_STATUS_TONE[order.status]}>
                      {ORDER_STATUS_LABEL[order.status]}
                    </Badge>
                  </Td>

                  <Td align="right" className="admin-figure text-admin-muted">
                    {order.item_count}
                  </Td>

                  <Td align="right" className="admin-figure font-semibold">
                    <Money amount={order.total} />
                  </Td>

                  <Td align="right">
                    <OrderActions
                      order={order}
                      canElevate={identity.canElevate}
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}

        <Pagination
          page={page}
          basePath="/admin/orders"
          label="orders"
          searchParams={{ status: read("status"), q: search }}
        />
      </Panel>
    </>
  );
}
