import { CalendarCheck, CalendarClock, CalendarDays, TriangleAlert, Video } from "lucide-react";

import { requireAdmin } from "@/lib/admin/guard";
import {
  getAppointmentCounts,
  listAppointmentBoutiques,
  listAppointments,
  normalisePage,
} from "@/lib/admin/queries";
import {
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
  AppointmentActions,
  AppointmentStatusBadge,
} from "@/components/admin/appointment-actions";

export const metadata = { title: "Appointments" };

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminAppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin("appointments");

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
      | "requested"
      | "confirmed"
      | "completed"
      | "cancelled",
    mode: (read("mode") ?? "all") as "all" | "in-person" | "video",
    boutique: read("boutique"),
    sort: (read("sort") ?? "upcoming") as "upcoming" | "recent" | "oldest",
  };

  const [page, counts, boutiques] = await Promise.all([
    listAppointments(filters),
    getAppointmentCounts(),
    listAppointmentBoutiques(),
  ]);

  const filtered = Boolean(
    filters.search ||
      filters.boutique ||
      filters.status !== "all" ||
      filters.mode !== "all"
  );

  return (
    <>
      <PageHeader
        title="Appointments"
      >
        <RealtimeRefresh channel="appointments" />
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="All"
          value={String(counts.all)}
          icon={CalendarDays}
          href="/admin/appointments"
        />
        <StatCard
          label="Awaiting reply"
          value={String(counts.requested)}
          tone={counts.requested > 0 ? "warning" : "neutral"}
          icon={CalendarClock}
          href="/admin/appointments?status=requested"
        />
        <StatCard
          label="Confirmed"
          value={String(counts.confirmed)}
          tone="positive"
          icon={CalendarCheck}
          href="/admin/appointments?status=confirmed"
        />
        <StatCard
          label="Overdue"
          value={String(counts.overdue)}
          tone={counts.overdue > 0 ? "critical" : "neutral"}
          icon={TriangleAlert}
        />
      </div>

      <Panel>
        <ListToolbar
          searchPlaceholder="Search by name, email or reference…"
          filters={[
            {
              name: "status",
              label: "Status",
              options: [
                { value: "", label: "All statuses" },
                { value: "requested", label: "Requested" },
                { value: "confirmed", label: "Confirmed" },
                { value: "completed", label: "Completed" },
                { value: "cancelled", label: "Cancelled" },
              ],
            },
            {
              name: "mode",
              label: "Mode",
              options: [
                { value: "", label: "In person & video" },
                { value: "in-person", label: "In person" },
                { value: "video", label: "By video" },
              ],
            },
            {
              name: "boutique",
              label: "Boutique",
              options: [
                { value: "", label: "All boutiques" },
                ...boutiques.map((city) => ({ value: city, label: city })),
              ],
            },
            {
              name: "sort",
              label: "Sort",
              options: [
                { value: "", label: "Soonest first" },
                { value: "recent", label: "Newest request" },
                { value: "oldest", label: "Oldest request" },
              ],
            },
          ]}
        />

        {page.rows.length === 0 ? (
          <EmptyState
            title={filtered ? "No appointments match" : "No appointments yet"}
            description={
              filtered
                ? "Nothing matches these filters. Try widening them."
                : "Requests from /services/appointments arrive here."
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-[24%]">Guest</Th>
                <Th>Reference</Th>
                <Th>Where</Th>
                <Th>Status</Th>
                <Th align="right">Asked for</Th>
                <Th align="right">Confirmed</Th>
                <Th align="right" className="w-16">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>

            <tbody>
              {page.rows.map((appointment) => (
                <Tr key={appointment.id}>
                  <Td>
                    <span className="block truncate font-medium">
                      {appointment.name}
                    </span>
                    <span className="admin-figure block truncate text-[0.75rem] text-admin-faint">
                      {appointment.email}
                    </span>
                  </Td>

                  <Td className="admin-figure text-admin-muted">
                    {appointment.reference}
                  </Td>

                  <Td>
                    {appointment.mode === "video" ? (
                      <span className="inline-flex items-center gap-1.5 text-admin-muted">
                        <Video className="size-3.5" strokeWidth={1.8} />
                        Video
                      </span>
                    ) : (
                      <span className="text-admin-muted">
                        {appointment.boutique}
                      </span>
                    )}
                    {appointment.party_size > 1 && (
                      <span className="admin-figure block text-[0.75rem] text-admin-faint">
                        {appointment.party_size} guests
                      </span>
                    )}
                  </Td>

                  <Td>
                    <AppointmentStatusBadge
                      status={appointment.status}
                      overdue={appointment.is_overdue}
                    />
                  </Td>

                  <Td align="right" className="admin-figure text-admin-muted">
                    {DATE_TIME.format(new Date(appointment.preferred_at))}
                  </Td>

                  <Td align="right">
                    {appointment.confirmed_at ? (
                      <span className="admin-figure font-semibold text-success">
                        {DATE_TIME.format(new Date(appointment.confirmed_at))}
                      </span>
                    ) : (
                      <span className="text-[0.75rem] text-admin-faint">—</span>
                    )}
                  </Td>

                  <Td align="right">
                    <AppointmentActions appointment={appointment} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}

        <Pagination
          page={page}
          basePath="/admin/appointments"
          label="appointments"
          searchParams={{
            q: filters.search,
            status: read("status"),
            mode: read("mode"),
            boutique: filters.boutique,
            sort: read("sort"),
          }}
        />
      </Panel>
    </>
  );
}
