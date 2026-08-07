import Link from "next/link";

import { formatDate } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin/guard";
import { listOrders, normalisePage } from "@/lib/admin/queries";
import { ORDER_STATUS_TONE } from "@/lib/admin/status";
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

export const metadata = { title: "Orders" };

const STATUSES: OrderStatusDb[] = [
  "pending",
  "confirmed",
  "in-atelier",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
];

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin("orders");

  const params = await searchParams;
  const read = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const page = await listOrders({
    page: normalisePage(read("page")),
    status: (read("status") ?? "all") as OrderStatusDb | "all",
  });

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
                ...STATUSES.map((s) => ({ value: s, label: s })),
              ],
            },
          ]}
        />

        {page.rows.length === 0 ? (
          <EmptyState
            title="No orders yet"
            description="Orders appear here the moment a customer completes checkout. Nothing has been placed against this database."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Reference</Th>
                <Th>Customer</Th>
                <Th>Placed</Th>
                <Th>Status</Th>
                <Th align="right">Total</Th>
              </tr>
            </thead>

            <tbody>
              {page.rows.map((order) => (
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
                  <Td className="admin-figure text-admin-faint">
                    {formatDate(order.placed_at, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </Td>
                  <Td>
                    <Badge tone={ORDER_STATUS_TONE[order.status]}>
                      {order.status}
                    </Badge>
                  </Td>
                  <Td align="right" className="admin-figure font-semibold">
                    <Money amount={order.total} />
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
          searchParams={{ status: read("status") }}
        />
      </Panel>
    </>
  );
}
