import type { Metadata } from "next";
import { cookies } from "next/headers";

import { montserrat } from "@/lib/fonts";
import { requireAdmin } from "@/lib/admin/guard";
import { getNotifications } from "@/lib/admin/queries";
import { AdminShell } from "@/components/admin/admin-shell";
import { ADMIN_RAIL_COOKIE } from "@/components/admin/sidebar";

/**
 * The portal is never indexed, and must not be. `robots` here covers every
 * route beneath it without each page having to remember.
 */
export const metadata: Metadata = {
  title: { default: "Portal", template: "%s · ZYLO Portal" },
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Nothing in the portal may be prerendered or cached: every page is scoped to
 * the signed-in operator, and a cached dashboard is one operator's figures
 * served to another.
 */
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Redirects to /admin/login when there is no staff session. The login route
  // opts out of this layout via its own route segment — see admin/login.
  const identity = await requireAdmin();

  const [notifications, cookieStore] = await Promise.all([
    getNotifications(),
    cookies(),
  ]);

  const collapsed = cookieStore.get(ADMIN_RAIL_COOKIE)?.value === "1";

  const name =
    [identity.profile.first_name, identity.profile.last_name]
      .filter(Boolean)
      .join(" ") || identity.profile.email;

  return (
    <div className={`${montserrat.variable} contents`}>
      <AdminShell
        operator={{
          name,
          email: identity.profile.email,
          role: identity.profile.role,
        }}
        notifications={notifications}
        defaultCollapsed={collapsed}
      >
        {children}
      </AdminShell>
    </div>
  );
}
