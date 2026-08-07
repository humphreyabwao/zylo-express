"use client";

import * as React from "react";
import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Export the sales list.
 *
 * Two spreadsheet shapes and a print view, all carrying the filters that are
 * on screen — an export that quietly returned everything would be worse than
 * useless to somebody reconciling one day's takings.
 *
 * ## Why CSV rather than .xlsx, and print rather than a generated PDF
 *
 * Excel, Numbers and Sheets all open CSV natively, so a real spreadsheet
 * binary would buy a bold header row in exchange for a writer dependency.
 * Likewise the PDF: the browser's own "Save as PDF" produces a better
 * document than a hand-rolled generator, honours the page size the operator
 * picks, and costs nothing to carry. The print stylesheet in globals.css is
 * already doing this work for till receipts.
 */
export function SalesExportMenu({ query }: { query: string }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
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

  const href = (shape: string) => `/admin/sales/export?${query}&shape=${shape}`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-md border border-admin-line px-3",
          "text-[0.8125rem] font-medium text-admin-muted transition-colors",
          "hover:bg-admin-hover hover:text-admin-fg"
        )}
      >
        <Download className="size-3.5" strokeWidth={2} />
        Export
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.375rem)] z-50 min-w-60 rounded-md border border-admin-line bg-admin-panel py-1 shadow-lg shadow-obsidian/10"
        >
          <ExportItem
            icon={FileSpreadsheet}
            href={href("sales")}
            title="Spreadsheet — one row per sale"
            hint="Totals, payment method and status. For reconciliation."
            onSelect={() => setOpen(false)}
          />

          <ExportItem
            icon={FileSpreadsheet}
            href={href("items")}
            title="Spreadsheet — one row per item"
            hint="What actually sold, line by line. For stock and buying."
            onSelect={() => setOpen(false)}
          />

          <div className="my-1 h-px bg-admin-line" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              // Let the menu unmount first, or it prints into the document.
              requestAnimationFrame(() => window.print());
            }}
            className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-admin-hover"
          >
            <FileText
              className="mt-0.5 size-3.5 shrink-0 text-admin-faint"
              strokeWidth={2}
            />
            <span className="min-w-0">
              <span className="block text-[0.8125rem] font-medium text-admin-fg">
                PDF — print this list
              </span>
              <span className="mt-0.5 block text-[0.6875rem] leading-relaxed text-admin-faint">
                Opens your print dialog. Choose &ldquo;Save as PDF&rdquo;.
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

function ExportItem({
  icon: Icon,
  href,
  title,
  hint,
  onSelect,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  href: string;
  title: string;
  hint: string;
  onSelect: () => void;
}) {
  return (
    <a
      role="menuitem"
      href={href}
      // A plain anchor, not a Link: this hits a route handler that answers with
      // Content-Disposition: attachment. A client-side navigation would try to
      // render the response as a page instead of downloading it.
      download
      onClick={onSelect}
      className="flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-admin-hover"
    >
      <Icon className="mt-0.5 size-3.5 shrink-0 text-admin-faint" strokeWidth={2} />
      <span className="min-w-0">
        <span className="block text-[0.8125rem] font-medium text-admin-fg">
          {title}
        </span>
        <span className="mt-0.5 block text-[0.6875rem] leading-relaxed text-admin-faint">
          {hint}
        </span>
      </span>
    </a>
  );
}

/** Icon re-exported so the page can render a printer glyph in its own header. */
export { Printer };
