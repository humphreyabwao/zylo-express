"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { Product } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ProductCard } from "@/components/commerce/product-card";

interface ProductRailProps {
  products: Product[];
  className?: string;
  /** Hides the arrow controls when the rail is short enough not to need them. */
  showControls?: boolean;
}

/**
 * A snap-scrolling rail. Native overflow does the work — no carousel library —
 * so it degrades to a plain horizontal scroller without JS.
 */
export function ProductRail({
  products,
  className,
  showControls = true,
}: ProductRailProps) {
  const trackRef = React.useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = React.useState(true);
  const [atEnd, setAtEnd] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  const sync = React.useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const { scrollLeft, scrollWidth, clientWidth } = track;
    const travel = scrollWidth - clientWidth;

    setAtStart(scrollLeft <= 8);
    setAtEnd(scrollLeft + clientWidth >= scrollWidth - 8);
    setProgress(travel > 0 ? Math.min(1, scrollLeft / travel) : 1);
  }, []);

  React.useEffect(() => {
    sync();
    const track = trackRef.current;
    if (!track) return;

    track.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    return () => {
      track.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
    };
  }, [sync]);

  const nudge = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;

    // Measure a real card rather than guessing from the track width — card
    // width is a different vw fraction at every breakpoint, so a fixed
    // percentage moves less than one card on mobile and more on desktop.
    const first = track.firstElementChild as HTMLElement | null;
    const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
    const step = first ? first.offsetWidth + gap : track.clientWidth * 0.8;

    track.scrollBy({ left: step * direction, behavior: "smooth" });
  };

  return (
    <div className={cn("relative", className)}>
      <ul
        ref={trackRef}
        className="no-scrollbar flex snap-x snap-mandatory gap-6 overflow-x-auto pb-2 lg:gap-8"
      >
        {products.map((product, index) => (
          <li
            key={product.id}
            className="w-[72vw] shrink-0 snap-start sm:w-[42vw] lg:w-[26vw] xl:w-[22vw]"
          >
            <ProductCard product={product} layout="rail" priority={index < 2} />
          </li>
        ))}
      </ul>

      {showControls && products.length > 2 && (
        <div className="mt-6 flex items-center gap-3 lg:mt-8">
          <RailButton
            direction="left"
            onClick={() => nudge(-1)}
            disabled={atStart}
          />
          <RailButton
            direction="right"
            onClick={() => nudge(1)}
            disabled={atEnd}
          />

          {/* Progress rule — tells you how much of the rail is left. */}
          <span
            className="ml-2 h-px flex-1 bg-hairline sm:max-w-40"
            aria-hidden
          >
            <span
              className="block h-px origin-left bg-foreground transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ transform: `scaleX(${progress})` }}
            />
          </span>
        </div>
      )}
    </div>
  );
}

function RailButton({
  direction,
  onClick,
  disabled,
}: {
  direction: "left" | "right";
  onClick: () => void;
  disabled: boolean;
}) {
  const Icon = direction === "left" ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "left" ? "Previous products" : "Next products"}
      className={cn(
        "grid size-10 shrink-0 place-items-center border border-border-strong lg:size-11",
        "transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]",
        "hover:border-primary hover:bg-primary hover:text-primary-foreground",
        "disabled:pointer-events-none disabled:opacity-25"
      )}
    >
      <Icon className="size-4" strokeWidth={1.25} />
    </button>
  );
}
