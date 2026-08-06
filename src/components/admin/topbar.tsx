"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Menu } from "lucide-react";

import { ADMIN_ROOT, moduleForPath, moduleHref } from "@/lib/admin/nav";
import type { AdminNotification } from "@/lib/admin/queries";
import { AdminNotifications } from "@/components/admin/notifications";
import { AdminProfileMenu, type OperatorSummary } from "@/components/admin/profile-menu";
import { AdminThemeToggle } from "@/components/admin/theme-toggle";

/**
 * The top bar.
 *
 * Sticky, because the operator actions in it â€” notifications, theme, profile â€”
 * must stay reachable from row 400 of a table.
 */
export function AdminTopbar({
  operator,
  notifications,
  onOpenMobileNav,
}: {
  operator: OperatorSummary;
  notifications: AdminNotification[];
  onOpenMobileNav: () => void;
}) {
  const pathname = usePathname();
  const activeModule = moduleForPath(pathname);

  // A third crumb for detail routes: /admin/products/<id> is "Products" plus
  // this page, and without it the trail claims you are on the list.
  const isDetail = Boolean(
    activeModule?.segment &&
      pathname !== moduleHref(activeModule.segment) &&
      pathname.startsWith(`${moduleHref(activeModule.segment)}/`)
  );
  const detailLabel = isDetail ? pathname.split("/").filter(Boolean).pop() : null;

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-admin-line bg-admin-panel/85 px-4 backdrop-blur-md lg:px-6">
      <button
        type="button"
        onClick={onOpenMobileNav}
        aria-label="Open navigation"
        className="grid size-9 place-items-center rounded-md text-admin-muted transition-colors duration-300 hover:bg-admin-hover hover:text-admin-fg lg:hidden"
      >
        <Menu className="size-5" strokeWidth={1.7} />
      </button>

      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex items-center gap-1.5 text-[0.8125rem]">
          <li>
            <Link
              href={ADMIN_ROOT}
              className="font-medium text-admin-faint transition-colors duration-200 hover:text-admin-fg"
            >
              Portal
            </Link>
          </li>

          {activeModule && activeModule.segment !== "" && (
            <>
              <ChevronRight
                className="size-3.5 shrink-0 text-admin-faint"
                strokeWidth={2}
              />
              <li className="min-w-0">
                <Link
                  href={moduleHref(activeModule.segment)}
                  className="truncate font-semibold text-admin-fg transition-opacity duration-200 hover:opacity-70"
                >
                  {activeModule.label}
                </Link>
              </li>
            </>
          )}

          {detailLabel && (
            <>
              <ChevronRight
                className="size-3.5 shrink-0 text-admin-faint"
                strokeWidth={2}
              />
              <li className="min-w-0 truncate font-medium text-admin-faint">
                {detailLabel === "new" ? "New" : detailLabel}
              </li>
            </>
          )}
        </ol>
      </nav>

      <div className="flex shrink-0 items-center gap-2">
        <AdminThemeToggle />
        <AdminNotifications notifications={notifications} />
        <span aria-hidden className="mx-1 h-6 w-px bg-admin-line" />
        <AdminProfileMenu operator={operator} />
      </div>
    </header>
  );
}
