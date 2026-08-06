"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  adminSignIn,
  type AdminAuthState,
} from "@/app/actions/admin/auth";

/**
 * Portal sign-in form.
 *
 * Posts to `adminSignIn`, which authenticates against Supabase, checks the
 * account is staff, and redirects to `/admin` — or refuses with a reason.
 *
 * A plain `<form action>` rather than an onSubmit handler: the action runs
 * server-side and ends in a `redirect`, which React's form integration follows
 * for us. It also means the form works before hydration, which for a sign-in
 * page on a slow connection is worth having.
 */

const initialState: AdminAuthState = {};

const inputClass = (invalid?: boolean) =>
  cn(
    "h-11 w-full rounded-md border bg-admin-panel px-3.5 text-[0.875rem] text-admin-fg",
    "outline-none transition-colors duration-200 placeholder:text-admin-faint",
    invalid
      ? "border-destructive focus:border-destructive"
      : "border-admin-line focus:border-champagne"
  );

export function AdminLoginForm() {
  const [state, formAction] = useActionState(adminSignIn, initialState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div>
        <label
          htmlFor="admin-email"
          className="mb-1.5 block text-[0.75rem] font-semibold text-admin-muted"
        >
          Email
        </label>
        <input
          id="admin-email"
          name="email"
          type="email"
          required
          autoComplete="username"
          placeholder="you@zylo.com"
          aria-invalid={Boolean(state.fieldErrors?.email)}
          className={inputClass(Boolean(state.fieldErrors?.email))}
        />
        {state.fieldErrors?.email && (
          <p className="mt-1.5 text-[0.75rem] font-medium text-destructive">
            {state.fieldErrors.email}
          </p>
        )}
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label
            htmlFor="admin-password"
            className="text-[0.75rem] font-semibold text-admin-muted"
          >
            Password
          </label>
        </div>
        <input
          id="admin-password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          aria-invalid={Boolean(state.fieldErrors?.password)}
          className={inputClass(Boolean(state.fieldErrors?.password))}
        />
        {state.fieldErrors?.password && (
          <p className="mt-1.5 text-[0.75rem] font-medium text-destructive">
            {state.fieldErrors.password}
          </p>
        )}
      </div>

      <SubmitButton />

      {state.error && (
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-[0.75rem] leading-relaxed text-admin-fg"
        >
          <TriangleAlert
            className="mt-px size-3.5 shrink-0 text-destructive"
            strokeWidth={2}
          />
          {state.error}
        </p>
      )}
    </form>
  );
}

/**
 * Split out because `useFormStatus` reports on the nearest parent `<form>`,
 * and only from a component rendered inside it — reading it in the form's own
 * component returns a permanently idle status.
 */
function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-admin-fg text-[0.875rem] font-semibold text-admin-panel transition-opacity duration-200 hover:opacity-90 disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" strokeWidth={2} />}
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}
