import { ShieldCheck } from "lucide-react";

import { formatDate } from "@/lib/utils";
import { requireAdmin } from "@/lib/admin/guard";
import { listStaff, normalisePage } from "@/lib/admin/queries";
import { ROLE_DESCRIPTION, ROLE_LABEL, ROLE_TONE } from "@/lib/admin/status";
import type { UserRoleDb } from "@/lib/supabase/types";
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
import { ListToolbar } from "@/components/admin/toolbar";
import { Pagination } from "@/components/admin/pagination";
import { StaffRoleControl } from "@/components/admin/staff-role-control";

export const metadata = { title: "Staff" };

export default async function AdminStaffPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const identity = await requireAdmin();

  const params = await searchParams;
  const read = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const page = await listStaff({
    page: normalisePage(read("page")),
    search: read("q"),
    role: (read("role") ?? "all") as "all" | UserRoleDb,
  });

  return (
    <>
      <PageHeader
        title="Staff"
        description="Who can sign in to this portal, and what they are permitted to do."
      />

      {/* Roles are stated rather than implied. An operator changing somebody's
          role should not have to infer what it grants. */}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {(["admin", "staff", "customer"] as UserRoleDb[]).map((role) => (
          <div
            key={role}
            className="border border-admin-line bg-admin-panel px-4 py-3"
          >
            <Badge tone={ROLE_TONE[role]}>{ROLE_LABEL[role]}</Badge>
            <p className="mt-2 text-[0.75rem] leading-snug text-admin-faint">
              {ROLE_DESCRIPTION[role]}
            </p>
          </div>
        ))}
      </div>

      <Panel>
        <ListToolbar
          searchPlaceholder="Search by name or email…"
          filters={[
            {
              name: "role",
              label: "Role",
              options: [
                { value: "", label: "Staff & admins" },
                { value: "admin", label: "Administrators" },
                { value: "staff", label: "Staff" },
                { value: "customer", label: "Customers" },
              ],
            },
          ]}
        />

        {page.rows.length === 0 ? (
          <EmptyState
            title="Nobody matches"
            description="No accounts match these filters. Staff are created by promoting an existing account — anyone who has signed up can be given portal access here."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-[32%]">Name</Th>
                <Th>Email</Th>
                <Th>Joined</Th>
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
                          {(person.first_name?.[0] ?? person.email[0] ?? "?").toUpperCase()}
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

                    <Td className="text-admin-muted">{person.email}</Td>

                    <Td className="admin-figure text-admin-faint">
                      {formatDate(person.created_at, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </Td>

                    <Td align="right">
                      <StaffRoleControl
                        userId={person.id}
                        role={person.role}
                        // Two reasons the control locks: you cannot demote
                        // yourself, and staff cannot reassign roles at all.
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
          basePath="/admin/staff"
          label="accounts"
          searchParams={{ q: read("q"), role: read("role") }}
        />
      </Panel>

      {!identity.canElevate && (
        <p className="mt-4 flex items-center gap-2 text-[0.75rem] text-admin-faint">
          <ShieldCheck className="size-3.5 shrink-0" strokeWidth={1.8} />
          You are signed in as staff. Role changes require an administrator.
        </p>
      )}
    </>
  );
}
