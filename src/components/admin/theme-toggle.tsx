"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

/**
 * Light/dark switch for the portal.
 *
 * Same mechanism as the storefront's — see `src/components/layout/theme-toggle`
 * — deliberately, so the two halves of the product behave identically.
 *
 * This replaced a three-segment light/system/dark radiogroup. Two problems with
 * that control, one cosmetic and one real:
 *
 *   - It was a bordered pill of three tiny targets in a toolbar of single
 *     icons, which made the busiest corner of the portal look unresolved.
 *   - `enableSystem` is `false` on the provider (`src/components/providers`),
 *     so the middle segment set a theme next-themes was not tracking. It
 *     appeared to work and did nothing.
 *
 * Which state we are in is expressed in CSS via the `dark:` variant rather than
 * in React state. `next-themes` writes `class="dark"` onto <html> from a
 * blocking inline script, so the correct icon is painted on the first frame —
 * no mount gate, no hydration mismatch, no flash of the wrong glyph for an
 * operator whose stored preference is dark. Reading `resolvedTheme` to choose
 * the icon would do all three wrong: it is `undefined` until after hydration.
 */
export function AdminThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  // Only runs on click, by which point `resolvedTheme` is populated. The
  // fallback keeps the first click sane if it somehow is not.
  const toggle = () => setTheme(resolvedTheme === "dark" ? "light" : "dark");

  return (
    <button
      type="button"
      onClick={toggle}
      className="grid size-8 shrink-0 place-items-center rounded-md text-admin-muted transition-colors duration-200 outline-none hover:bg-admin-hover hover:text-admin-fg focus-visible:ring-2 focus-visible:ring-champagne"
    >
      <Moon className="size-4 dark:hidden" strokeWidth={1.7} aria-hidden />
      <Sun className="hidden size-4 dark:block" strokeWidth={1.7} aria-hidden />

      {/* `hidden` keeps the inactive label out of the accessibility tree, so
          the button has exactly one name rather than two contradictory ones. */}
      <span className="sr-only dark:hidden">Switch to dark theme</span>
      <span className="sr-only hidden dark:inline">Switch to light theme</span>
    </button>
  );
}
