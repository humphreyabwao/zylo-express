import { CircleCheck, CircleDot, Clock, Mail } from "lucide-react";

import { requireAdmin } from "@/lib/admin/guard";
import { getMessageCounts, listMessages, normalisePage } from "@/lib/admin/queries";
import {
  EmptyState,
  PageHeader,
  Panel,
  StatCard,
} from "@/components/admin/primitives";
import { ListToolbar } from "@/components/admin/toolbar";
import { Pagination } from "@/components/admin/pagination";
import { RealtimeRefresh } from "@/components/admin/realtime-refresh";
import { MessageInbox } from "@/components/admin/message-inbox";

export const metadata = { title: "Messages" };

export default async function AdminMessagesPage({
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
      | "new"
      | "in-progress"
      | "resolved",
    sort: (read("sort") ?? "recent") as "recent" | "oldest",
  };

  const [page, counts] = await Promise.all([
    listMessages(filters),
    getMessageCounts(),
  ]);

  const filtered = Boolean(filters.search || filters.status !== "all");

  return (
    <>
      <PageHeader
        title="Messages"
        description="Enquiries from the contact form. Replies go out through your own mail client."
      >
        <RealtimeRefresh channel="messages" label="the inbox" />
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total"
          value={String(counts.all)}
          icon={Mail}
          href="/admin/messages"
        />
        <StatCard
          label="Unread"
          value={String(counts.new)}
          tone={counts.new > 0 ? "warning" : "neutral"}
          hint={counts.new > 0 ? "Waiting on a first reply" : "Nothing waiting"}
          icon={CircleDot}
          href="/admin/messages?status=new"
        />
        <StatCard
          label="In progress"
          value={String(counts["in-progress"])}
          icon={Clock}
          href="/admin/messages?status=in-progress"
        />
        <StatCard
          label="Resolved"
          value={String(counts.resolved)}
          tone="positive"
          icon={CircleCheck}
          href="/admin/messages?status=resolved"
        />
      </div>

      <Panel>
        <ListToolbar
          searchPlaceholder="Search by name, email, subject or order…"
          filters={[
            {
              name: "status",
              label: "Status",
              options: [
                { value: "", label: "All statuses" },
                { value: "new", label: "Unread" },
                { value: "in-progress", label: "In progress" },
                { value: "resolved", label: "Resolved" },
              ],
            },
            {
              name: "sort",
              label: "Sort",
              options: [
                { value: "", label: "Newest" },
                { value: "oldest", label: "Oldest" },
              ],
            },
          ]}
        />

        {page.rows.length === 0 ? (
          <EmptyState
            title={filtered ? "No messages match" : "No enquiries yet"}
            description={
              filtered
                ? "Nothing matches these filters. Try widening them."
                : "Messages sent through the contact form at /help/contact land here. Nobody but staff can read them back — the table is write-only to the public."
            }
          />
        ) : (
          <MessageInbox messages={page.rows} />
        )}

        <Pagination
          page={page}
          basePath="/admin/messages"
          label="messages"
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
