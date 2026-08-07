import type { Metadata } from "next";
import { cookies } from "next/headers";

import { requireAdmin } from "@/lib/admin/guard";
import { getStoreSettings } from "@/lib/settings";
import { AdminCurrencyProvider } from "@/components/admin/admin-currency";
import { GRANTABLE_MODULES } from "@/lib/admin/permissions";
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

  const [notifications, settings, cookieStore] = await Promise.all([
    getNotifications(),
    getStoreSettings(),
    cookies(),
  ]);

  const collapsed = cookieStore.get(ADMIN_RAIL_COOKIE)?.value === "1";

  // Plain strings: an `AdminModule` carries a Lucide icon, and a component
  // cannot be serialised across the boundary. The rail rebuilds the nav from
  // these. A superadmin holds everything, so it sends every segment.
  const permitted = identity.unrestricted
    ? GRANTABLE_MODULES.map((module) => module.segment)
    : identity.permissions;

  const name =
    [identity.profile.first_name, identity.profile.last_name]
      .filter(Boolean)
      .join(" ") || identity.profile.email;

  return (
    <div className="contents">
      <AdminCurrencyProvider config={settings.currency}>
      <AdminShell
        operator={{
          name,
          email: identity.profile.email,
          role: identity.profile.role,
        }}
        notifications={notifications}
        permitted={permitted}
        defaultCollapsed={collapsed}
      >
        {children}
      </AdminShell>
      </AdminCurrencyProvider>
    </div>
  );
}
