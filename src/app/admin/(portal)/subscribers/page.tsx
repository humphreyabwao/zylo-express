import { BadgeCheck, Mail, MailX, Users } from "lucide-react";

import { requireAdmin } from "@/lib/admin/guard";
import {
  getSubscriberCounts,
  listSubscriberSources,
  listSubscribers,
  normalisePage,
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
import { ListToolbar } from "@/components/admin/toolbar";
import { Pagination } from "@/components/admin/pagination";
import { RealtimeRefresh } from "@/components/admin/realtime-refresh";
import {
  SubscriberActions,
  SubscriberExportButton,
  SubscriberStatusBadge,
} from "@/components/admin/subscriber-actions";

export const metadata = { title: "Subscribers" };

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default async function AdminSubscribersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const read = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const filters = {
    page: normalisePage(read("page")),
    search: read("q"),
    status: (read("status") ?? "all") as
      | "all"
      | "subscribed"
      | "unsubscribed"
      | "unconfirmed",
    source: read("source"),
    sort: (read("sort") ?? "recent") as "recent" | "oldest" | "email",
  };

  const [page, counts, sources] = await Promise.all([
    listSubscribers(filters),
    getSubscriberCounts(),
    listSubscriberSources(),
  ]);

  const filtered = Boolean(
    filters.search || filters.source || filters.status !== "all"
  );

  return (
    <>
      <PageHeader
        title="Subscribers"
        description="The mailing list. Unsubscribing keeps the record so a later signup cannot undo it."
      >
        <RealtimeRefresh channel="subscribers" label="the list" />
        <SubscriberExportButton />
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total"
          value={String(counts.all)}
          icon={Users}
          href="/admin/subscribers"
        />
        <StatCard
          label="Subscribed"
          value={String(counts.subscribed)}
          tone="positive"
          hint="Would receive the next send"
          icon={Mail}
          href="/admin/subscribers?status=subscribed"
        />
        <StatCard
          label="Unconfirmed"
          value={String(counts.unconfirmed)}
          tone={counts.unconfirmed > 0 ? "warning" : "neutral"}
          hint="No double opt-in is wired yet"
          icon={BadgeCheck}
          href="/admin/subscribers?status=unconfirmed"
        />
        <StatCard
          label="Unsubscribed"
          value={String(counts.unsubscribed)}
          icon={MailX}
          href="/admin/subscribers?status=unsubscribed"
        />
      </div>

      <Panel>
        <ListToolbar
          searchPlaceholder="Search by email address…"
          filters={[
            {
              name: "status",
              label: "Status",
              options: [
                { value: "", label: "All statuses" },
                { value: "subscribed", label: "Subscribed" },
                { value: "unconfirmed", label: "Unconfirmed" },
                { value: "unsubscribed", label: "Unsubscribed" },
              ],
            },
            {
              name: "source",
              label: "Source",
              options: [
                { value: "", label: "All sources" },
                ...sources.map((source) => ({ value: source, label: source })),
              ],
            },
            {
              name: "sort",
              label: "Sort",
              options: [
                { value: "", label: "Newest" },
                { value: "oldest", label: "Oldest" },
                { value: "email", label: "Email A–Z" },
              ],
            },
          ]}
        />

        {page.rows.length === 0 ? (
          <EmptyState
            title={filtered ? "No subscribers match" : "Nobody on the list yet"}
            description={
              filtered
                ? "Nothing matches these filters. Try widening them."
                : "Signups from the footer form land here. The list is admin-only — it is never readable from the storefront, so it cannot be scraped."
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-[38%]">Email</Th>
                <Th>Status</Th>
                <Th>Source</Th>
                <Th align="right">Joined</Th>
                <Th align="right">Left</Th>
                <Th align="right" className="w-16">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>

            <tbody>
              {page.rows.map((subscriber) => (
                <Tr key={subscriber.id}>
                  <Td>
                    <span className="admin-figure block truncate font-medium">
                      {subscriber.email}
                    </span>
                  </Td>

                  <Td>
                    <SubscriberStatusBadge subscriber={subscriber} />
                  </Td>

                  <Td>
                    <Badge tone="neutral">{subscriber.source}</Badge>
                  </Td>

                  <Td align="right" className="admin-figure text-admin-muted">
                    {DATE.format(new Date(subscriber.created_at))}
                  </Td>

                  <Td align="right">
                    {subscriber.unsubscribed_at ? (
                      <span className="admin-figure text-champagne-dark">
                        {DATE.format(new Date(subscriber.unsubscribed_at))}
                      </span>
                    ) : (
                      <span className="text-[0.75rem] text-admin-faint">—</span>
                    )}
                  </Td>

                  <Td align="right">
                    <SubscriberActions subscriber={subscriber} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}

        <Pagination
          page={page}
          basePath="/admin/subscribers"
          label="subscribers"
          searchParams={{
            q: filters.search,
            status: read("status"),
            source: filters.source,
            sort: read("sort"),
          }}
        />
      </Panel>
    </>
  );
}
