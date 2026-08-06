import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Page } from "@/lib/admin/queries";

/**
 * Pagination.
 *
 * Links rather than buttons, so a page is addressable: an operator can bookmark
 * page 4 of out-of-stock variants, open it in a new tab, and use the browser's
 * own back button. A click handler calling `router.push` would give up all
 * three for nothing.
 *
 * The window is fixed at seven slots so the control never changes width as the
 * operator moves through the range — a row of numbers that reflows on every
 * click is very hard to click accurately.
 */

const WINDOW = 7;

function windowedPages(current: number, total: number): (number | "gap")[] {
  if (total <= WINDOW) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: (number | "gap")[] = [1];
  // Two either side of the current page, clamped so the window stays the same
  // width at both ends of the range rather than collapsing.
  const start = Math.max(2, Math.min(current - 1, total - 4));
  const end = Math.min(total - 1, Math.max(current + 1, 5));

  if (start > 2) pages.push("gap");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("gap");

  pages.push(total);
  return pages;
}

export function Pagination<T>({
  page,
  basePath,
  searchParams = {},
  label = "results",
}: {
  page: Page<T>;
  /** Route the numbers link to, e.g. "/admin/products". */
  basePath: string;
  /** Preserved across page changes so filters survive navigation. */
  searchParams?: Record<string, string | undefined>;
  label?: string;
}) {
  const { page: current, pageCount, total, pageSize } = page;

  const href = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (value && key !== "page") params.set(key, value);
    }
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  const first = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const last = Math.min(current * pageSize, total);

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-admin-line px-5 py-3.5 sm:flex-row">
      <p className="admin-figure text-[0.75rem] text-admin-faint">
        {total === 0 ? (
          `No ${label}`
        ) : (
          <>
            <span className="font-semibold text-admin-muted">
              {first}–{last}
            </span>{" "}
            of <span className="font-semibold text-admin-muted">{total}</span>{" "}
            {label}
          </>
        )}
      </p>

      {pageCount > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-1">
          <PageArrow
            href={href(current - 1)}
            disabled={current <= 1}
            label="Previous page"
          >
            <ChevronLeft className="size-4" strokeWidth={2} />
          </PageArrow>

          {windowedPages(current, pageCount).map((entry, index) =>
            entry === "gap" ? (
              <span
                key={`gap-${index}`}
                className="grid size-8 place-items-center text-[0.75rem] text-admin-faint"
              >
                …
              </span>
            ) : (
              <Link
                key={entry}
                href={href(entry)}
                aria-current={entry === current ? "page" : undefined}
                className={cn(
                  "admin-figure grid size-8 place-items-center rounded-sm border text-[0.75rem] font-semibold transition-colors duration-200",
                  entry === current
                    ? "border-champagne bg-admin-active text-admin-fg"
                    : "border-transparent text-admin-muted hover:border-admin-line hover:text-admin-fg"
                )}
              >
                {entry}
              </Link>
            )
          )}

          <PageArrow
            href={href(current + 1)}
            disabled={current >= pageCount}
            label="Next page"
          >
            <ChevronRight className="size-4" strokeWidth={2} />
          </PageArrow>
        </nav>
      )}
    </div>
  );
}

function PageArrow({
  href,
  disabled,
  label,
  children,
}: {
  href: string;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  const className =
    "grid size-8 place-items-center rounded-sm border border-transparent transition-colors duration-200";

  // A disabled arrow must not be a link at all — an anchor with no href is
  // still focusable and still announced as a link.
  if (disabled) {
    return (
      <span
        aria-disabled
        aria-label={label}
        className={cn(className, "text-admin-faint opacity-40")}
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        className,
        "text-admin-muted hover:border-admin-line hover:text-admin-fg"
      )}
    >
      {children}
    </Link>
  );
}
