import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { DEMO_ADDRESSES, DEMO_CLIENT, DEMO_ORDERS } from "@/data/account";
import { formatDate, formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { OrderCard } from "@/components/account/order-card";
import { WishlistCount } from "@/components/account/wishlist-count";

export const metadata: Metadata = {
  title: "My Account",
  description: "Your orders, saved pieces and preferences.",
  robots: { index: false, follow: false },
};

export default function AccountOverviewPage() {
  const latest = DEMO_ORDERS[0];
  const lifetime = DEMO_ORDERS.reduce((sum, o) => sum + o.totals.total, 0);
  const defaultAddress =
    DEMO_ADDRESSES.find((a) => a.isDefault) ?? DEMO_ADDRESSES[0];

  return (
    <div className="space-y-14">
      {/* Snapshot */}
      <section>
        <h2 className="eyebrow-sm text-muted-foreground">Overview</h2>

        <dl className="mt-6 grid gap-px border border-hairline bg-hairline sm:grid-cols-3">
          <Stat
            label="Orders placed"
            value={String(DEMO_ORDERS.length)}
            href="/account/orders"
          />
          <Stat
            label="Lifetime value"
            value={formatPrice(lifetime)}
          />
          <Stat
            label="Client since"
            value={formatDate(DEMO_CLIENT.memberSince, {
              month: "long",
              year: "numeric",
            })}
          />
        </dl>
      </section>

      {/* Latest order */}
      <section>
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-display text-2xl font-light">Latest order</h2>
          <Link
            href="/account/orders"
            className="group/link inline-flex items-center gap-2.5 eyebrow-sm transition-opacity duration-500 hover:opacity-60"
          >
            All orders
            <ArrowRight
              className="size-3.5 transition-transform duration-600 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover/link:translate-x-1.5"
              strokeWidth={1.25}
            />
          </Link>
        </div>

        <div className="mt-6">
          <OrderCard order={latest} />
        </div>
      </section>

      {/* Quick panels */}
      <section className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col border border-hairline p-6 lg:p-8">
          <h3 className="font-display text-xl font-light">Saved items</h3>
          <p className="mt-3 flex-1 text-sm font-light leading-relaxed text-muted-foreground">
            <WishlistCount /> We will write to you if something you have saved
            is running low.
          </p>
          <Button asChild variant="outline" className="mt-6 self-start">
            <Link href="/account/wishlist">View saved items</Link>
          </Button>
        </div>

        <div className="flex flex-col border border-hairline p-6 lg:p-8">
          <h3 className="font-display text-xl font-light">Default address</h3>
          <address className="mt-3 flex-1 text-sm font-light not-italic leading-relaxed text-muted-foreground">
            {defaultAddress.firstName} {defaultAddress.lastName}
            <br />
            {defaultAddress.line1}
            {defaultAddress.line2 && (
              <>
                <br />
                {defaultAddress.line2}
              </>
            )}
            <br />
            {defaultAddress.city} {defaultAddress.postalCode}
            <br />
            {defaultAddress.country}
          </address>
          <Button asChild variant="outline" className="mt-6 self-start">
            <Link href="/account/addresses">Manage addresses</Link>
          </Button>
        </div>
      </section>

      {/* Advisor */}
      <section className="border border-hairline bg-surface p-6 lg:p-10">
        <p className="eyebrow-sm text-champagne-dark">Private client service</p>
        <h3 className="mt-5 max-w-lg font-display text-2xl font-light leading-snug">
          {DEMO_CLIENT.advisor.name} is your advisor at{" "}
          {DEMO_CLIENT.advisor.boutique}
        </h3>
        <p className="mt-4 max-w-xl text-sm font-light leading-relaxed text-muted-foreground">
          An hour in the boutique, or by video with the pieces brought to the
          camera one at a time. Sizing, engraving and made-to-order requests are
          all arranged through your advisor.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/services#appointments">Book an appointment</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/help/contact">Send a message</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const body = (
    <div className="bg-background p-6 lg:p-8">
      <dt className="eyebrow-sm text-muted-foreground">{label}</dt>
      <dd className="mt-3 font-display text-3xl font-light tabular-nums">
        {value}
      </dd>
    </div>
  );

  return href ? (
    <Link href={href} className="transition-opacity duration-500 hover:opacity-70">
      {body}
    </Link>
  ) : (
    body
  );
}
