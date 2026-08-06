"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, LogOut, Settings, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { adminSignOut } from "@/app/actions/admin/auth";

/**
 * Operator menu.
 *
 * Hand-rolled rather than pulled from a dropdown primitive: this needs exactly
 * one popover with three links, and the project deliberately removed its
 * dropdown-menu component. Everything it must get right — outside click, Escape,
 * focus return, `aria-expanded` — is a dozen lines, and doing it here keeps the
 * dependency surface where it was.
 */

export interface OperatorSummary {
  name: string;
  email: string;
  role: string;
  isPreview: boolean;
}

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
      // Escape must hand focus back, or the caret is left nowhere and the next
      // Tab starts from the top of the document.
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
        className="flex items-center gap-2.5 rounded-md py-1 pl-1 pr-2 transition-colors duration-300 hover:bg-admin-hover"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-admin-active text-[0.6875rem] font-bold text-admin-fg">
          {initials}
        </span>

        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[0.8125rem] font-semibold text-admin-fg">
            {operator.name}
          </span>
          <span className="block text-[0.6875rem] font-medium capitalize text-admin-faint">
            {operator.role}
          </span>
        </span>

        <ChevronDown
          className={cn(
            "size-3.5 text-admin-faint transition-transform duration-300",
            open && "rotate-180"
          )}
          strokeWidth={2}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 origin-top-right overflow-hidden rounded-lg border border-admin-line bg-admin-panel shadow-xl shadow-black/10 animate-in fade-in-0 zoom-in-95 duration-200"
        >
          <div className="border-b border-admin-line px-4 py-3">
            <p className="truncate text-[0.8125rem] font-semibold text-admin-fg">
              {operator.name}
            </p>
            <p className="truncate text-[0.75rem] text-admin-faint">
              {operator.email}
            </p>

            {operator.isPreview && (
              <p className="mt-2 rounded border border-champagne/40 bg-champagne/10 px-2 py-1 text-[0.6875rem] font-medium leading-snug text-admin-muted">
                Preview identity — not a real account.
              </p>
            )}
          </div>

          <div className="p-1">
            <MenuLink href="/admin/profile" icon={User} label="Your profile" />
            <MenuLink href="/admin/settings" icon={Settings} label="Settings" />
            <MenuLink
              href="/"
              icon={ExternalLink}
              label="View storefront"
              external
            />
          </div>

          <div className="border-t border-admin-line p-1">
            {/* A form, not an onClick: `adminSignOut` ends in a redirect, and
                React's form integration follows it. It also keeps working
                without JavaScript, which for the control that ends a session
                on a shared machine is worth having. */}
            <form action={adminSignOut}>
              <button
                type="submit"
                role="menuitem"
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[0.8125rem] font-medium text-admin-muted transition-colors duration-200 hover:bg-admin-hover hover:text-admin-fg"
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
      className="flex items-center gap-2.5 rounded-md px-3 py-2 text-[0.8125rem] font-medium text-admin-muted transition-colors duration-200 hover:bg-admin-hover hover:text-admin-fg"
    >
      <Icon className="size-4" strokeWidth={1.7} />
      {label}
    </Link>
  );
}
