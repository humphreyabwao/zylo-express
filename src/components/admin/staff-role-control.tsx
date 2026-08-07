"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { setUserRole } from "@/app/actions/admin/staff";
import { ROLE_LABEL } from "@/lib/admin/status";
import type { UserRoleDb } from "@/lib/supabase/types";

/**
 * Inline role control.
 *
 * Optimistic on purpose — the select should feel immediate — but it reverts on
 * failure rather than leaving the row showing a role the database refused. The
 * server is the authority; this is a hint about what the server is likely to
 * say.
 */

/**
 * Superadmin is deliberately absent.
 *
 * It is the tier that grants every other tier, so handing it out from a row
 * dropdown makes it one mis-click from an account that cannot be reined back
 * in by anyone but itself. It is set in SQL — see migration 17.
 */
const ROLES: UserRoleDb[] = ["admin", "staff", "customer"];

export function StaffRoleControl({
  userId,
  role,
  disabled,
  disabledReason,
}: {
  userId: string;
  role: UserRoleDb;
  disabled?: boolean;
  disabledReason?: string;
}) {
  /**
   * `useOptimistic` rather than `useState` plus an effect to resync.
   *
   * It shows `next` immediately, then falls back to whatever `role` the server
   * sends once the transition settles. That covers both outcomes for free: a
   * successful change arrives as new server data via `revalidatePath`, and a
   * rejected one simply reverts, with no manual bookkeeping of the previous
   * value and no effect syncing a prop into state.
   */
  const [current, setOptimistic] = React.useOptimistic(role);
  const [pending, startTransition] = React.useTransition();

  const onChange = (next: UserRoleDb) => {
    startTransition(async () => {
      // Must be inside the transition: an optimistic update applied outside one
      // has nothing to revert against.
      setOptimistic(next);

      const result = await setUserRole(userId, next);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  };

  if (disabled) {
    return (
      <span
        title={disabledReason}
        className="inline-flex h-8 cursor-not-allowed items-center rounded-md border border-admin-line px-2.5 text-[0.75rem] font-medium text-admin-faint"
      >
        {ROLE_LABEL[current]}
      </span>
    );
  }

  return (
    <span className="relative inline-flex items-center">
      <select
        value={current}
        disabled={pending}
        onChange={(event) => onChange(event.target.value as UserRoleDb)}
        aria-label="Role"
        className={cn(
          "h-8 rounded-md border border-admin-line bg-transparent pl-2.5 pr-7 text-[0.75rem] font-medium text-admin-fg outline-none transition-colors duration-200 focus:border-champagne",
          "[&>option]:bg-admin-panel [&>option]:text-admin-fg",
          pending && "opacity-60"
        )}
      >
        {ROLES.map((value) => (
          <option key={value} value={value}>
            {ROLE_LABEL[value]}
          </option>
        ))}
      </select>

      {pending && (
        <Loader2
          className="pointer-events-none absolute right-2 size-3.5 animate-spin text-admin-faint"
          strokeWidth={2}
        />
      )}
    </span>
  );
}
