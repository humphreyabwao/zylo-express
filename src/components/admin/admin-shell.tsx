"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";
import { ADMIN_ROOT, buildNav, moduleHref } from "@/lib/admin/nav";
import type { AdminNotification } from "@/lib/admin/queries";
import { AdminSidebar } from "@/components/admin/sidebar";
import { AdminTopbar } from "@/components/admin/topbar";
import type { OperatorSummary } from "@/components/admin/profile-menu";

/**
 * The portal frame.
 *
 * A client boundary so the rail can collapse and the mobile drawer can open,
 * but `children` is still server-rendered and passed straight through — no page
 * code is pulled into the client bundle by this wrapper.
 */
export function AdminShell({
  children,
  operator,
  notifications,
  permitted,
  defaultCollapsed,
}: {
  children: React.ReactNode;
  operator: OperatorSummary;
  notifications: AdminNotification[];
  /** Module segments this operator holds. See `AdminSidebar`. */
  permitted: string[];
  defaultCollapsed: boolean;
}) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const pathname = usePathname();

  const nav = React.useMemo(() => buildNav(permitted), [permitted]);

  // Closing on navigation is done by the links themselves rather than by an
  // effect watching `pathname`. Same result, one render fewer, and the reason
  // the drawer closed stays where the reader can see it.

  React.useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  return (
    <div className="flex min-h-svh bg-admin-canvas font-admin text-admin-fg">
      <AdminSidebar permitted={permitted} defaultCollapsed={defaultCollapsed} />

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-50 lg:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none"
        )}
        aria-hidden={!mobileOpen}
      >
        <div
          onClick={() => setMobileOpen(false)}
          className={cn(
            "absolute inset-0 bg-obsidian/60 backdrop-blur-sm transition-opacity duration-400",
            mobileOpen ? "opacity-100" : "opacity-0"
          )}
        />

        <nav
          aria-label="Modules"
          className={cn(
            "absolute inset-y-0 left-0 flex w-[15rem] flex-col bg-admin-rail text-admin-rail-fg transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-admin-rail-line px-5">
            <Link href={ADMIN_ROOT} className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-lg bg-champagne text-[0.8125rem] font-bold text-obsidian">
                Z
              </span>
              <span className="text-[0.9375rem] font-semibold tracking-tight">
                ZYLO
                <span className="ml-1.5 font-light text-admin-muted">Portal</span>
              </span>
            </Link>

            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
              className="grid size-8 place-items-center rounded-md text-admin-rail-muted hover:text-admin-rail-fg"
            >
              <X className="size-4" strokeWidth={1.8} />
            </button>
          </div>

          <div className="admin-scroll flex-1 overflow-y-auto px-3 py-5">
            {nav.map((group) => (
              <div key={group.label} className="mb-6 last:mb-0">
                <p className="mb-2 px-3 text-[0.625rem] font-semibold uppercase tracking-[0.18em] text-admin-faint">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {group.modules.map((entry) => {
                    const href = moduleHref(entry.segment);
                    const active =
                      entry.segment === ""
                        ? pathname === ADMIN_ROOT
                        : pathname === href || pathname.startsWith(`${href}/`);
                    const Icon = entry.icon;

                    return (
                      <li key={href}>
                        <Link
                          href={href}
                          onClick={() => setMobileOpen(false)}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-3 rounded-md px-3 py-2.5 text-[0.8125rem] font-medium transition-colors duration-300",
                            active
                              ? "bg-admin-rail-hover text-admin-rail-fg"
                              : "text-admin-rail-muted hover:bg-admin-rail-hover hover:text-admin-rail-fg"
                          )}
                        >
                          <Icon className="size-[1.125rem] shrink-0" strokeWidth={1.6} />
                          {entry.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </nav>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopbar
          operator={operator}
          notifications={notifications}
          permitted={permitted}
          onOpenMobileNav={() => setMobileOpen(true)}
        />
        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
