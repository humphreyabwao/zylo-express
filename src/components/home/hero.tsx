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
  eyebrow: string;
  title: React.ReactNode;
  body: string;
  primary: { href: string; label: string };
  secondary: { href: string; label: string };
}

const SLIDES: Slide[] = [
  {
    image: "/media/campaign/hero-primary.jpg",
    imageAlt: "The winter campaign",
    eyebrow: "Winter Collection — Chapter One",
    title: (
      <>
        Made slowly,
        <br />
        <span className="italic">so it is kept</span>
      </>
    ),
    body: "Nine ateliers. Four hundred hands. Objects finished at a pace the machine cannot reach — and worth the wait for exactly that reason.",
    primary: { href: "/collections/winter-solstice", label: "Discover the collection" },
    secondary: { href: "/collections/new-in", label: "New arrivals" },
  },
  {
    image: "/media/campaign/hero-secondary.jpg",
    imageAlt: "Silk and savoir-faire",
    eyebrow: "Savoir-Faire",
    title: (
      <>
        Twenty-two screens,
        <br />
        <span className="italic">one colour at a time</span>
      </>
    ),
    body: "Each colour in the design needs its own screen, and each screen must dry before the next is laid. Some things cannot be hurried.",
    primary: { href: "/collections/savoir-faire", label: "The made-to-order edit" },
    secondary: { href: "/journal", label: "Read the journal" },
  },
  {
    image: "/media/campaign/hero-tertiary.jpg",
    imageAlt: "Outerwear for the long dark",
    eyebrow: "Winter Solstice",
    title: (
      <>
        A coat with no lining,
        <br />
        <span className="italic">because there is no wrong side</span>
      </>
    ),
    body: "Double-faced cashmere, split by hand along the seam allowance and closed invisibly. Thirty hours of hand-sewing per coat.",
    primary: { href: "/category/ready-to-wear", label: "Shop outerwear" },
    secondary: { href: "/journal/a-coat-for-a-decade", label: "How it is made" },
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
          {/* Copy — re-keyed per slide so the entrance animation replays. */}
          <div key={index} className="max-w-2xl">
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

            <div
              className="mt-9 flex flex-wrap items-center gap-3 opacity-0 sm:gap-4"
              style={{ animation: "reveal-up 1s var(--ease-luxe) 0.42s forwards" }}
            >
              <Button asChild variant="inverse" size="lg">
                <Link href={SLIDES[index].primary.href}>
                  {SLIDES[index].primary.label}
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-porcelain/40 text-porcelain hover:border-porcelain hover:bg-porcelain hover:text-obsidian"
              >
                <Link href={SLIDES[index].secondary.href}>
                  {SLIDES[index].secondary.label}
                </Link>
              </Button>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-6 lg:pb-2">
            <div className="flex items-center gap-3">
              <SlideButton
                direction="prev"
                onClick={() => go(index - 1)}
              />
              <SlideButton
                direction="next"
                onClick={() => go(index + 1)}
              />
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
