"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Slide {
  image: string;
  imageAlt: string;
  /**
   * A one-line description of the photograph itself — what is being made, and
   * where. Optional: a slide with nothing worth captioning simply omits it.
   */
  caption?: string;
  eyebrow: string;
  title: React.ReactNode;
  body: string;
  /** The slide's own editorial link. The commerce CTA is constant — see below. */
  link: { href: string; label: string };
}

/**
 * The one control that never changes.
 *
 * Campaign copy rotates; the way into the shop does not. Keeping it in a fixed
 * position with fixed wording means a returning visitor never has to re-read
 * the hero to find it, and it cannot scroll away mid-slide.
 */
const SHOP_CTA = { href: "/shop", label: "Shop Now" } as const;

/**
 * Campaign copy dates itself; craft does not. Every line here is written to
 * still read true in five years — no seasons, no drop numbers, nothing that
 * has to be rewritten when the collection turns over.
 */
const SLIDES: Slide[] = [
  {
    image: "/media/campaign/hero-primary.jpg",
    imageAlt: "An artisan finishing a piece by hand in the atelier",
    caption: "Atelier No. 4, Florence — the last hour of a piece that took nine days",
    eyebrow: "The House",
    title: (
      <>
        Made slowly,
        <br />
        <span className="italic">so it is kept</span>
      </>
    ),
    body: "Nine ateliers. Four hundred hands. Objects finished at a pace the machine cannot reach — and worth the wait for exactly that reason.",
    link: { href: "/collections/the-atelier-series", label: "Discover the collection" },
  },
  {
    image: "/media/campaign/hero-secondary.jpg",
    imageAlt: "Silk twill being hand screen-printed, one colour at a time",
    caption: "Silk twill, printed by hand — twenty-two screens, twenty-two days",
    eyebrow: "Savoir-Faire",
    title: (
      <>
        Twenty-two screens,
        <br />
        <span className="italic">one colour at a time</span>
      </>
    ),
    body: "Each colour in the design needs its own screen, and each screen must dry before the next is laid. Some things cannot be hurried.",
    link: { href: "/journal", label: "Read the journal" },
  },
  {
    image: "/media/campaign/hero-tertiary.jpg",
    imageAlt: "A double-faced cashmere coat, closed by hand along the seam",
    caption: "Double-faced cashmere from a mill outside Biella, weaving since 1663",
    eyebrow: "The Atelier",
    title: (
      <>
        A coat with no lining,
        <br />
        <span className="italic">because there is no wrong side</span>
      </>
    ),
    body: "Double-faced cashmere, split by hand along the seam allowance and closed invisibly. Thirty hours of hand-sewing per coat.",
    link: { href: "/journal/a-coat-for-a-decade", label: "How it is made" },
  },
];

const INTERVAL_MS = 6500;

export function Hero() {
  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  const go = React.useCallback(
    (next: number) => setIndex((next + SLIDES.length) % SLIDES.length),
    []
  );

  React.useEffect(() => {
    if (paused) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const timer = setInterval(() => go(index + 1), INTERVAL_MS);
    return () => clearInterval(timer);
  }, [index, paused, go]);

  return (
    <section
      // Pulled under the transparent header so the campaign runs full-bleed.
      className="relative -mt-16 flex h-[82svh] min-h-[26rem] items-end overflow-hidden lg:-mt-[4.5rem] lg:h-[86svh]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Campaign"
    >
      {SLIDES.map((slide, i) => (
        <div
          key={slide.image}
          className={cn(
            "absolute inset-0 transition-opacity duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]",
            i === index ? "opacity-100" : "pointer-events-none opacity-0"
          )}
          aria-hidden={i !== index}
        >
          <Image
            src={slide.image}
            alt={slide.imageAlt}
            fill
            priority={i === 0}
            sizes="100vw"
            // A slow drift keeps the still image from reading as static.
            className={cn(
              "object-cover transition-transform duration-[9000ms] ease-linear",
              i === index ? "scale-105" : "scale-100"
            )}
          />
        </div>
      ))}

      <div className="absolute inset-0 scrim-full" aria-hidden />

      <div className="container-shell relative w-full pb-16 lg:pb-20">
        <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            {/* Campaign copy — re-keyed per slide so the entrance replays. */}
            <div key={index}>
              <p
                className="eyebrow text-champagne opacity-0"
                style={{ animation: "reveal-up 0.9s var(--ease-luxe) 0.05s forwards" }}
              >
                {SLIDES[index].eyebrow}
              </p>

              <h1
                className="mt-5 font-display text-[clamp(2.5rem,6.5vw,5.5rem)] font-light leading-[0.98] tracking-[-0.015em] text-porcelain opacity-0"
                style={{ animation: "reveal-up 1s var(--ease-luxe) 0.18s forwards" }}
              >
                {SLIDES[index].title}
              </h1>

              <p
                className="mt-6 max-w-md text-sm font-light leading-relaxed text-porcelain/75 opacity-0 lg:text-base"
                style={{ animation: "reveal-up 1s var(--ease-luxe) 0.3s forwards" }}
              >
                {SLIDES[index].body}
              </p>
            </div>

            {/* Outside the keyed block: Shop Now must not remount and
                re-animate every time the campaign rotates. */}
            <div className="mt-9 flex flex-wrap items-center gap-3 sm:gap-4">
              <Button asChild variant="inverse" size="lg">
                <Link href={SHOP_CTA.href}>{SHOP_CTA.label}</Link>
              </Button>
              <Button
                asChild
                key={index}
                size="lg"
                variant="outline"
                className="border-porcelain/40 text-porcelain opacity-0 hover:border-porcelain hover:bg-porcelain hover:text-obsidian"
                style={{ animation: "reveal-up 1s var(--ease-luxe) 0.42s forwards" }}
              >
                <Link href={SLIDES[index].link.href}>
                  {SLIDES[index].link.label}
                </Link>
              </Button>
            </div>
          </div>

          {/* Image caption + controls */}
          <div className="flex flex-col gap-5 lg:items-end lg:pb-2">
            {SLIDES[index].caption && (
              <p
                key={index}
                className="flex items-center gap-3 text-[0.6875rem] font-light leading-snug tracking-[0.06em] text-porcelain/55 opacity-0 lg:justify-end lg:text-right"
                style={{ animation: "reveal-up 1s var(--ease-luxe) 0.52s forwards" }}
              >
                <span className="h-px w-6 shrink-0 bg-champagne/70" aria-hidden />
                {SLIDES[index].caption}
              </p>
            )}

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <SlideButton direction="prev" onClick={() => go(index - 1)} />
                <SlideButton direction="next" onClick={() => go(index + 1)} />
              </div>

              <ol className="flex items-center gap-2.5">
                {SLIDES.map((slide, i) => (
                  <li key={slide.image}>
                    <button
                      type="button"
                      onClick={() => go(i)}
                      aria-label={`Go to slide ${i + 1} of ${SLIDES.length}`}
                      aria-current={i === index}
                      className="group/dot grid h-6 w-10 place-items-center"
                    >
                      <span
                        className={cn(
                          "block h-px w-full transition-colors duration-500",
                          i === index
                            ? "bg-porcelain"
                            : "bg-porcelain/35 group-hover/dot:bg-porcelain/70"
                        )}
                      />
                    </button>
                  </li>
                ))}
              </ol>

              <span className="hidden font-display text-sm font-light tabular-nums text-porcelain/60 sm:inline">
                {String(index + 1).padStart(2, "0")} /{" "}
                {String(SLIDES.length).padStart(2, "0")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SlideButton({
  direction,
  onClick,
}: {
  direction: "prev" | "next";
  onClick: () => void;
}) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === "prev" ? "Previous slide" : "Next slide"}
      className="grid size-11 place-items-center border border-porcelain/35 text-porcelain transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-porcelain hover:bg-porcelain hover:text-obsidian"
    >
      <Icon className="size-4" strokeWidth={1.25} />
    </button>
  );
}
