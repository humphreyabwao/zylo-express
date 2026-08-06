"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { pollCheckoutStatus } from "@/app/actions/checkout";
import { Button } from "@/components/ui/button";

/**
 * A payment that has neither succeeded nor failed yet.
 *
 * Reached when a redirect came back before the provider had decided — a card
 * still in 3-D Secure, or a verify call that timed out. The alternatives are
 * both wrong: calling it a failure invites a second payment for an order that
 * is about to confirm, and calling it a success confirms an order nobody has
 * paid for. So it polls, and says so.
 */

const POLL_MS = 4_000;
const GIVE_UP_MS = 120_000;

export function PendingPayment({ reference }: { reference: string }) {
  const router = useRouter();
  const [gaveUp, setGaveUp] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);

  React.useEffect(() => {
    const startedAt = Date.now();
    let cancelled = false;

    const poll = window.setInterval(async () => {
      if (Date.now() - startedAt > GIVE_UP_MS) {
        if (!cancelled) setGaveUp(true);
        window.clearInterval(poll);
        return;
      }

      const status = await pollCheckoutStatus({ reference });
      if (cancelled) return;

      if (status.state === "paid") {
        window.clearInterval(poll);
        // Replace, not push: the pending URL must not be somewhere the back
        // button can return to once the order is settled.
        router.replace(
          `/checkout/confirmation${status.orderReference ? `?ref=${status.orderReference}` : ""}`
        );
      } else if (status.state === "failed") {
        window.clearInterval(poll);
        setFailure(status.message);
      }
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [reference, router]);

  if (failure) {
    return (
      <Shell
        title="That payment was not completed"
        body={`${failure} You have not been charged.`}
      >
        <Button asChild size="lg">
          <Link href="/checkout">Try another method</Link>
        </Button>
      </Shell>
    );
  }

  if (gaveUp) {
    return (
      <Shell
        title="Still waiting on your bank"
        body="This is taking longer than usual. We will email you the moment it clears — there is no need to pay again, and your order will appear in your account."
      >
        <Button asChild size="lg">
          <Link href="/account/orders">View your orders</Link>
        </Button>
      </Shell>
    );
  }

  return (
    <Shell
      title="Confirming your payment"
      body="This usually takes a few seconds. Please keep this page open."
      spinner
    />
  );
}

function Shell({
  title,
  body,
  spinner,
  children,
}: {
  title: string;
  body: string;
  spinner?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto max-w-xl border border-hairline px-8 py-20 text-center"
    >
      {spinner && (
        <Loader2
          className="mx-auto size-8 animate-spin text-champagne-dark"
          strokeWidth={1}
        />
      )}

      <h1 className="mt-7 font-display text-3xl font-light">{title}</h1>
      <p className="mt-5 text-sm font-light leading-relaxed text-muted-foreground">
        {body}
      </p>

      {children && <div className="mt-10">{children}</div>}
    </div>
  );
}
