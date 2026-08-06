import { cn } from "@/lib/utils";

interface RatingStarsProps {
  rating: number;
  count?: number;
  className?: string;
  size?: number;
  showValue?: boolean;
}

/**
 * Hairline stars rather than filled glyphs — the partial star is drawn with a
 * clipped overlay so half-values read accurately.
 */
export function RatingStars({
  rating,
  count,
  className,
  size = 12,
  showValue = false,
}: RatingStarsProps) {
  const clamped = Math.max(0, Math.min(5, rating));

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span
        className="relative inline-flex"
        role="img"
        aria-label={`Rated ${clamped.toFixed(1)} out of 5`}
      >
        <Row size={size} className="text-border-strong" />
        <span
          className="absolute inset-0 overflow-hidden"
          style={{ width: `${(clamped / 5) * 100}%` }}
          aria-hidden
        >
          <Row size={size} className="text-champagne-dark" filled />
        </span>
      </span>

      {showValue && (
        <span className="text-xs font-light tabular-nums text-muted-foreground">
          {clamped.toFixed(1)}
        </span>
      )}

      {typeof count === "number" && (
        <span className="eyebrow-sm text-muted-foreground">
          {count} {count === 1 ? "review" : "reviews"}
        </span>
      )}
    </span>
  );
}

function Row({
  size,
  className,
  filled = false,
}: {
  size: number;
  className?: string;
  filled?: boolean;
}) {
  return (
    <span className={cn("flex shrink-0 gap-1", className)} aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg
          key={i}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill={filled ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={filled ? 0 : 1.25}
          className="shrink-0"
        >
          <path d="M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.5-5.9-3.2-5.9 3.2 1.2-6.5L2.5 9.5l6.6-.9z" />
        </svg>
      ))}
    </span>
  );
}
