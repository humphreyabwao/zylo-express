"use client";

import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { CurrencySwitcher } from "@/components/commerce/currency-switcher";

const ROTATE_MS = 5200;

export function AnnouncementBar({
  announcements,
}: {
  /** From `site_settings`, resolved server-side. Never empty. */
  announcements: string[];
}) {
  const [index, setIndex] = React.useState(0);
  const [visible, setVisible] = React.useState(true);

  React.useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const cycle = setInterval(() => {
      setVisible(false);
      // Swap the copy at the midpoint of the cross-fade.
      setTimeout(() => {
        setIndex((i) => (i + 1) % announcements.length);
        setVisible(true);
      }, 450);
    }, ROTATE_MS);

    return () => clearInterval(cycle);
  }, [announcements.length]);

  return (
    <div className="relative z-50 border-b border-white/10 bg-obsidian text-porcelain">
      <div className="container-shell flex h-10 items-center justify-between gap-6">
        <Link
          href="/services/appointments"
          className="link-draw hidden eyebrow-sm text-porcelain/70 transition-colors duration-500 hover:text-porcelain md:inline-block"
        >
          Book an appointment
        </Link>

        <p
          aria-live="polite"
          className={cn(
            "flex-1 text-center eyebrow-sm text-porcelain/85 transition-opacity duration-450",
            visible ? "opacity-100" : "opacity-0"
          )}
        >
          {announcements[index]}
        </p>

        <div className="hidden items-center gap-5 md:flex">
          <Link
            href="/help/shipping"
            className="link-draw eyebrow-sm text-porcelain/70 transition-colors duration-500 hover:text-porcelain"
          >
            Shipping
          </Link>
          <CurrencySwitcher tone="inverse" />
        </div>
      </div>
    </div>
  );
}
