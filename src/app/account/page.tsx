import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Package, PackageCheck, Truck } from "lucide-react";

import {
  getAccountAddresses,
  getAccountOrders,
  getAccountProfile,
  selectInTransit,
  selectLifetimeValue,
} from "@/lib/account";
import { formatDate, formatPrice } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { OrderSummaryCard } from "@/components/account/order-summary-card";
import { WishlistCount } from "@/components/account/wishlist-count";
import { WishlistStat } from "@/components/account/wishlist-stat";
import { SetupNotice } from "@/components/account/setup-notice";

export const metadata: Metadata = {
  title: "My Account",
  description: "Your orders, saved pieces and delivery details.",
  robots: { index: false, follow: false },
};

export default async function AccountOverviewPage() {
  // Independent reads — one round trip rather than four sequential awaits.
  const [profile, orders, addresses] = await Promise.all([
    getAccountProfile(),
    getAccountOrders(10),
    getAccountAddresses(),
  ]);

  const inTransit = selectInTransit(orders);
  const lifetime = selectLifetimeValue(orders);
  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0];
  const latest = orders[0];

  return (
    <div className="space-y-12">
      {profile && !profile.persisted && <SetupNotice />}

      {/* Snapshot. Counts a cross-border shopper actually checks: what is
          moving, what has landed, what is saved. */}
      <section aria-labelledby="snapshot">
        <h2 id="snapshot" className="sr-only">
          Account summary
        </h2>

        <dl className="grid gap-px border border-hairline bg-hairline sm:grid-cols-3">
          <Stat
            icon={Truck}
            label="In transit"
            value={String(inTransit.length)}
            href={inTransit.length ? "/account/orders" : undefined}
            accent={inTransit.length > 0}
          />
          <Stat
            icon={PackageCheck}
            label="Orders placed"
            value={String(orders.length)}
            href={orders.length ? "/account/orders" : undefined}
          />
          <Stat
            icon={Package}
            label="Saved items"
            value={<WishlistStat />}
            href="/account/wishlist"
          />
        </dl>

        {orders.length > 0 && (
          <p className="mt-4 text-xs font-light text-muted-foreground">
            Lifetime spend{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {formatPrice(lifetime)}
            </span>{" "}
            across {orders.length} {orders.length === 1 ? "order" : "orders"}.
          </p>
        )}
      </section>

      {/* In transit, or the empty state. */}
      {inTransit.length > 0 ? (
        <section aria-labelledby="in-transit">
          <div className="flex items-end justify-between gap-4">
            <h2 id="in-transit" className="font-display text-2xl font-light">
              On its way
            </h2>
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

          <ul className="mt-6 space-y-5">
            {inTransit.map((order) => (
              <li key={order.id}>
                <OrderSummaryCard order={order} />
              </li>
            ))}
          </ul>
        </section>
      ) : latest ? (
        <section aria-labelledby="latest">
          <div className="flex items-end justify-between gap-4">
            <h2 id="latest" className="font-display text-2xl font-light">
              Latest order
            </h2>
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
            <OrderSummaryCard order={latest} />
          </div>
        </section>
      ) : (
        <section className="border border-hairline px-8 py-16 text-center">
          <Truck
            className="mx-auto size-7 text-champagne-dark"
            strokeWidth={1}
            aria-hidden="true"
          />
          <h2 className="mt-6 font-display text-2xl font-light">
            No orders yet
          </h2>
          <p className="mx-auto mt-3 max-w-sm text-sm font-light leading-relaxed text-muted-foreground">
            When you order, this is where you will track it — including which
            country each piece ships from and when it was dispatched.
          </p>
          <Button asChild className="mt-8">
            <Link href="/shop">Start shopping</Link>
          </Button>
        </section>
      )}

      {/* Delivery details */}
      <section className="grid gap-5 sm:grid-cols-2">
        <Panel
          title="Default address"
          action={{
            href: "/account/addresses",
            label: addresses.length ? "Manage addresses" : "Add an address",
          }}
        >
          {defaultAddress ? (
            <address className="text-sm font-light not-italic leading-relaxed text-muted-foreground">
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
              {defaultAddress.city}, {defaultAddress.region}{" "}
              {defaultAddress.postalCode}
              <br />
              {defaultAddress.country}
            </address>
          ) : (
            <p className="text-sm font-light leading-relaxed text-muted-foreground">
              No address saved yet. Adding one now makes checkout a single step
              later.
            </p>
          )}
        </Panel>

        <Panel
          title="Saved items"
          action={{ href: "/account/wishlist", label: "View saved items" }}
        >
          <p className="text-sm font-light leading-relaxed text-muted-foreground">
            <WishlistCount />
          </p>
        </Panel>
      </section>

      {profile && (
        <p className="text-xs font-light text-muted-foreground">
          Signed in as {profile.email}. Member since{" "}
          {formatDate(profile.memberSince, { month: "long", year: "numeric" })}.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ components */

function Stat({
  icon: Icon,
  label,
  value,
  href,
  accent = false,
}: {
  icon: typeof Truck;
  label: string;
  value: React.ReactNode;
  href?: string;
  accent?: boolean;
}) {
  const body = (
    <div className="flex h-full items-start gap-4 bg-background p-5 lg:p-6">
      <Icon
        className={cnAccent(accent)}
        strokeWidth={1.25}
        aria-hidden="true"
      />
      <div>
        <dt className="eyebrow-sm text-muted-foreground">{label}</dt>
        <dd className="mt-1.5 font-display text-3xl font-light tabular-nums">
          {value}
        </dd>
      </div>
    </div>
  );

  return href ? (
    <Link
      href={href}
      className="transition-colors duration-500 hover:bg-secondary/50"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

function cnAccent(accent: boolean) {
  return accent
    ? "size-5 shrink-0 text-champagne-dark"
    : "size-5 shrink-0 text-muted-foreground";
}

function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col border border-hairline p-6">
      <h3 className="font-display text-lg font-normal">{title}</h3>
      <div className="mt-3 flex-1">{children}</div>
      <Button asChild variant="outline" size="sm" className="mt-6 self-start">
        <Link href={action.href}>{action.label}</Link>
      </Button>
    </div>
  );
}
