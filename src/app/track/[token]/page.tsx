import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";

import { createAnonymousClient } from "@/lib/supabase/server";
import { ORDER_STATUS } from "@/lib/order-status";
import { SHIPPING_LABEL } from "@/lib/order-status";
import { cn, formatDate } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";
import { TrackingTimeline } from "@/components/account/tracking-timeline";
import type { PublicTrackingRpcResult } from "@/lib/supabase/types";

/**
 * The page the emailed "Track this order" button opens.
 *
 * Deliberately outside `/account` and outside the site chrome. Three reasons,
 * and the first is the one that made it necessary:
 *
 *   1. **Guest checkout has no account.** A guest who is emailed a link to a
 *      page behind a sign-in wall has been sent to a dead end.
 *   2. It is opened on a phone, from an inbox, usually to answer one question.
 *      A header, a mega-menu and a newsletter sign-up are in the way of that.
 *   3. The token is the credential, so this page must show *only* what a
 *      link-holder may see — see `tracking_by_token` in migration 24. There is
 *      no address, no email, no total and no line item here, and the RPC is
 *      what enforces that rather than this component remembering to.
 */

export const dynamic = "force-dynamic";

/**
 * Never indexed, and never sent as a referrer.
 *
 * The URL contains a bearer token. `noindex` keeps it out of search results;
 * `noreferrer` on every outbound link keeps it out of the carrier's access logs
 * when somebody clicks through to DHL — a leak that needs no mistake by anyone
 * to happen, only a link.
 */
export const metadata: Metadata = {
  title: "Track your order",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

async function readTracking(
  token: string
): Promise<PublicTrackingRpcResult | null> {
  // The anonymous client on purpose: this page is served to people with no
  // session, and the RPC is `security definer` with the token as its credential.
  const supabase = createAnonymousClient();

  const { data, error } = await supabase.rpc("tracking_by_token", {
    p_token: token,
  });

  if (error) {
    // 42P01/42883 mean migration 24 has not been applied. Everything else is a
    // real fault. Either way the visitor gets "not found" rather than a stack.
    console.warn(`[track] lookup failed: ${error.message}`);
    return null;
  }

  return (data as PublicTrackingRpcResult | null) ?? null;
}

export default async function TrackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const tracking = await readTracking(token);

  // A wrong token and a deleted order are the same answer on purpose. Telling
  // the difference would turn this page into an oracle for guessing tokens.
  if (!tracking) notFound();

  const status = ORDER_STATUS[tracking.status];

  return (
    <main className="min-h-svh bg-surface py-10 lg:py-16">
      <div className="mx-auto w-full max-w-xl px-4 sm:px-6">
        {/* `Logo` renders its own link — wrapping it in another would nest
            two anchors, which is invalid and breaks keyboard navigation. */}
        <div className="flex justify-center">
          <Logo />
        </div>

        <div className="mt-8 border border-hairline bg-background">
          <header className="border-b border-hairline px-5 py-6 text-center lg:px-8">
            <p className="eyebrow-sm text-muted-foreground">Order</p>
            <p className="mt-2 font-display text-2xl font-light tabular-nums">
              {tracking.reference}
            </p>

            <p
              className={cn(
                "mt-4 inline-block rounded-full border px-3.5 py-1 eyebrow-sm",
                status.tone === "good"
                  ? "border-emerald-600/30 text-emerald-700 dark:text-emerald-400"
                  : status.tone === "warn"
                    ? "border-amber-600/40 text-amber-700 dark:text-amber-400"
                    : status.tone === "active"
                      ? "border-champagne-dark/40 text-champagne-dark"
                      : "border-hairline text-muted-foreground"
              )}
            >
              {status.label}
            </p>

            <p className="mt-4 text-xs font-light text-muted-foreground">
              Placed{" "}
              {formatDate(tracking.placedAt, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              {" · "}
              {SHIPPING_LABEL[tracking.shippingMethod]}
            </p>
          </header>

          <div className="px-5 py-7 lg:px-8">
            <TrackingTimeline
              status={tracking.status}
              events={tracking.events}
              cancelledAt={tracking.cancelledAt}
              cancelReason={tracking.cancelReason}
            />
          </div>

          {(tracking.trackingNumber || tracking.trackingUrl) && (
            <div className="border-t border-hairline px-5 py-5 lg:px-8">
              {tracking.trackingNumber && (
                <p className="text-xs font-light text-muted-foreground">
                  {tracking.trackingCarrier
                    ? `${tracking.trackingCarrier} · `
                    : ""}
                  <span className="tabular-nums text-foreground">
                    {tracking.trackingNumber}
                  </span>
                </p>
              )}

              {tracking.trackingUrl && (
                <Link
                  href={tracking.trackingUrl}
                  target="_blank"
                  // `noreferrer` matters more than usual here — see the metadata
                  // note. Without it the carrier's logs get this page's URL,
                  // token and all.
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 eyebrow-sm transition-opacity duration-500 hover:opacity-60"
                >
                  Follow on the carrier&rsquo;s site
                  <ExternalLink className="size-3.5" strokeWidth={1.25} />
                </Link>
              )}
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs font-light leading-relaxed text-muted-foreground">
          This page is linked to your order. Anyone with the link can see it, so
          share it only with people you want to.
        </p>

        <p className="mt-4 text-center text-xs font-light text-muted-foreground">
          <Link href="/account/orders" className="underline underline-offset-4">
            Sign in
          </Link>{" "}
          to see the full order, or{" "}
          <Link href="/help/contact" className="underline underline-offset-4">
            get in touch
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
