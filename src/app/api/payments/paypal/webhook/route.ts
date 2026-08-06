import { NextResponse } from "next/server";

import {
  failPayment,
  getPaymentByReference,
  recordEvent,
  reconcileVerification,
} from "@/lib/payments";
import { verifyWebhookSignature } from "@/lib/payments/paypal";

/**
 * PayPal webhook.
 *
 * A safety net rather than the primary path — unlike M-Pesa, PayPal's money
 * moves during the redirect capture, which has already settled the order by
 * the time this arrives. What it catches is the case where the customer
 * approves and then closes the tab before `/return` runs: PayPal captures
 * anyway and this is the only signal that happened.
 *
 * Verification is a round trip to PayPal, not a local HMAC, so a delivery is
 * dropped whenever `PAYPAL_WEBHOOK_ID` is unset. That is the safe default: an
 * unverified webhook that settles orders is a public endpoint for marking
 * anything paid.
 */

interface PaypalWebhookEvent {
  id: string;
  event_type: string;
  resource?: {
    id?: string;
    custom_id?: string;
    invoice_id?: string;
    status?: string;
    amount?: { currency_code?: string; value?: string };
  };
}

export async function POST(request: Request) {
  const rawBody = await request.text();

  let event: PaypalWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PaypalWebhookEvent;
  } catch {
    return new NextResponse("Malformed payload", { status: 400 });
  }

  const verified = await verifyWebhookSignature(
    {
      transmissionId: request.headers.get("paypal-transmission-id"),
      transmissionTime: request.headers.get("paypal-transmission-time"),
      transmissionSig: request.headers.get("paypal-transmission-sig"),
      certUrl: request.headers.get("paypal-cert-url"),
      authAlgo: request.headers.get("paypal-auth-algo"),
    },
    event
  );

  if (!verified) {
    console.warn("[paypal] rejected an unverified webhook");
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const reference = event.resource?.custom_id ?? event.resource?.invoice_id;
  const payment = reference ? await getPaymentByReference(reference) : null;

  try {
    const isNew = await recordEvent({
      provider: "paypal",
      eventId: event.id,
      eventType: event.event_type,
      paymentId: payment?.id ?? null,
      payload: event as unknown as Record<string, unknown>,
    });

    if (!isNew) return NextResponse.json({ received: true, duplicate: true });
  } catch (error) {
    console.error("[paypal] could not record the event:", error);
    return new NextResponse("Could not record the event", { status: 500 });
  }

  if (!reference || !payment) return NextResponse.json({ received: true });

  switch (event.event_type) {
    case "PAYMENT.CAPTURE.COMPLETED": {
      const value = event.resource?.amount?.value;
      await reconcileVerification({
        reference,
        providerReference: event.resource?.id ?? null,
        status: "success",
        // Verified above, so the payload is trustworthy here — but it is still
        // checked against the order's own charge amount downstream.
        amount: value ? Math.round(Number(value) * 100) : null,
        currency: event.resource?.amount?.currency_code ?? null,
      });
      break;
    }

    case "PAYMENT.CAPTURE.DENIED":
    case "PAYMENT.CAPTURE.REVERSED":
    case "CHECKOUT.ORDER.VOIDED":
      await failPayment(reference, `PayPal reported ${event.event_type}.`);
      break;

    default:
      // Recorded for the audit trail. Refunds are reconciled by staff; see
      // the note in the Paystack handler.
      break;
  }

  return NextResponse.json({ received: true });
}
