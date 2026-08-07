import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import {
  failPayment,
  forgetEvent,
  getPaymentByReference,
  recordEvent,
  reconcileVerification,
} from "@/lib/payments";
import {
  verifyTransaction,
  verifyWebhookSignature,
} from "@/lib/payments/paystack";

/**
 * Paystack webhook.
 *
 * This is the system of record for M-Pesa: an STK prompt is authorised on a
 * handset, with no browser involved, so `charge.success` here is often the
 * only signal that money moved. Card payments arrive here too, racing the
 * customer's redirect — whichever lands first settles the order and the other
 * is told it lost.
 *
 * Order of operations is deliberate:
 *
 *   1. read the RAW body — the signature is over exact bytes, and
 *      re-serialising parsed JSON reorders keys and breaks the digest
 *   2. verify the signature before parsing anything as meaningful
 *   3. de-duplicate, because Paystack retries for hours after a non-2xx
 *   4. re-verify against their API rather than trusting the payload's amount
 *
 * Always answers 200 once the signature checks out. A 500 buys nothing but a
 * retry storm for a payload we have already recorded.
 */

interface PaystackWebhookEvent {
  event: string;
  data: {
    reference?: string;
    status?: string;
    amount?: number;
    currency?: string;
    id?: number;
    gateway_response?: string;
  };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");

  if (!(await verifyWebhookSignature(rawBody, signature))) {
    console.warn("[paystack] rejected a webhook with a bad signature");
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let event: PaystackWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PaystackWebhookEvent;
  } catch {
    return new NextResponse("Malformed payload", { status: 400 });
  }

  const reference = event.data?.reference;
  if (!reference) return NextResponse.json({ received: true });

  // Paystack sends no event id, so the payload's own digest is the identity.
  // A retry re-sends identical bytes and therefore hashes the same, which is
  // exactly the de-duplication we need.
  const eventId = createHash("sha256").update(rawBody).digest("hex");

  const payment = await getPaymentByReference(reference);

  try {
    const isNew = await recordEvent({
      provider: "paystack",
      eventId,
      eventType: event.event,
      paymentId: payment?.id ?? null,
      payload: event as unknown as Record<string, unknown>,
    });

    if (!isNew) return NextResponse.json({ received: true, duplicate: true });
  } catch (error) {
    // The event store is down. Fail loudly so Paystack retries — silently
    // dropping the one message that confirms an M-Pesa payment would leave a
    // paid order sitting unfulfilled.
    console.error("[paystack] could not record the event:", error);
    return new NextResponse("Could not record the event", { status: 500 });
  }

  if (!payment) {
    // A reference we never issued, or an event for a different environment
    // sharing the same Paystack account. Recorded above, ignored here.
    return NextResponse.json({ received: true });
  }

  switch (event.event) {
    case "charge.success": {
      // The payload's amount is not trusted: re-verify against the API, which
      // also re-checks it against what we asked to be charged.
      try {
        const verification = await verifyTransaction(reference);
        await reconcileVerification({
          reference,
          providerReference: verification.providerReference,
          status: verification.status === "success" ? "success" : "failed",
          amount: verification.amount,
          currency: verification.currency,
          reason: verification.gatewayResponse,
        });
      } catch (error) {
        console.error("[paystack] verification after webhook failed:", error);
        // Drop the dedup row, or Paystack's retry would be dismissed as a
        // duplicate and this payment would never settle.
        await forgetEvent("paystack", eventId);
        return new NextResponse("Verification unavailable", { status: 500 });
      }
      break;
    }

    case "charge.failed":
      await failPayment(
        reference,
        event.data.gateway_response ?? "The payment was declined."
      );
      break;

    default:
      // Transfers, refunds, subscriptions — recorded for the audit trail, not
      // acted on. Refunds are issued from the Paystack dashboard today and
      // reconciled by staff; automating that means deciding how to restock.
      break;
  }

  return NextResponse.json({ received: true });
}
