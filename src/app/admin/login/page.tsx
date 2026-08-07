import type { Metadata } from "next";
import Image from "next/image";

import { AdminLoginForm } from "@/components/admin/login-form";

/**
 * Portal sign-in.
 *
 * Outside the `(portal)` route group, and therefore outside the layout that
 * calls `requireAdmin()`. Inside it, an unauthenticated visitor redirected here
 * by the guard would meet the guard again on arrival — a redirect loop.
 *
 * ## Why this uses the storefront's language, not the portal's
 *
 * Everything behind the door is a workspace: Montserrat, rounded controls,
 * dense tables. That is right for an operator with forty products to price and
 * wrong for the door itself, which is the one screen in the portal that is
 * purely the house presenting itself. So this page borrows the storefront's
 * vocabulary — Cormorant display, hairline rules, square edges, the long
 * easing — and the workspace begins on the other side of the sign-in.
 *
 * No copy explaining what the portal is, and no link back to the storefront.
 * Whoever reaches this page either has credentials or has no business here.
 */
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1.1fr_1fr]">
      {/* Plate. Hidden below lg — a 40vh letterbox above a form is decoration
          that costs a phone its first screen. */}
      <div className="relative hidden overflow-hidden bg-obsidian lg:block">
        <Image
          src="/media/campaign/feature-tall.jpg"
          alt=""
          fill
          priority
          sizes="55vw"
          className="object-cover opacity-70"
        />
        {/* Weighted to the foot so the wordmark keeps its contrast wherever the
            photograph happens to be light. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/25 to-obsidian/40"
        />

        <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
          <span className="flex items-center gap-3.5">
            <span className="grid size-9 place-items-center bg-champagne font-sans text-sm font-bold text-obsidian">
              Z
            </span>
            <span className="font-display text-xl font-light tracking-tight text-porcelain">
              ZYLO
            </span>
          </span>

          <span className="eyebrow-sm text-porcelain/40">Staff access</span>
        </div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center px-6 py-16 sm:px-12">
        <div className="w-full max-w-sm">
          {/* The plate is hidden on small screens, so the mark comes here. */}
          <span className="mb-14 flex items-center gap-3.5 lg:hidden">
            <span className="grid size-9 place-items-center bg-champagne font-sans text-sm font-bold text-obsidian">
              Z
            </span>
            <span className="font-display text-xl font-light tracking-tight">
              ZYLO
            </span>
          </span>

          <p className="eyebrow-sm text-champagne-dark">ZYLO Portal</p>
          <h1 className="mt-5 font-display text-4xl font-light leading-[1.05]">
            Sign in
          </h1>

          <div className="mt-12">
            <AdminLoginForm />
          </div>
        </div>
      </div>
    </div>
  );
}
