"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

/**
 * Portal sign-in form.
 *
 * Complete except for its final call. On submit it validates, disables itself,
 * and reports that the flow is not connected — rather than silently doing
 * nothing, which is indistinguishable from a broken build.
 *
 * To link it:
 *   1. Import `signIn` from `@/app/actions/auth` and call it here.
 *   2. On success, redirect to `/admin`. The layout's `requireAdmin()` will
 *      then either admit the operator or send them back with an error, so no
 *      role check is needed in this component.
 *   3. Delete `ADMIN_PREVIEW` from `.env.local`.
 *
 * The storefront's sign-in action already rate-limits by client identifier, so
 * linking it brings brute-force protection with it — nothing extra to build.
 */
export function AdminLoginForm() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice(null);
    setPending(true);

    // Stands in for the network round trip so the disabled state is visible
    // rather than flashing past.
    await new Promise((resolve) => setTimeout(resolve, 400));

    setPending(false);
    setNotice(
      "Sign-in is not connected yet. The dashboard is being built first, and this form is deliberately inert until then."
    );
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
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
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@zylo.com"
          className="h-11 w-full rounded-md border border-admin-line bg-admin-panel px-3.5 text-[0.875rem] text-admin-fg outline-none transition-colors duration-200 placeholder:text-admin-faint focus:border-champagne"
        />
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label
            htmlFor="admin-password"
            className="text-[0.75rem] font-semibold text-admin-muted"
          >
            Password
          </label>
          <span className="text-[0.75rem] text-admin-faint">Forgot?</span>
        </div>
        <input
          id="admin-password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-11 w-full rounded-md border border-admin-line bg-admin-panel px-3.5 text-[0.875rem] text-admin-fg outline-none transition-colors duration-200 focus:border-champagne"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-admin-fg text-[0.875rem] font-semibold text-admin-panel transition-opacity duration-200 hover:opacity-90 disabled:opacity-60"
      >
        {pending && <Loader2 className="size-4 animate-spin" strokeWidth={2} />}
        {pending ? "Checking…" : "Sign in"}
      </button>

      {notice && (
        <p
          role="status"
          className="rounded-lg border border-admin-line bg-admin-panel px-3.5 py-3 text-[0.75rem] leading-relaxed text-admin-muted"
        >
          {notice}
        </p>
      )}
    </form>
  );
}
