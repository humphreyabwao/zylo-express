"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { ADMIN_NAV } from "@/lib/admin/nav";
import { DEFAULT_STAFF_MODULES } from "@/lib/admin/permissions";

/**
 * Which modules an account may reach.
 *
 * Grouped exactly as the sidebar is, so the thing being granted looks like the
 * thing that will appear. Grouping alphabetically would be tidier and would
 * make "does this person get the till?" harder to answer at a glance.
 */
export function ModulePicker({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  /** Superadmins hold everything, so the control is shown locked rather than hidden. */
  disabled?: boolean;
}) {
  const toggle = (segment: string) =>
    onChange(
      value.includes(segment)
        ? value.filter((s) => s !== segment)
        : [...value, segment]
    );

  const groups = ADMIN_NAV.map((group) => ({
    ...group,
    modules: group.modules.filter((module) => module.segment !== ""),
  })).filter((group) => group.modules.length > 0);

  const all = groups.flatMap((g) => g.modules.map((m) => m.segment));

  return (
    <div className={cn("space-y-4", disabled && "pointer-events-none opacity-60")}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[0.75rem] font-semibold text-admin-fg">
          Modules
          <span className="ml-2 font-normal text-admin-faint">
            {disabled ? "all" : `${value.length} of ${all.length}`}
          </span>
        </p>

        {!disabled && (
          <div className="flex items-center gap-1 text-[0.6875rem]">
            <PresetButton onClick={() => onChange([...DEFAULT_STAFF_MODULES])}>
              Typical
            </PresetButton>
            <span className="text-admin-faint">·</span>
            <PresetButton onClick={() => onChange([...all])}>All</PresetButton>
            <span className="text-admin-faint">·</span>
            <PresetButton onClick={() => onChange([])}>None</PresetButton>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="mb-1.5 text-[0.625rem] font-medium uppercase tracking-[0.16em] text-admin-faint">
              {group.label}
            </p>

            <div className="flex flex-wrap gap-1.5">
              {group.modules.map((module) => {
                const on = disabled || value.includes(module.segment);

                return (
                  <button
                    key={module.segment}
                    type="button"
                    onClick={() => toggle(module.segment)}
                    aria-pressed={on}
                    title={module.description}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5",
                      "text-[0.75rem] font-medium transition-colors duration-150",
                      on
                        ? "border-admin-fg bg-admin-fg text-admin-panel"
                        : "border-admin-line text-admin-muted hover:bg-admin-hover hover:text-admin-fg"
                    )}
                  >
                    {on && <Check className="size-3" strokeWidth={2.5} />}
                    {module.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[0.6875rem] leading-relaxed text-admin-faint">
        {disabled
          ? "Super administrators reach every module and cannot be restricted."
          : "The overview is always reachable. Everything else is off unless granted."}
      </p>
    </div>
  );
}

function PresetButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-admin-muted underline-offset-2 transition-colors hover:text-admin-fg hover:underline"
    >
      {children}
    </button>
  );
}
