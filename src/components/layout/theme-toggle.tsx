"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

/**
 * Light/dark switch.
 *
 * Which state we are in is expressed in CSS rather than in React state, via
 * the `dark:` variant. `next-themes` writes `class="dark"` onto <html> from a
 * blocking inline script, so the right icon and label are correct on the very
 * first paint — no mount gate, no hydration mismatch, and no flash of the
 * wrong icon for a visitor whose stored preference is dark.
 *
 * Reading `resolvedTheme` to pick the icon instead would do all three wrong:
 * it is `undefined` until after hydration.
 *
 * `enableSystem` is off on the provider, so this is a plain two-way switch
 * rather than a light/dark/system cycle.
 */
export function ThemeToggle({
  variant = "icon",
  className,
}: {
  /** `icon` for the header utilities row, `row` for the mobile drawer list. */
  variant?: "icon" | "row";
  className?: string;
}) {
  const { resolvedTheme, setTheme } = useTheme();

  // Only runs on click, by which point `resolvedTheme` is populated. The
  // fallback keeps the first click sane if it somehow is not.
  const toggle = () => setTheme(resolvedTheme === "dark" ? "light" : "dark");

  if (variant === "row") {
    return (
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "flex w-full items-center gap-3 eyebrow-sm text-foreground transition-opacity duration-400 hover:opacity-60",
          className
        )}
      >
        <Moon className="size-4 dark:hidden" strokeWidth={1.25} aria-hidden />
        <Sun
          className="hidden size-4 dark:block"
          strokeWidth={1.25}
          aria-hidden
        />

        {/* The visible words are part of the accessible name rather than
            hidden from it: WCAG 2.5.3 wants the name to contain the label a
            speech-control user would read aloud. Prefixing "Switch to" makes
            the name a full instruction without repeating the label. */}
        <span className="sr-only">Switch to </span>
        <span className="dark:hidden">Dark Mode</span>
        <span className="hidden dark:inline">Light Mode</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={cn(
        "grid size-10 place-items-center transition-opacity duration-400 hover:opacity-60",
        className
      )}
    >
      <Moon
        className="size-[1.05rem] dark:hidden"
        strokeWidth={1.25}
        aria-hidden
      />
      <Sun
        className="hidden size-[1.05rem] dark:block"
        strokeWidth={1.25}
        aria-hidden
      />

      {/* No visible text to match here, so the name can be the whole
          instruction. `hidden` keeps the inactive one out of the
          accessibility tree, leaving the button with exactly one name. */}
      <span className="sr-only dark:hidden">Switch to dark theme</span>
      <span className="sr-only hidden dark:inline">Switch to light theme</span>
    </button>
  );
}
