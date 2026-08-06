import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Portal building blocks.
 *
 * Server components, all of them — a table cell has no state. Keeping them out
 * of the client bundle matters more here than anywhere else in the app, because
 * a list view renders hundreds of them.
 */

/* ---------------------------------------------------------------- page head */

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  /** Primary actions, right-aligned. */
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[1.375rem] font-semibold tracking-tight text-admin-fg">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-admin-faint">
            {description}
          </p>
        )}
      </div>

      {children && (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- panels */

export function Panel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "border border-admin-line bg-admin-panel",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  action,
}: {
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-admin-line px-5 py-3.5">
      <h2 className="text-[0.875rem] font-semibold text-admin-fg">{title}</h2>
      {action}
    </div>
  );
}

/* -------------------------------------------------------------------- stats */

export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "positive" | "warning" | "critical";
}) {
  return (
    <Panel className="p-5">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-admin-faint">
        {label}
      </p>

      <p
        className={cn(
          "admin-figure mt-2.5 text-[1.75rem] font-semibold leading-none tracking-tight",
          tone === "neutral" && "text-admin-fg",
          tone === "positive" && "text-success",
          tone === "warning" && "text-champagne-dark",
          tone === "critical" && "text-destructive"
        )}
      >
        {value}
      </p>

      {hint && (
        <p className="mt-2 text-[0.75rem] leading-snug text-admin-faint">{hint}</p>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------- badges */

type BadgeTone = "neutral" | "positive" | "warning" | "critical" | "accent";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-sm border px-2 py-0.5 text-[0.6875rem] font-semibold",
        tone === "neutral" && "border-admin-line text-admin-muted",
        tone === "positive" && "border-success/30 bg-success/10 text-success",
        tone === "warning" &&
          "border-champagne-dark/30 bg-champagne/10 text-champagne-dark",
        tone === "critical" &&
          "border-destructive/30 bg-destructive/10 text-destructive",
        tone === "accent" && "border-champagne/40 bg-champagne/15 text-champagne-dark"
      )}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------- table */

export function Table({ children }: { children: React.ReactNode }) {
  // The wrapper scrolls, not the page: a wide table must never make the whole
  // document scroll sideways.
  return (
    <div className="admin-scroll w-full overflow-x-auto">
      <table className="w-full min-w-[52rem] border-collapse text-left">
        {children}
      </table>
    </div>
  );
}

export function Th({
  children,
  align = "left",
  className,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-admin-line px-4 py-3 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-admin-faint",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className,
}: {
  children?: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <td
      className={cn(
        "border-b border-admin-line px-4 py-3 text-[0.8125rem] text-admin-fg",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className
      )}
    >
      {children}
    </td>
  );
}

export function Tr({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <tr className={cn("transition-colors duration-200 hover:bg-admin-hover", className)}>
      {children}
    </tr>
  );
}

/* -------------------------------------------------------------- empty state */

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-[0.9375rem] font-semibold text-admin-fg">{title}</p>
      <p className="mt-1.5 max-w-sm text-[0.8125rem] leading-relaxed text-admin-faint">
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ pending */

export function PendingModule({ label }: { label: string }) {
  return (
    <Panel>
      <EmptyState
        title={`${label} is not built yet`}
        description="This module is registered in the sidebar so the shape of the portal is visible, but its screens have not been implemented. Nothing here is broken — there is simply nothing to show."
      />
    </Panel>
  );
}
