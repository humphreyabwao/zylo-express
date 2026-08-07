"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { cn } from "@/lib/utils";
import { ADMIN_ROOT, buildNav, moduleHref } from "@/lib/admin/nav";

/**
 * The module rail.
 *
 * Collapse state lives in a cookie rather than localStorage so the server can
 * read it and render the correct width on the first paint. localStorage is only
 * readable after hydration, which means the rail would always flash wide before
 * snapping narrow â€” the one animation nobody asked for.
 */

const COOKIE = "zylo_admin_rail";
/** A year: this is a workspace preference, not a session detail. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function AdminSidebar({
  permitted,
  defaultCollapsed,
  onCollapsedChange,
}: {
  /**
   * Module segments this operator holds — plain strings.
   *
   * Not the modules themselves: an `AdminModule` carries a Lucide icon, which
   * is a component, and a component cannot be serialised across the
   * server/client boundary. The nav is rebuilt here from `ADMIN_NAV`, which is
   * a static constant already in this bundle.
   *
   * This is presentation only. What an operator may actually reach is decided
   * by the page and action guards on the server.
   */
  permitted: string[];
  defaultCollapsed: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(defaultCollapsed);

  const nav = React.useMemo(() => buildNav(permitted), [permitted]);

  const toggle = React.useCallback(() => {
    setCollapsed((previous) => {
      const next = !previous;
      document.cookie = `${COOKIE}=${next ? "1" : "0"}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
      onCollapsedChange?.(next);
      return next;
    });
  }, [onCollapsedChange]);

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "group/rail sticky top-0 z-30 hidden h-svh shrink-0 flex-col bg-admin-rail text-admin-rail-fg lg:flex",
        // The only transitioned property is width. Animating the whole layout
        // would drag every table cell to the right through a repaint.
        "transition-[width] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
        collapsed ? "w-[4.25rem]" : "w-[14.5rem]"
      )}
    >
      {/* Wordmark */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-admin-rail-line px-5">
        <Link
          href={ADMIN_ROOT}
          className="flex items-center gap-3 overflow-hidden"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-champagne text-[0.8125rem] font-bold tracking-tight text-obsidian">
            Z
          </span>
          <span
            className={cn(
              "whitespace-nowrap text-[0.9375rem] font-medium tracking-tight text-admin-rail-fg transition-all duration-300",
              collapsed && "pointer-events-none w-0 -translate-x-2 opacity-0"
            )}
          >
            ZYLO
            <span className="ml-1.5 font-light text-admin-rail-muted">Portal</span>
          </span>
        </Link>
      </div>

      {/* Modules */}
      <nav className="admin-scroll flex-1 overflow-y-auto overflow-x-hidden px-3 py-5">
        {nav.map((group) => (
          <div key={group.label} className="mb-6 last:mb-0">
            <p
              className={cn(
                "mb-2 px-3 text-[0.625rem] font-medium uppercase tracking-[0.2em] text-admin-rail-label transition-all duration-300",
                collapsed && "pointer-events-none h-0 opacity-0"
              )}
            >
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
                      title={collapsed ? entry.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group/item relative flex items-center gap-3 px-3 py-2.5 transition-colors duration-200",
                        active
                          ? "bg-admin-rail-hover text-admin-rail-fg"
                          : "text-admin-rail-muted hover:bg-admin-rail-hover hover:text-admin-rail-fg"
                      )}
                    >
                      {/* Active marker, drawn rather than nudged so the row
                          never shifts horizontally when selection changes. */}
                      <span
                        aria-hidden
                        className={cn(
                          "absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 bg-champagne transition-all duration-400",
                          active ? "opacity-100" : "scale-y-0 opacity-0"
                        )}
                      />

                      <Icon
                        className="size-[1.125rem] shrink-0"
                        strokeWidth={active ? 2 : 1.6}
                      />

                      <span
                        className={cn(
                          "flex min-w-0 flex-1 items-center justify-between gap-2 transition-all duration-300",
                          collapsed &&
                            "pointer-events-none w-0 -translate-x-2 opacity-0"
                        )}
                      >
                        <span className="truncate text-[0.8125rem] font-medium">
                          {entry.label}
                        </span>

                        {entry.pending && (
                          <span className="shrink-0 rounded border border-admin-line px-1.5 py-px text-[0.5625rem] font-semibold uppercase tracking-wider text-admin-faint">
                            Soon
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Minimiser */}
      <div className="shrink-0 border-t border-admin-rail-line p-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="flex w-full items-center gap-3 px-3 py-2.5 text-admin-rail-muted transition-colors duration-300 hover:text-admin-rail-fg"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-[1.125rem] shrink-0" strokeWidth={1.6} />
          ) : (
            <PanelLeftClose className="size-[1.125rem] shrink-0" strokeWidth={1.6} />
          )}
          <span
            className={cn(
              "whitespace-nowrap text-[0.8125rem] font-medium transition-all duration-300",
              collapsed && "pointer-events-none w-0 -translate-x-2 opacity-0"
            )}
          >
            Collapse
          </span>
        </button>
      </div>
    </aside>
  );
}

export { COOKIE as ADMIN_RAIL_COOKIE };
