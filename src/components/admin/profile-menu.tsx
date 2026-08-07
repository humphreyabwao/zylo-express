"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, LogOut, Settings, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { adminSignOut } from "@/app/actions/admin/auth";

export interface OperatorSummary {
  name: string;
  email: string;
  role: string;
}

/** Operator menu. Avatar trigger, identity, three links, sign out. */
export function AdminProfileMenu({ operator }: { operator: OperatorSummary }) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Escape hands focus back, or the next Tab starts from the document top.
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const initials =
    operator.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account: ${operator.name}`}
        className={cn(
          "grid size-9 place-items-center rounded-full text-[0.6875rem] font-bold transition-colors duration-200",
          "outline-none focus-visible:ring-2 focus-visible:ring-champagne focus-visible:ring-offset-2 focus-visible:ring-offset-admin-panel",
          open
            ? "bg-admin-fg text-admin-panel"
            : "bg-admin-active text-admin-fg hover:bg-admin-fg hover:text-admin-panel"
        )}
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-60 origin-top-right overflow-hidden rounded-lg border border-admin-line bg-admin-panel shadow-xl shadow-black/10 animate-in fade-in-0 zoom-in-95 duration-150"
        >
          <div className="flex items-center gap-3 border-b border-admin-line px-4 py-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-admin-active text-[0.6875rem] font-bold text-admin-fg">
              {initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[0.8125rem] font-semibold text-admin-fg">
                {operator.name}
              </span>
              <span className="block truncate text-[0.75rem] text-admin-faint">
                {operator.email}
              </span>
            </span>
          </div>

          <div className="p-1">
            <MenuLink href="/admin/profile" icon={User} label="Profile" />
            <MenuLink href="/admin/settings" icon={Settings} label="Settings" />
            <MenuLink href="/" icon={ExternalLink} label="Storefront" external />
          </div>

          <div className="border-t border-admin-line p-1">
            {/* A form, not an onClick: `adminSignOut` ends in a redirect, and
                React's form integration follows it. It also keeps working
                without JavaScript. */}
            <form action={adminSignOut}>
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[0.8125rem] font-medium text-admin-muted transition-colors duration-150 hover:bg-admin-hover hover:text-admin-fg"
              >
                <LogOut className="size-4" strokeWidth={1.7} />
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({
  href,
  icon: Icon,
  label,
  external,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  external?: boolean;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="flex items-center gap-2.5 rounded-md px-3 py-2 text-[0.8125rem] font-medium text-admin-muted transition-colors duration-150 hover:bg-admin-hover hover:text-admin-fg"
    >
      <Icon className="size-4" strokeWidth={1.7} />
      {label}
    </Link>
  );
}
