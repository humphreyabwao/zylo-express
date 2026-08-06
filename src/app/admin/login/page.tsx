import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";

import { montserrat } from "@/lib/fonts";
import { isPreviewMode } from "@/lib/admin/guard";
import { AdminLoginForm } from "@/components/admin/login-form";

/**
 * Portal sign-in.
 *
 * Deliberately outside the `(portal)` route group, and therefore outside the
 * layout that calls `requireAdmin()`. Were it inside, an unauthenticated
 * visitor would be redirected here by the guard, and the guard would run again
 * on arrival — a redirect loop that browsers report as an unhelpfully generic
 * error.
 *
 * The form is built and validated but not yet wired to Supabase: submitting it
 * explains what is missing rather than pretending to sign you in. Linking it is
 * a matter of calling the existing `signIn` action and dropping ADMIN_PREVIEW —
 * see the comment in the form.
 */
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return (
    <div
      className={`${montserrat.variable} flex min-h-svh flex-col bg-admin-canvas font-admin text-admin-fg`}
    >
      <header className="flex h-16 shrink-0 items-center justify-between px-6">
        <Link href="/admin" className="flex items-center gap-3">
          <span className="grid size-8 place-items-center bg-champagne text-[0.8125rem] font-bold text-obsidian">
            Z
          </span>
          <span className="text-[0.9375rem] font-semibold tracking-tight">
            ZYLO
            <span className="ml-1.5 font-light text-admin-muted">Portal</span>
          </span>
        </Link>

        <Link
          href="/"
          className="flex items-center gap-1.5 text-[0.8125rem] font-medium text-admin-faint transition-colors duration-200 hover:text-admin-fg"
        >
          <ArrowLeft className="size-3.5" strokeWidth={2} />
          Storefront
        </Link>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <span className="mx-auto mb-5 grid size-11 place-items-center rounded-md border border-admin-line bg-admin-panel">
              <Lock className="size-4.5 text-admin-muted" strokeWidth={1.7} />
            </span>

            <h1 className="text-[1.375rem] font-semibold tracking-tight">
              Staff sign in
            </h1>
            <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-admin-faint">
              This portal is restricted to ZYLO staff. Customer accounts sign in
              on the storefront.
            </p>
          </div>

          <AdminLoginForm />

          {isPreviewMode() && (
            <p className="mt-6 border border-champagne/40 bg-champagne/10 px-4 py-3 text-center text-[0.75rem] leading-relaxed text-admin-muted">
              Preview mode is active, so{" "}
              <Link href="/admin" className="font-semibold underline">
                the portal
              </Link>{" "}
              is reachable without signing in. This page is not yet linked to the
              guard.
            </p>
          )}
        </div>
      </main>

      <footer className="shrink-0 px-6 py-6 text-center text-[0.6875rem] text-admin-faint">
        Protected by rate limiting and row-level security. All access is
        attributable.
      </footer>
    </div>
  );
}
