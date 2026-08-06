import type { Metadata } from "next";
import { cookies } from "next/headers";

import { montserrat } from "@/lib/fonts";
import { requireAdmin, isPreviewMode } from "@/lib/admin/guard";
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
      {isPreviewMode() && <PreviewBanner />}

      <AdminShell
        operator={{
          name,
          email: identity.profile.email,
          role: identity.profile.role,
          isPreview: identity.isPreview,
        }}
        notifications={notifications}
        defaultCollapsed={collapsed}
      >
        {children}
      </AdminShell>
    </div>
  );
}

/**
 * Deliberately loud and un-dismissable.
 *
 * The portal is currently reachable without signing in. That is a development
 * convenience, and the one failure mode worth designing against is somebody
 * forgetting it is on. It cannot render in a production build — `isPreviewMode`
 * is compiled out — so this banner is also the honest signal that the build you
 * are looking at is not one.
 */
function PreviewBanner() {
  return (
    <div className="sticky top-0 z-[60] flex items-center justify-center gap-2 bg-champagne px-4 py-1.5 text-center font-admin text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-obsidian">
      Preview mode — authentication bypassed. Development builds only.
    </div>
  );
}
