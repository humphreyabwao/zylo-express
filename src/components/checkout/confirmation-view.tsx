import Image from "next/image";
import Link from "next/link";
import { Check } from "lucide-react";

import { findShippingMethod } from "@/lib/pricing";
import { formatPrice } from "@/lib/utils";
import type { OrderWithItems } from "@/lib/orders";
import type { Address, ShippingSpeed } from "@/lib/types";
import type { PaymentRow } from "@/lib/supabase/types";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

/**
 * The order confirmation.
 *
 * Server-rendered from the order row, not from a snapshot the checkout left in
 * sessionStorage. Both redirect flows send the customer out to a provider and
 * back, and a shopper who finishes on their phone, or in a new tab, or after
 * their browser has cleared session storage, still needs to see what they
 * bought. The database is the thing that survives all three.
 *
 * Entitlement is proven before this renders — see `@/lib/order-access`.
 */

const PAYMENT_LABELS: Record<string, string> = {
  card: "Card",
  mpesa: "M-Pesa",
  paypal: "PayPal",
};

export function ConfirmationView({
  order,
  payment,
}: {
  order: OrderWithItems;
  payment: PaymentRow | null;
}) {
  const address = order.shipping_address as unknown as Address;
  const method = findShippingMethod(order.shipping_method as ShippingSpeed);
  const currency = order.currency;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="text-center">
        <span className="mx-auto grid size-14 place-items-center border border-champagne-dark text-champagne-dark">
          <Check className="size-6" strokeWidth={1} />
        </span>

        <h1 className="mt-8 font-display text-4xl font-light leading-[1.06] lg:text-5xl">
          Thank you
        </h1>
        <p className="mt-5 text-base font-light leading-relaxed text-muted-foreground">
          Your order has been received and is being prepared. A confirmation is
          on its way to <span className="text-foreground">{order.email}</span>.
        </p>

        <p className="mt-8 inline-block border border-hairline px-6 py-3">
          <span className="eyebrow-sm text-muted-foreground">Reference</span>
          <span className="ml-3 font-display text-lg font-light tabular-nums">
            {order.reference}
          </span>
        </p>
      </div>

      <div className="mt-16 border border-hairline p-6 lg:p-10">
        <h2 className="eyebrow-sm text-muted-foreground">Your order</h2>

        <ul className="mt-6 space-y-6">
          {order.order_items.map((item) => (
            <li key={item.id} className="flex gap-4">
              <div className="relative aspect-3/4 w-16 shrink-0 overflow-hidden bg-secondary">
                {item.image_url && (
                  <Image
                    src={item.image_url}
                    alt={item.product_name}
                    fill
                    sizes="4rem"
                    className="object-cover"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/products/${item.product_slug}`}
                  className="block truncate font-display text-base font-normal hover:opacity-60"
                >
                  {item.product_name}
                </Link>
                <p className="mt-1 text-xs font-light text-muted-foreground">
                  {item.variant_title} · Quantity {item.quantity}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums">
                {formatPrice(item.line_total, { currency })}
              </p>
            </li>
          ))}
        </ul>

        <Separator className="my-8" />

        <dl className="space-y-3">
          <Row
            label="Subtotal"
            value={formatPrice(order.subtotal, { currency })}
          />
          {order.discount > 0 && (
            <Row
              label={
                order.promotion_code ? `Discount (${order.promotion_code})` : "Discount"
              }
              value={`−${formatPrice(order.discount, { currency })}`}
            />
          )}
          <Row
            label="Delivery"
            value={
              order.shipping === 0
                ? "Complimentary"
                : formatPrice(order.shipping, { currency })
            }
          />
          <Row label="Tax" value={formatPrice(order.tax, { currency })} />
        </dl>

        <Separator className="my-6" />

        <div className="flex items-baseline justify-between gap-4">
          <span className="eyebrow-sm">Total paid</span>
          <span className="text-2xl font-semibold tabular-nums">
            {formatPrice(order.total, { currency })}
          </span>
        </div>

        {payment && payment.charge_currency !== currency && (
          // The customer's bank or M-Pesa statement will read in the currency
          // that was actually moved, not the USD the catalogue is priced in.
          // Saying so here saves a support ticket.
          <p className="mt-3 text-right text-xs font-light text-muted-foreground">
            Charged as{" "}
            {formatPrice(payment.charge_amount, {
              currency: payment.charge_currency,
              showDecimals: true,
            })}{" "}
            by {PAYMENT_LABELS[payment.method] ?? payment.provider}
          </p>
        )}

        <Separator className="my-8" />

        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <h3 className="eyebrow-sm text-muted-foreground">Delivering to</h3>
            <address className="mt-3 text-sm font-light not-italic leading-relaxed">
              {address.firstName} {address.lastName}
              <br />
              {address.line1}
              {address.line2 && (
                <>
                  <br />
                  {address.line2}
                </>
              )}
              <br />
              {address.city}, {address.region} {address.postalCode}
              <br />
              {address.country}
            </address>
          </div>

          <div>
            <h3 className="eyebrow-sm text-muted-foreground">Method</h3>
            <p className="mt-3 text-sm font-light leading-relaxed">
              {method.name}
              <br />
              <span className="text-champagne-dark">{method.estimate}</span>
            </p>

            {payment && (
              <>
                <h3 className="eyebrow-sm mt-6 text-muted-foreground">
                  Paid with
                </h3>
                <p className="mt-3 text-sm font-light leading-relaxed">
                  {PAYMENT_LABELS[payment.method] ?? payment.provider}
                  {payment.phone && (
                    <>
                      <br />
                      <span className="tabular-nums">{payment.phone}</span>
                    </>
                  )}
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-section-gap flex flex-wrap justify-center gap-4">
        <Button asChild size="lg">
          <Link href="/account/orders">Track your order</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/shop">Continue shopping</Link>
        </Button>
      </div>

      <p className="mt-10 text-center text-sm font-light leading-relaxed text-muted-foreground">
        Questions about this order?{" "}
        <Link href="/help/contact" className="link-draw text-foreground">
          Speak with a client advisor
        </Link>
        .
      </p>
    </div>
  );
}

/**
 * Shown when we cannot prove this browser owns the order — a shared link, a
 * cookie that has aged out, or a confirmation reopened days later.
 *
 * It deliberately confirms nothing about whether the reference exists. Order
 * references are short enough to guess at, and a page that says "no such
 * order" for one and shows an address for another is an oracle.
 */
export function ConfirmationFallback({ reference }: { reference?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="mx-auto grid size-14 place-items-center border border-champagne-dark text-champagne-dark">
        <Check className="size-6" strokeWidth={1} />
      </span>

      <h1 className="mt-8 font-display text-4xl font-light leading-[1.06] lg:text-5xl">
        Thank you
      </h1>
      <p className="mt-5 text-base font-light leading-relaxed text-muted-foreground">
        Your order has been received. A confirmation with the full details is on
        its way to the email address you gave us.
      </p>

      {reference && (
        <p className="mt-8 inline-block border border-hairline px-6 py-3">
          <span className="eyebrow-sm text-muted-foreground">Reference</span>
          <span className="ml-3 font-display text-lg font-light tabular-nums">
            {reference}
          </span>
        </p>
      )}

      <div className="mt-section-gap flex flex-wrap justify-center gap-4">
        <Button asChild size="lg">
          <Link href="/account/orders">View your orders</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/shop">Continue shopping</Link>
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-sm font-light text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
