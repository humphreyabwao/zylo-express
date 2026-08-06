import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { grantOrderAccess } from "@/lib/order-access";
import { reconcileVerification } from "@/lib/payments";
import { verifyTransaction } from "@/lib/payments/paystack";

/**
 * Where Paystack sends the customer back after their hosted card page.
 *
 * The query string is a hint, never evidence. Paystack appends
 * `?reference=…&trxref=…` and anyone can type that URL, so this route reads
 * the reference, asks Paystack's API what actually happened, and settles on
 * that answer alone. The redirect is the customer's experience; the webhook is
 * the system of record, and both converge on `reconcileVerification`.
 */

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get("reference") ?? searchParams.get("trxref");

  const site = env.siteUrl;

  if (!reference) {
    return NextResponse.redirect(
      new URL("/checkout?payment=missing-reference", site)
    );
  }

  try {
    const verification = await verifyTransaction(reference);

    const status =
      verification.status === "success"
        ? "success"
        : verification.status === "abandoned"
          ? "abandoned"
          : verification.status === "pending" || verification.status === "ongoing"
            ? "pending"
            : "failed";

    const outcome = await reconcileVerification({
      reference,
      providerReference: verification.providerReference,
      status,
      amount: verification.amount,
      currency: verification.currency,
      reason: verification.gatewayResponse,
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

    if (outcome.state === "pending") {
      // The customer closed the page mid-authorisation, or the bank is still
      // deciding. Send them to the confirmation shell, which polls rather than
      // declaring a failure that may be about to succeed.
      return NextResponse.redirect(
        new URL(`/checkout/confirmation?pending=${reference}`, site)
      );
    }

    return NextResponse.redirect(new URL("/checkout?payment=failed", site));
  } catch (error) {
    // Verification itself failed — Paystack unreachable, most likely. The
    // charge may well have gone through, so nothing is marked failed here;
    // the webhook settles it and the customer is told to wait rather than
    // being invited to pay a second time.
    console.error("[paystack] callback verification failed:", error);
    return NextResponse.redirect(
      new URL(`/checkout/confirmation?pending=${reference}`, site)
    );
  }
}
