import { requireAdmin } from "@/lib/admin/guard";
import { formatDate } from "@/lib/utils";
import { ROLE_DESCRIPTION, ROLE_LABEL, ROLE_TONE } from "@/lib/admin/status";
import { Badge, PageHeader, Panel } from "@/components/admin/primitives";
import {
  ProfileDetailsForm,
  ProfilePasswordForm,
} from "@/components/admin/profile-forms";

export const metadata = { title: "Profile" };

export default async function AdminProfilePage() {
  const { profile, canElevate } = await requireAdmin();

  const name =
    [profile.first_name, profile.last_name].filter(Boolean).join(" ") ||
    profile.email;

  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <>
      <PageHeader title="Profile" />

      <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <ProfileDetailsForm profile={profile} />
          <ProfilePasswordForm />
        </div>

        <Panel className="h-fit">
          <div className="flex items-center gap-3.5 border-b border-admin-line p-5">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-admin-active text-[0.8125rem] font-semibold text-admin-fg">
              {initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[0.875rem] font-medium text-admin-fg">
                {name}
              </span>
              <span className="admin-figure block truncate text-[0.75rem] text-admin-faint">
                {profile.email}
              </span>
            </span>
          </div>

          <dl className="divide-y divide-admin-line">
            <div className="flex items-start justify-between gap-4 px-5 py-3.5">
              <dt className="text-[0.75rem] text-admin-faint">Role</dt>
              <dd className="text-right">
                <Badge tone={ROLE_TONE[profile.role]}>
                  {ROLE_LABEL[profile.role]}
                </Badge>
                <span className="mt-1.5 block max-w-[11rem] text-[0.6875rem] leading-snug text-admin-faint">
                  {ROLE_DESCRIPTION[profile.role]}
                </span>
              </dd>
            </div>

            <div className="flex items-center justify-between gap-4 px-5 py-3.5">
              <dt className="text-[0.75rem] text-admin-faint">Joined</dt>
              <dd className="admin-figure text-[0.8125rem] text-admin-fg">
                {formatDate(profile.created_at, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </dd>
            </div>
          </dl>

          {/* Says what the role permits, once, where an operator wondering why
              a control is greyed out will actually look. */}
          {!canElevate && (
            <p className="border-t border-admin-line px-5 py-3.5 text-[0.6875rem] leading-relaxed text-admin-faint">
              Settings, roles and account creation need an administrator.
            </p>
          )}
        </Panel>
      </div>
    </>
  );
}
