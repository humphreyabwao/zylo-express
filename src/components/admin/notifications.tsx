"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, PackageX, Receipt, MessageSquare, Radio } from "lucide-react";

import { cn } from "@/lib/utils";
import { useRealtime } from "@/hooks/use-realtime";
import type { AdminNotification } from "@/lib/admin/queries";

/**
 * Notification bell.
 *
 * The list is computed on the server and passed in. Rather than poll for
 * changes, this subscribes to the inventory channel — the same server-held
 * Supabase subscription the storefront uses — and asks Next to refetch the
 * route when something moves. That keeps a single source of truth: the server
 * decides what counts as a notification, and the client only decides when to
 * ask again.
 *
 * `router.refresh()` is debounced because a bulk stock update emits one event
 * per row, and a burst of fifty would otherwise mean fifty refetches.
 */

const REFRESH_DEBOUNCE_MS = 1200;

const ICONS = {
  stock: PackageX,
  order: Receipt,
  message: MessageSquare,
} as const;

export function AdminNotifications({
  notifications,
}: {
  notifications: AdminNotification[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => router.refresh(), REFRESH_DEBOUNCE_MS);
  }, [router]);

  const { connected } = useRealtime("inventory", scheduleRefresh);

  React.useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const count = notifications.length;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={
          count ? `Notifications, ${count} unread` : "Notifications, none unread"
        }
        className="relative grid size-9 place-items-center rounded-sm text-admin-muted transition-colors duration-300 hover:bg-admin-hover hover:text-admin-fg"
      >
        <Bell className="size-[1.125rem]" strokeWidth={1.7} />
        {count > 0 && (
          <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-champagne px-1 text-[0.5625rem] font-bold leading-4 text-obsidian">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[22rem] origin-top-right border border-admin-line bg-admin-panel shadow-lg shadow-black/5 animate-in fade-in-0 zoom-in-95 duration-200"
        >
          <div className="flex items-center justify-between border-b border-admin-line px-4 py-3">
            <p className="text-[0.8125rem] font-semibold text-admin-fg">
              Notifications
            </p>

            {/* Honest about the live connection: an operator watching a stock
                figure needs to know whether it is actually being kept current. */}
            <span
              className={cn(
                "flex items-center gap-1.5 text-[0.6875rem] font-medium",
                connected ? "text-success" : "text-admin-faint"
              )}
              title={
                connected
                  ? "Receiving live inventory updates"
                  : "Not connected — figures refresh on navigation"
              }
            >
              <Radio className="size-3" strokeWidth={2} />
              {connected ? "Live" : "Offline"}
            </span>
          </div>

          <div className="admin-scroll max-h-[24rem] overflow-y-auto">
            {count === 0 ? (
              <p className="px-4 py-8 text-center text-[0.8125rem] text-admin-faint">
                Nothing needs attention.
              </p>
            ) : (
              <ul className="divide-y divide-admin-line">
                {notifications.map((item) => {
                  const Icon = ICONS[item.kind];
                  return (
                    <li key={item.id}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="flex gap-3 px-4 py-3 transition-colors duration-200 hover:bg-admin-hover"
                      >
                        <span
                          className={cn(
                            "mt-0.5 grid size-7 shrink-0 place-items-center rounded-sm",
                            item.kind === "stock" && "bg-destructive/10 text-destructive",
                            item.kind === "order" && "bg-champagne/15 text-champagne-dark",
                            item.kind === "message" && "bg-admin-hover text-admin-muted"
                          )}
                        >
                          <Icon className="size-3.5" strokeWidth={1.8} />
                        </span>

                        <span className="min-w-0">
                          <span className="block truncate text-[0.8125rem] font-medium text-admin-fg">
                            {item.title}
                          </span>
                          <span className="block truncate text-[0.75rem] text-admin-faint">
                            {item.detail}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
