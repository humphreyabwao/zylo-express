"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Three-state theme control: light, dark, system.
 *
 * A two-state toggle silently drops "follow the OS", which is the setting most
 * people actually want — and once dropped there is no way back to it without
 * clearing storage. Three explicit segments cost one extra button.
 *
 * Renders a placeholder until mounted. `useTheme` cannot know the resolved
 * theme during SSR, so painting the real state immediately would mean marking
 * whichever segment the server guessed, then correcting it on hydration.
 */

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon },
] as const;

/**
 * Hydration probe.
 *
 * `useSyncExternalStore` with a never-firing subscription returns the server
 * snapshot during SSR and the client one after hydration — which is exactly the
 * "am I mounted" signal, without a `useState` that an effect immediately
 * overwrites.
 */
const NEVER_CHANGES = () => () => {};

function useHydrated() {
  return React.useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false
  );
}

export function AdminThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useHydrated();

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex items-center gap-0.5 rounded-sm border border-admin-line p-0.5"
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = mounted && theme === option.value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            title={option.label}
            onClick={() => setTheme(option.value)}
            className={cn(
              "grid size-7 place-items-center rounded-[2px] transition-colors duration-300",
              active
                ? "bg-admin-active text-admin-fg"
                : "text-admin-faint hover:text-admin-fg"
            )}
          >
            <Icon className="size-3.5" strokeWidth={1.8} />
          </button>
        );
      })}
    </div>
  );
}
