"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

/**
 * Portal dialog and form primitives.
 *
 * Not `@/components/ui/dialog`: that one is styled for the storefront —
 * square-cornered, serif, 3rem of padding — and a workspace dialog inheriting
 * a gallery's proportions is most of why this portal read as unfinished.
 *
 * Shared from here rather than living in whichever component needed one first.
 * Three modules now open dialogs (products, variants, images) and a fourth
 * will; a copy each is three chances for the focus handling to drift.
 */

/* ------------------------------------------------------------------ modal */

export function Modal({
  title,
  description,
  size = "md",
  onClose,
  children,
}: {
  title: string;
  description?: string;
  size?: "md" | "lg";
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    // Move focus in, or a keyboard operator is left tabbing through the page
    // behind the overlay.
    panelRef.current
      ?.querySelector<HTMLElement>("input, select, textarea, button")
      ?.focus();

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  // Portalled to the body because triggers live inside `Panel`, whose
  // `overflow-hidden` is what holds its rounded corners, and inside `Table`,
  // which scrolls. A dialog rendered in place inherits every clip and stacking
  // context between there and the root.
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div
        className="absolute inset-0 bg-obsidian/60 backdrop-blur-sm animate-in fade-in-0 duration-200"
        onClick={onClose}
        aria-hidden
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "relative z-10 w-full overflow-hidden rounded-xl border border-admin-line bg-admin-panel shadow-2xl shadow-black/25 animate-in fade-in-0 zoom-in-95 duration-200",
          size === "lg" ? "max-w-2xl" : "max-w-lg"
        )}
      >
        <div className="border-b border-admin-line px-6 py-4">
          <h2 className="text-[0.9375rem] font-semibold text-admin-fg">{title}</h2>
          {description && (
            <p className="mt-1 text-[0.8125rem] leading-relaxed text-admin-faint">
              {description}
            </p>
          )}
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

/** Scrolling body region. Capped so a tall form never pushes its own footer off. */
export function ModalBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("max-h-[60vh] overflow-y-auto px-6 py-5", className)}>
      {children}
    </div>
  );
}

export function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-2 border-t border-admin-line px-6 py-4">
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ fields */

export function inputClass(invalid?: boolean) {
  return cn(
    "h-9 w-full rounded-md border bg-transparent px-3 text-[0.8125rem] text-admin-fg",
    "outline-none transition-colors duration-200 placeholder:text-admin-faint",
    invalid
      ? "border-destructive focus:border-destructive"
      : "border-admin-line focus:border-champagne"
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[0.75rem] font-semibold text-admin-fg">{label}</span>
        {hint && !error && (
          <span className="text-[0.6875rem] text-admin-faint">{hint}</span>
        )}
      </span>

      {children}

      {error && (
        <span className="mt-1.5 block text-[0.75rem] font-medium text-destructive">
          {error}
        </span>
      )}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
  disabled?: boolean;
}) {
  return (
    <div className={cn("flex items-start gap-3", disabled && "opacity-60")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "mt-0.5 h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors duration-200",
          "outline-none focus-visible:ring-2 focus-visible:ring-champagne",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
          checked ? "bg-success" : "bg-admin-line"
        )}
      >
        <span
          className={cn(
            "block size-4 rounded-full bg-white shadow-sm transition-transform duration-200",
            checked && "translate-x-4"
          )}
        />
      </button>

      <span className="min-w-0">
        <span className="block text-[0.8125rem] font-medium text-admin-fg">
          {label}
        </span>
        <span className="block text-[0.75rem] leading-snug text-admin-faint">
          {hint}
        </span>
      </span>
    </div>
  );
}

/* -------------------------------------------------------------- money field */

/** Minor units → the decimal string a person types. */
export function toAmountField(minor: number | null): string {
  return minor === null ? "" : (minor / 100).toFixed(2);
}
