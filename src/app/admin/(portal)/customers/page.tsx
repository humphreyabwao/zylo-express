import { Receipt, Users, Wallet } from "lucide-react";

import { formatDate } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin/guard";
import { listCustomers, normalisePage } from "@/lib/admin/queries";
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
import { StaffRoleControl } from "@/components/admin/staff-role-control";
import { ListToolbar } from "@/components/admin/toolbar";
import { Pagination } from "@/components/admin/pagination";

export const metadata = { title: "Customers" };

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const identity = await requireAdmin("customers");

  const params = await searchParams;
  const read = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const filters = {
    page: normalisePage(read("page")),
    search: read("q"),
    role: (read("role") ?? "all") as "all" | "customer" | "staff" | "admin",
    sort: (read("sort") ?? "recent") as "recent" | "spend" | "orders" | "name",
  };

  const page = await listCustomers(filters);

  const withOrders = page.rows.filter((c) => c.order_count > 0).length;
  const pageSpend = page.rows.reduce((sum, c) => sum + c.lifetime_value, 0);

  return (
    <>
      <PageHeader
        title="Customers"
        description="Every account, and what it has bought."
      />

      {/*
        The one failure mode worth naming on the page itself. `profiles` is
        readable only by its owner or an admin, and the preview identity is
        fabricated in application code — it never reaches Postgres, so
        `auth.uid()` is null and the policy matches nothing. An empty table
        with no explanation reads as a broken query.
      */}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Accounts"
          value={page.total.toLocaleString()}
          hint={filters.role === "all" ? "Customer accounts" : `Role: ${filters.role}`}
          icon={Users}
        />
        <StatCard
          label="Have ordered"
          value={`${withOrders} / ${page.rows.length}`}
          hint="On this page"
          icon={Receipt}
        />
        <StatCard
          label="Spend on this page"
          value={<Money amount={pageSpend} />}
          hint="Excludes cancelled and refunded"
          icon={Wallet}
        />
      </div>

      <Panel className="mt-6">
        <ListToolbar
          searchPlaceholder="Search by name or email…"
          filters={[
            {
              name: "role",
              label: "Role",
              options: [
                { value: "", label: "Customers" },
                { value: "staff", label: "Staff" },
                { value: "admin", label: "Administrators" },
              ],
            },
            {
              name: "sort",
              label: "Sort",
              options: [
                { value: "", label: "Newest first" },
                { value: "spend", label: "Highest spend" },
                { value: "orders", label: "Most orders" },
                { value: "name", label: "Name A–Z" },
              ],
            },
          ]}
        />

        {page.rows.length === 0 ? (
          <EmptyState
            title="No accounts to show"
            description={
              filters.search || filters.role !== "all"
                ? "No accounts match these filters. Try widening them."
                : "Customer accounts appear here as people sign up on the storefront."
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-[28%]">Name</Th>
                <Th>Email</Th>
                <Th>Joined</Th>
                <Th align="right">Orders</Th>
                <Th align="right">Lifetime</Th>
                <Th align="right">Role</Th>
              </tr>
            </thead>

            <tbody>
              {page.rows.map((person) => {
                const name =
                  [person.first_name, person.last_name].filter(Boolean).join(" ") ||
                  "—";
                const isSelf = person.id === identity.profile.id;

                return (
                  <Tr key={person.id}>
                    <Td>
                      <span className="flex items-center gap-2.5">
                        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-admin-hover text-[0.6875rem] font-bold text-admin-muted">
                          {(
                            person.first_name?.[0] ??
                            person.email[0] ??
                            "?"
                          ).toUpperCase()}
                        </span>

                        <span className="min-w-0">
                          <span className="block truncate font-medium">{name}</span>
                          {isSelf && (
                            <span className="text-[0.6875rem] font-medium text-champagne-dark">
                              That&rsquo;s you
                            </span>
                          )}
                        </span>
                      </span>
                    </Td>

                    <Td className="text-admin-muted">
                      <span className="block truncate">{person.email}</span>
                      {person.marketing_opt_in && (
                        <Badge tone="accent">Subscribed</Badge>
                      )}
                    </Td>

                    <Td className="admin-figure text-admin-faint">
                      {formatDate(person.created_at, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </Td>

                    <Td align="right" className="admin-figure text-admin-muted">
                      {person.order_count}
                    </Td>

                    <Td align="right" className="admin-figure font-semibold">
                      {person.lifetime_value > 0
                        ? <Money amount={person.lifetime_value} />
                        : "—"}
                    </Td>

                    <Td align="right">
                      <StaffRoleControl
                        userId={person.id}
                        role={person.role}
                        disabled={isSelf || !identity.canElevate}
                        disabledReason={
                          isSelf
                            ? "You cannot change your own role. Ask another administrator."
                            : "Only administrators can change roles."
                        }
                      />
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}

        <Pagination
          page={page}
          basePath="/admin/customers"
          label="accounts"
          searchParams={{
            q: filters.search,
            role: read("role"),
            sort: read("sort"),
          }}
        />
      </Panel>
    </>
  );
}
