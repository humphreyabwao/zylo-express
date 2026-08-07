import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Portal building blocks.
 *
 * Server components, all of them — a table cell has no state. Keeping them out
 * of the client bundle matters more here than anywhere else in the app, because
 * a list view renders hundreds of them.
 *
 * ## Surfaces
 *
 * Structure is carried by hairline rules and whitespace, not by stacked
 * surfaces. Panels sit flat on the canvas — no radius, no shadow, no raised
 * shade — because eight rounded, shadowed cards on one screen stop reading as
 * content and start reading as a field of rectangles.
 *
 * Radii survive only on controls, where a corner is affordance rather than
 * decoration:
 *
 *   rounded-md   (3px)   buttons, inputs, selects, menus
 *   rounded      (2px)   badges and inline chips
 *
 * Everything larger has been removed. The storefront is square-cornered
 * because hard edges read as editorial; the portal is square-cornered because
 * a document is easier to read than a dashboard of tiles.
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

/* ------------------------------------------------------------------ buttons */

/**
 * The portal's button.
 *
 * Extracted because five modules had each written their own `h-9 rounded-sm
 * bg-admin-fg px-4 …` by hand, and they had already drifted apart — different
 * heights, different hover treatments, two different radii. A control that
 * looks slightly different on every screen is most of what makes an interface
 * feel unfinished.
 *
 * Renders an `<a>` when given `href`, a `<button>` otherwise, so a navigation
 * stays a real link — middle-clickable, and announced as a link.
 */
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_BASE =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-semibold " +
  "transition-colors duration-200 outline-none " +
  "focus-visible:ring-2 focus-visible:ring-champagne focus-visible:ring-offset-1 focus-visible:ring-offset-admin-panel " +
  "disabled:pointer-events-none disabled:opacity-50";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-admin-fg text-admin-panel hover:opacity-85",
  secondary:
    "border border-admin-line bg-admin-panel text-admin-fg hover:bg-admin-hover",
  ghost: "text-admin-muted hover:bg-admin-hover hover:text-admin-fg",
  // Destructive intent is carried by colour on the *label*, with the fill kept
  // light. A solid red button is loud enough that operators learn to click past
  // it, which is the opposite of what a confirmation should achieve.
  danger:
    "border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[0.75rem]",
  md: "h-9 px-4 text-[0.8125rem]",
};

export function adminButtonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string
) {
  return cn(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className);
}

type AdminButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
} & (
  | ({ href: string } & Omit<React.ComponentProps<typeof Link>, "href" | "className">)
  | ({ href?: undefined } & Omit<React.ComponentProps<"button">, "className">)
);

export function AdminButton({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: AdminButtonProps) {
  const classes = adminButtonClass(variant, size, className);

  if (props.href) {
    const { href, ...rest } = props;
    return (
      <Link href={href} className={classes} {...rest}>
        {children}
      </Link>
    );
  }

  const { href: _ignored, type, ...rest } = props as { href?: undefined } & Omit<
    React.ComponentProps<"button">,
    "className"
  >;
  void _ignored;

  return (
    <button type={type ?? "button"} className={classes} {...rest}>
      {children}
    </button>
  );
}

/**
 * Square icon-only control. `label` is required — it is the accessible name.
 *
 * `ref` rides through the spread rather than needing `forwardRef`: React 19
 * passes it as an ordinary prop to function components, and menu triggers here
 * need one to return focus on Escape.
 */
export function IconButton({
  label,
  className,
  children,
  ...props
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
} & Omit<React.ComponentProps<"button">, "className" | "aria-label">) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-md text-admin-muted",
        "transition-colors duration-200 outline-none",
        "hover:bg-admin-hover hover:text-admin-fg",
        "focus-visible:ring-2 focus-visible:ring-champagne",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </button>
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
        // A hairline and a flat ground — no radius, no shadow, no raised
        // surface. Eight rounded, shadowed cards on one screen is what made
        // the portal read as a field of rectangles rather than a document.
        "overflow-hidden border border-admin-line bg-admin-panel",
        className
      )}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-admin-line px-5 py-3.5">
      <div className="min-w-0">
        <h2 className="text-[0.875rem] font-semibold text-admin-fg">{title}</h2>
        {description && (
          <p className="mt-0.5 truncate text-[0.75rem] text-admin-faint">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------- stats */

type StatTone = "neutral" | "positive" | "warning" | "critical";

/**
 * A headline figure.
 *
 * The icon is not ornament: eight identical cards in two rows are a wall of
 * numbers, and the glyph is what lets an operator find "out of stock" without
 * reading four labels first. It is tinted by tone and kept small, so it marks
 * the card without competing with the figure.
 *
 * `href` makes the whole card a link where there is somewhere to go. A number
 * that prompts an action should take you to the action.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon: Icon,
  href,
}: {
  label: string;
  /**
   * A node, not a string — money figures render through `<Money>` so they
   * follow the store's configured currency.
   */
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: StatTone;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  href?: string;
}) {
  const figureTone: Record<StatTone, string> = {
    neutral: "text-admin-fg",
    positive: "text-success",
    warning: "text-champagne-dark",
    critical: "text-destructive",
  };

  const body = (
    <>
      <p className="flex items-center gap-2 text-[0.6875rem] font-medium uppercase tracking-[0.16em] text-admin-faint">
        {Icon && <Icon className="size-3.5" strokeWidth={1.6} />}
        {label}
      </p>

      {/* Light weight, large size. A figure carries by scale, not by boldness —
          a wall of semibold numbers is a wall. */}
      <p
        className={cn(
          "admin-figure mt-3 text-[2rem] font-light leading-none tracking-tight",
          figureTone[tone]
        )}
      >
        {value}
      </p>

      {hint && (
        <p className="mt-2 text-[0.75rem] leading-snug text-admin-faint">{hint}</p>
      )}
    </>
  );

  const shell =
    "block px-5 py-6 transition-colors duration-200 outline-none";

  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          shell,
          "hover:bg-admin-hover focus-visible:bg-admin-hover"
        )}
      >
        {body}
      </Link>
    );
  }

  return <div className={shell}>{body}</div>;
}

/**
 * A row of figures, divided by hairlines rather than boxed individually.
 *
 * The previous arrangement gave each stat its own bordered, shadowed card, so
 * four metrics produced four rectangles floating on a fifth. One bounding rule
 * with dividers inside it says the same thing and reads as a single object.
 */
export function StatRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid divide-y divide-admin-line border border-admin-line bg-admin-panel sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-4">
      {React.Children.map(children, (child, index) => (
        <div
          className={cn(
            index > 0 && "sm:border-l sm:border-admin-line",
            // The second item in a 2-up needs its own top rule back when the
            // grid wraps to two rows.
            index > 1 && "sm:border-t sm:border-admin-line xl:border-t-0"
          )}
        >
          {child}
        </div>
      ))}
    </div>
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
        "inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 text-[0.6875rem] font-semibold capitalize",
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
