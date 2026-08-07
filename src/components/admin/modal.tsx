"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Loader2, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import { AdminButton } from "@/components/admin/primitives";

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

/* ------------------------------------------------------------ confirmation */

/**
 * Destructive confirmation.
 *
 * `product-actions.tsx` uses type-to-confirm for deleting a product, which is
 * the right weight for the one operation in the portal that destroys imagery,
 * options and variants together. Most deletes are not that: a category with no
 * products, or a collection whose members survive it, are recoverable by
 * recreating a row with the same fields.
 *
 * So this is the lighter of the two, and the choice between them is a real
 * one — making every delete type-to-confirm is how operators learn to copy the
 * name without reading the sentence above it.
 *
 * Stays open when `onConfirm` resolves false, so a refusal is read next to the
 * thing it is refusing rather than as a toast over an empty screen.
 */
export function ConfirmDialog({
  title,
  confirmLabel = "Delete",
  busyLabel = "Deleting…",
  onClose,
  onConfirm,
  children,
}: {
  title: string;
  confirmLabel?: string;
  busyLabel?: string;
  onClose: () => void;
  onConfirm: () => Promise<boolean>;
  /** The consequence, in a sentence. */
  children: React.ReactNode;
}) {
  const [working, setWorking] = React.useState(false);

  return (
    <Modal title={title} onClose={onClose}>
      <div className="px-6 py-5">
        <div className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0 text-destructive"
            strokeWidth={2}
          />
          <div className="text-[0.8125rem] leading-relaxed text-admin-fg">
            {children}
          </div>
        </div>
      </div>

      <ModalFooter>
        <AdminButton variant="secondary" onClick={onClose} disabled={working}>
          Cancel
        </AdminButton>

        <AdminButton
          variant="danger"
          disabled={working}
          onClick={async () => {
            setWorking(true);
            const ok = await onConfirm();
            setWorking(false);
            if (ok) onClose();
          }}
        >
          {working && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />}
          {working ? busyLabel : confirmLabel}
        </AdminButton>
      </ModalFooter>
    </Modal>
  );
}
