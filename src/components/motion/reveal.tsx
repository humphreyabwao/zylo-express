"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

interface RevealProps extends React.ComponentProps<"div"> {
  /** Milliseconds to stagger this element behind its neighbours. */
  delay?: number;
  /** `fade` skips the translate — used where movement would fight the layout. */
  variant?: "rise" | "fade";
  /** Fraction of the element that must be visible before revealing. */
  threshold?: number;
  once?: boolean;
  asChild?: boolean;
}

/**
 * Progressive enhancement: the element renders visible, and the observer arms
 * it only once JS is running. Both the armed and revealed states are written
 * straight to `data-reveal` on the node — no React state, so a scroll never
 * costs a re-render and nothing sets state inside an effect.
 */
export function Reveal({
  className,
  delay = 0,
  variant = "rise",
  threshold = 0.15,
  once = true,
  asChild = false,
  style,
  ...props
}: RevealProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    // Leave the node in its default visible state.
    if (prefersReduced || typeof IntersectionObserver === "undefined") return;

    node.dataset.reveal = "armed";

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          node.dataset.reveal = "in";
          if (once) observer.disconnect();
        } else if (!once) {
          node.dataset.reveal = "armed";
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" }
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      delete node.dataset.reveal;
    };
  }, [once, threshold]);

  const Comp = asChild ? Slot : "div";

  return (
    <Comp
      ref={ref}
      data-reveal-variant={variant}
      className={cn(className)}
      style={{ ...style, "--reveal-delay": `${delay}ms` } as React.CSSProperties}
      {...props}
    />
  );
}
