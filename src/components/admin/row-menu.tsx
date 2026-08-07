"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Loader2, MoreHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { IconButton } from "@/components/admin/primitives";

/**
 * The row action menu, as a primitive.
 *
 * `product-actions.tsx` grew this first — the portalling, the outside-click
 * and Escape handling, the scroll-to-close — and Categories and Collections
 * both need exactly it. Copying it twice more would be three places for the
 * focus handling to drift apart, which is the same argument `primitives.tsx`
 * makes about buttons.
 *
 * ## Why the menu is portalled
 *
 * `Table` wraps its rows in `overflow-x-auto` so a wide table scrolls instead
 * of the page. That establishes a scroll container on both axes — setting
 * `overflow-x` to anything but `visible` makes `overflow-y` compute to `auto`
 * — so an absolutely positioned menu inside a cell is clipped at the row's
 * edge, and the last few rows of any table would open a menu into a scrollbar.
 *
 * Portalling to `document.body` escapes the clip. The cost is that the
 * position has to be measured rather than inherited, and goes stale the moment
 * anything moves — which is why scrolling closes the menu rather than chasing
 * it.
 */

/** Where a portalled menu should sit, in viewport coordinates. */
interface MenuAnchor {
  top: number;
  right: number;
}

export function RowMenu({
  label,
  busy = false,
  children,
}: {
  /** Accessible name for the trigger, e.g. "Actions for Outerwear". */
  label: string;
  /** Swaps the trigger glyph for a spinner and blocks re-entry. */
  busy?: boolean;
  /**
   * Menu contents. Called with `close` so an item can dismiss the menu before
   * opening a dialog — a modal appearing behind a still-open menu is the most
   * common way this component gets used wrongly.
   */
  children: (close: () => void) => React.ReactNode;
}) {
  const [anchor, setAnchor] = React.useState<MenuAnchor | null>(null);

  const menuRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const open = anchor !== null;
  const close = React.useCallback(() => setAnchor(null), []);

  const toggle = () => {
    if (open) {
      close();
      return;
    }

    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    setAnchor({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
  };

  React.useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close();
      // Escape must hand focus back, or the next Tab starts from the top of
      // the document rather than from the row being worked on.
      triggerRef.current?.focus();
    };
    const onScroll = () => close();

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, close]);

  const menu = anchor && (
    <div
      ref={menuRef}
      role="menu"
      style={{ top: anchor.top, right: anchor.right }}
      className="fixed z-50 w-56 origin-top-right overflow-hidden rounded-lg border border-admin-line bg-admin-panel py-1 shadow-xl shadow-black/15 animate-in fade-in-0 zoom-in-95 duration-150"
    >
      {children(close)}
    </div>
  );

  return (
    <div className="flex justify-end">
      <IconButton
        ref={triggerRef}
        label={label}
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={busy}
        className={cn(open && "bg-admin-hover text-admin-fg")}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" strokeWidth={2} />
        ) : (
          <MoreHorizontal className="size-4" strokeWidth={2} />
        )}
      </IconButton>

      {/* Portalled after mount only: `document` does not exist during the
          server render, and reaching for it would break hydration. */}
      {menu && createPortal(menu, document.body)}
    </div>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-admin-line" aria-hidden />;
}

type MenuItemProps = {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  tone?: "default" | "danger";
  disabled?: boolean;
} & (
  | { as: "link"; href: string; external?: boolean; onClick?: never }
  | { as?: undefined; href?: never; external?: never; onClick: () => void }
);

export function MenuItem({
  icon: Icon,
  label,
  tone = "default",
  disabled = false,
  ...props
}: MenuItemProps) {
  const className = cn(
    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[0.8125rem] font-medium transition-colors duration-150",
    tone === "danger"
      ? "text-destructive hover:bg-destructive/10"
      : "text-admin-muted hover:bg-admin-hover hover:text-admin-fg",
    disabled && "pointer-events-none opacity-40"
  );

  if (props.as === "link") {
    return (
      <Link
        href={props.href}
        role="menuitem"
        aria-disabled={disabled || undefined}
        {...(props.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className={className}
      >
        <Icon className="size-4 shrink-0" strokeWidth={1.7} />
        {label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={props.onClick}
      className={className}
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.7} />
      {label}
    </button>
  );
}
