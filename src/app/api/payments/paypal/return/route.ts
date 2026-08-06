import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { grantOrderAccess } from "@/lib/order-access";
import { reconcileVerification } from "@/lib/payments";
import { PaypalError, captureOrder, getOrder } from "@/lib/payments/paypal";

/**
 * Where PayPal sends the customer back after they approve.
 *
 * Approval is not payment: PayPal holds an authorised order until someone
 * calls capture, and this route is that call. It runs server-side rather than
 * from a Buttons `onApprove` handler so the amount can be checked against the
 * order before anything is confirmed — a capture the browser triggers is a
 * capture the browser can skip.
 *
 * `?token=` is PayPal's order id. Our own payment reference comes back inside
 * the capture as `custom_id`, so the query string never decides which payment
 * gets settled.
 */

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const paypalOrderId = searchParams.get("token");
  const site = env.siteUrl;

  if (!paypalOrderId) {
    return NextResponse.redirect(
      new URL("/checkout?payment=missing-reference", site)
    );
  }

  let capture;
  try {
    capture = await captureOrder(paypalOrderId, paypalOrderId);
  } catch (error) {
    // A capture that has already run answers ORDER_ALREADY_CAPTURED. That is
    // a duplicate return — a refreshed tab, or a back button — not a failure,
    // so read the order back and settle from that instead of telling someone
    // who has paid that their payment failed.
    if (error instanceof PaypalError && error.httpStatus === 422) {
      try {
        capture = await getOrder(paypalOrderId);
      } catch {
        console.error("[paypal] could not re-read a captured order");
        return NextResponse.redirect(new URL("/checkout?payment=failed", site));
      }
    } else {
      console.error("[paypal] capture failed:", error);
      return NextResponse.redirect(new URL("/checkout?payment=failed", site));
    }
  }

  if (!capture.reference) {
    console.error("[paypal] capture carried no custom_id; cannot match a payment");
    return NextResponse.redirect(new URL("/checkout?payment=failed", site));
  }

  const outcome = await reconcileVerification({
    reference: capture.reference,
    providerReference: capture.captureId ?? paypalOrderId,
    status: capture.status === "COMPLETED" ? "success" : "failed",
    amount: capture.amount,
    currency: capture.currency,
    reason: `PayPal capture status ${capture.status}`,
  });

  if (outcome.state === "paid") {
    const orderReference = await grantOrderAccess(outcome.payment.order_id);
    return NextResponse.redirect(
      new URL(
        `/checkout/confirmation${orderReference ? `?ref=${orderReference}` : ""}`,
        site
      )
    );
  }

  return NextResponse.redirect(new URL("/checkout?payment=failed", site));
}
