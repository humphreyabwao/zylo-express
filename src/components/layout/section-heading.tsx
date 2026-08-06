import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Reveal } from "@/components/motion/reveal";

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  link?: { href: string; label: string };
  align?: "left" | "center" | "between";
  tone?: "default" | "inverse";
  className?: string;
  as?: "h1" | "h2" | "h3";
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  link,
  align = "between",
  tone = "default",
  className,
  as: Tag = "h2",
}: SectionHeadingProps) {
  const inverse = tone === "inverse";

  return (
    <Reveal
      className={cn(
        "flex gap-6",
        align === "center" && "flex-col items-center text-center",
        align === "left" && "flex-col",
        align === "between" &&
          "flex-col md:flex-row md:items-end md:justify-between",
        className
      )}
    >
      <div
        className={cn(
          "space-y-4",
          align === "center" && "max-w-2xl",
          align !== "center" && "max-w-2xl"
        )}
      >
        {eyebrow && (
          <p
            className={cn(
              "eyebrow-sm",
              inverse ? "text-champagne" : "text-champagne-dark"
            )}
          >
            {eyebrow}
          </p>
        )}

        <Tag
          className={cn(
            "font-display text-4xl font-light leading-[1.06] lg:text-5xl",
            inverse ? "text-porcelain" : "text-foreground"
          )}
        >
          {title}
        </Tag>

        {description && (
          <p
            className={cn(
              "max-w-xl text-sm font-light leading-relaxed lg:text-base",
              inverse ? "text-porcelain/65" : "text-muted-foreground"
            )}
          >
            {description}
          </p>
        )}
      </div>

      {link && (
        <Link
          href={link.href}
          className={cn(
            "group/link inline-flex shrink-0 items-center gap-3 eyebrow-sm transition-opacity duration-500 hover:opacity-60",
            inverse ? "text-porcelain" : "text-foreground"
          )}
        >
          {link.label}
          <ArrowRight
            className="size-3.5 transition-transform duration-600 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/link:translate-x-1.5"
            strokeWidth={1.25}
          />
        </Link>
      )}
    </Reveal>
  );
}
