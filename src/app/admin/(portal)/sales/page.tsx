import Link from "next/link";
import { Banknote, Receipt, ShoppingBag, TrendingUp } from "lucide-react";

import { requireAdmin } from "@/lib/admin/guard";
import {
  getSalesSummary,
  listSales,
  normalisePage,
  type SaleFilters,
} from "@/lib/admin/queries";
import {
  EmptyState,
  PageHeader,
  Panel,
  StatCard,
  StatRow,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/admin/primitives";
import { Money } from "@/components/admin/admin-currency";
import { ListToolbar } from "@/components/admin/toolbar";
import { Pagination } from "@/components/admin/pagination";
import { RealtimeRefresh } from "@/components/admin/realtime-refresh";
import { SaleActions } from "@/components/admin/sale-actions";
import { SalesExportMenu } from "@/components/admin/sales-export";
import {
  SALE_METHOD_CLASS,
  SALE_METHOD_LABEL,
  SALE_STATUS_CLASS,
  SALE_STATUS_LABEL,
} from "@/lib/admin/status";
import { cn } from "@/lib/utils";

export const metadata = { title: "Sales" };

const TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminSalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const identity = await requireAdmin("sales");

  const params = await searchParams;
  const read = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  // Today by default. The question a counter asks this screen twenty times a
  // day is "what have we taken today", and an all-time list answers it only
  // after a filter change. `range=all` is still reachable from the picker.
  const range = (read("range") ?? "today") as SaleFilters["range"];

  const filters: SaleFilters = {
    page: normalisePage(read("page")),
    search: read("q"),
    method: (read("method") ?? "all") as SaleFilters["method"],
    range,
    status: (read("status") ?? "all") as SaleFilters["status"],
  };

  const [page, summary] = await Promise.all([
    listSales(filters),
    getSalesSummary(),
  ]);

  const filtered = Boolean(
    filters.search ||
      filters.method !== "all" ||
      filters.status !== "all" ||
      range !== "today"
  );

  // Carried onto the export links so the file matches what is on screen.
  const exportQuery = new URLSearchParams();
  if (filters.search) exportQuery.set("q", filters.search);
  if (read("method")) exportQuery.set("method", read("method")!);
  if (read("status")) exportQuery.set("status", read("status")!);
  exportQuery.set("range", range ?? "today");

  return (
    <>
      <PageHeader title="Sales">
        {/* Cancelling a sale on another till has to show up here without a
            reload — that is the whole point of a status column. */}
        <RealtimeRefresh channel="sales" />

        <SalesExportMenu query={exportQuery.toString()} />

        <Link
          href="/admin/pos"
          className="inline-flex h-9 items-center rounded-md bg-admin-fg px-4 text-[0.8125rem] font-semibold text-admin-panel transition-opacity hover:opacity-85"
        >
          Open till
        </Link>
      </PageHeader>

      <div className="mb-6">
        <StatRow>
          <StatCard
            label="Today"
            value={<Money amount={summary.todayTotal} />}
            hint={`${summary.todayCount} ${summary.todayCount === 1 ? "sale" : "sales"}`}
            icon={Banknote}
            href="/admin/sales?range=today"
          />
          <StatCard
            label="Last 7 days"
            value={<Money amount={summary.weekTotal} />}
            icon={TrendingUp}
            href="/admin/sales?range=week"
          />
          <StatCard
            label="All sales"
            value={String(summary.allCount)}
            icon={Receipt}
            href="/admin/sales"
          />
          <StatCard
            label="Average today"
            value={
              summary.todayCount > 0
                ? <Money amount={Math.round(summary.todayTotal / summary.todayCount)} />
                : <Money amount={0} />
            }
            icon={ShoppingBag}
          />
        </StatRow>
      </div>

      <Panel>
        <ListToolbar
          searchPlaceholder="Search by reference, customer or operator…"
          filters={[
            {
              name: "range",
              label: "Period",
              // No empty option: blank means "today" here rather than "all",
              // so all-time has to be an explicit value to be selectable.
              options: [
                { value: "today", label: "Today" },
                { value: "yesterday", label: "Yesterday" },
                { value: "week", label: "Last 7 days" },
                { value: "month", label: "This month" },
                { value: "all", label: "All time" },
              ],
            },
            {
              name: "status",
              label: "Status",
              options: [
                { value: "", label: "All statuses" },
                { value: "completed", label: "Completed" },
                { value: "pending", label: "Pending" },
                { value: "cancelled", label: "Cancelled" },
              ],
            },
            {
              name: "method",
              label: "Payment",
              options: [
                { value: "", label: "All methods" },
                { value: "cash", label: "Cash" },
                { value: "card", label: "Card" },
                { value: "mpesa", label: "M-Pesa" },
                { value: "other", label: "Other" },
              ],
            },
          ]}
        />

        {page.rows.length === 0 ? (
          <EmptyState
            title={filtered ? "No sales match" : "No sales yet"}
            description={
              filtered
                ? "Nothing matches these filters. Try widening them."
                : "Counter sales rung up at the till arrive here."
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Reference</Th>
                <Th>Status</Th>
                <Th>Operator</Th>
                <Th>Customer</Th>
                <Th>Payment</Th>
                <Th align="right">Items</Th>
                <Th align="right">Total</Th>
                <Th align="right">Time</Th>
                <Th align="right">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>

            <tbody>
              {page.rows.map((sale) => (
                <Tr key={sale.id}>
                  <Td className="admin-figure font-medium">{sale.reference}</Td>

                  <Td>
                    <span
                      className={cn(
                        "inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-[0.6875rem] font-semibold",
                        SALE_STATUS_CLASS[sale.status] ??
                          "border-admin-line text-admin-muted"
                      )}
                    >
                      {SALE_STATUS_LABEL[sale.status] ?? sale.status}
                    </span>
                  </Td>

                  <Td className="text-admin-muted">{sale.operator_name || "—"}</Td>

                  <Td className="text-admin-muted">
                    {sale.customer_name || (
                      <span className="text-admin-faint">Walk-in</span>
                    )}
                  </Td>

                  <Td>
                    <span
                      className={cn(
                        "inline-flex items-center whitespace-nowrap rounded border px-2 py-0.5 text-[0.6875rem] font-semibold",
                        SALE_METHOD_CLASS[sale.payment_method] ??
                          "border-admin-line text-admin-muted"
                      )}
                    >
                      {SALE_METHOD_LABEL[sale.payment_method] ?? sale.payment_method}
                    </span>
                  </Td>

                  <Td align="right" className="admin-figure text-admin-muted">
                    {sale.item_count}
                  </Td>

                  <Td
                    align="right"
                    className={cn(
                      "admin-figure font-medium",
                      // A cancelled sale is not takings. Struck through so a
                      // column of figures cannot be read as a running total
                      // that includes it.
                      sale.status === "cancelled" &&
                        "text-admin-faint line-through"
                    )}
                  >
                    <Money amount={sale.total} />
                    {sale.discount > 0 && (
                      <span className="ml-1.5 text-[0.75rem] font-normal text-champagne-dark">
                        −<Money amount={sale.discount} />
                      </span>
                    )}
                  </Td>

                  <Td align="right" className="admin-figure text-admin-faint">
                    {TIME.format(new Date(sale.created_at))}
                  </Td>

                  <Td align="right">
                    <SaleActions sale={sale} canElevate={identity.canElevate} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}

        <Pagination
          page={page}
          basePath="/admin/sales"
          label="sales"
          searchParams={{
            q: filters.search,
            method: read("method"),
            range: read("range"),
          }}
        />
      </Panel>
    </>
  );
}
