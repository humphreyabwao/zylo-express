import Link from "next/link";

import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  /** Renders just the monogram — used in the compact sticky header. */
  compact?: boolean;
  href?: string | null;
  label?: string;
}

export function Logo({
  className,
  compact = false,
  href = "/",
  label = "ZYLO — home",
}: LogoProps) {
  const mark = compact ? (
    <span className="font-display text-2xl leading-none">Z</span>
  ) : (
    <span
      className="font-sans text-[1.4rem] font-light uppercase leading-none"
      style={{ letterSpacing: "0.42em", paddingLeft: "0.42em" }}
    >
      Zylo
    </span>
  );

  const content = (
    <span
      className={cn(
        "inline-flex select-none items-center text-foreground",
        className
      )}
    >
      {mark}
    </span>
  );

  if (!href) return content;

  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex items-center transition-opacity duration-500 hover:opacity-60"
    >
      {content}
    </Link>
  );
}

/** The engraved monogram used as a watermark on quiet sections. */
export function Monogram({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden
      className={cn("size-full", className)}
    >
      <path
        d="M28 28 H72 L28 72 H72"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="square"
      />
      <circle
        cx="50"
        cy="50"
        r="44"
        stroke="currentColor"
        strokeWidth="0.75"
        opacity="0.4"
      />
    </svg>
  );
}
