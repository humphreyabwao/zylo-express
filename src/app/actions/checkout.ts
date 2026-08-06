"use server";

import { z } from "zod";

import { grantOrderAccess } from "@/lib/order-access";
import {
  OrderError,
  cancelOrder,
  createPendingOrder,
  releaseStock,
} from "@/lib/orders";
import {
  PaymentError,
  availablePaymentMethods,
  failPayment,
  getPaymentByReference,
  reconcileVerification,
  startPayment,
} from "@/lib/payments";
import { verifyTransaction } from "@/lib/payments/paystack";
import { RateLimits, clientIdentifier, rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/supabase/server";
import { startCheckoutSchema } from "@/lib/validation";
import type { Address } from "@/lib/types";

/**
 * Checkout actions.
 *
 * A Server Action is a public POST endpoint — the checkout page rendering
 * around it is not a gate. Everything here re-validates its input, re-derives
 * every amount from the catalogue, and takes the customer's identity from the
 * session rather than the payload.
 *
 * What the browser is trusted with: which variants, how many, where to ship,
 * and how they want to pay. What it is never trusted with: any price, any
 * total, and whether a payment succeeded.
 */

export type CheckoutResult =
  | { kind: "redirect"; url: string; reference: string }
  | {
      kind: "mpesa-prompt";
      reference: string;
      displayText: string;
      phone: string;
    }
  | { kind: "error"; message: string; fieldErrors?: Record<string, string> };

export async function getPaymentOptions(): Promise<string[]> {
  return availablePaymentMethods();
}

/**
 * Price the basket, write a pending order, and start the payment.
 *
 * The order exists before the provider is called and holds its stock, so the
 * customer cannot lose the last unit to someone else while typing an M-Pesa
 * PIN. Nothing is confirmed until money is verified — if the payment never
 * completes, `expire_pending_payments` releases the hold.
 */
export async function startCheckout(
  input: unknown
): Promise<CheckoutResult> {
  const identifier = await clientIdentifier();
  const limit = await rateLimit("checkout", identifier, RateLimits.submit);

  if (!limit.success) {
    return {
      kind: "error",
      message: "Too many attempts. Please wait a moment and try again.",
    };
  }

  const parsed = startCheckoutSchema.safeParse(input);
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    return {
      kind: "error",
      message: "Please check the details above and try again.",
      fieldErrors: Object.fromEntries(
        Object.entries(flat)
          .filter(([, messages]) => messages?.length)
          .map(([field, messages]) => [field, messages![0]])
      ),
    };
  }

  const values = parsed.data;

  if (!availablePaymentMethods().includes(values.paymentMethod)) {
    return {
      kind: "error",
      message: "That payment method is not available right now.",
    };
  }

  // Identity comes from the verified session. A `userId` in the payload would
  // let anyone file an order into someone else's account history.
  const user = await getCurrentUser();

  let order: Awaited<ReturnType<typeof createPendingOrder>>;
  try {
    order = await createPendingOrder({
      email: values.email,
      lines: values.lines,
      shippingAddress: values.shippingAddress as Address,
      billingAddress: values.billingSameAsShipping
        ? null
        : ((values.billingAddress ?? null) as Address | null),
      shippingMethod: values.shippingMethodId,
      promotionCode: values.promotionCode,
      giftMessage: values.giftMessage,
      userId: user?.id ?? null,
    });
  } catch (error) {
    if (error instanceof OrderError) {
      return { kind: "error", message: error.message };
    }
    console.error("[checkout] order creation failed:", error);
    return {
      kind: "error",
      message: "Could not place the order. You have not been charged.",
    };
  }

  try {
    const payment = await startPayment({
      orderId: order.id,
      orderReference: order.reference,
      email: values.email,
      amount: order.totals.total,
      method: values.paymentMethod,
      phone: values.mpesaPhone || undefined,
    });

    if (payment.kind === "redirect") {
      return {
        kind: "redirect",
        url: payment.url,
        reference: payment.reference,
      };
    }

    return {
      kind: "mpesa-prompt",
      reference: payment.reference,
      displayText: payment.displayText,
      phone: payment.phone,
    };
  } catch (error) {
    // The order is holding stock for a payment that never started. Release it
    // now rather than making the customer wait for the expiry sweep to free a
    // piece they are still looking at — but only if nothing has released it
    // already: a failure after the payment row existed went through
    // `fail_payment`, which does the release and the cancellation together.
    // Releasing twice would inflate inventory.
    if (!(error instanceof PaymentError) || !error.stockReleased) {
      await releaseStock(order.reservedLines);
      await cancelOrder(order.id);
    }

    return {
      kind: "error",
      message:
        error instanceof PaymentError
          ? error.message
          : "Could not start the payment. You have not been charged.",
      fieldErrors:
        error instanceof PaymentError && /mobile number/i.test(error.message)
          ? { mpesaPhone: error.message }
          : undefined,
    };
  }
}

/* ------------------------------------------------------------ mpesa poll */

const pollSchema = z.object({ reference: z.string().trim().min(8).max(64) });

export type CheckoutStatus =
  | { state: "pending" }
  | { state: "paid"; orderReference: string | null }
  | { state: "failed"; message: string }
  | { state: "unknown" };

/**
 * Ask Paystack whether the STK prompt was authorised yet.
 *
 * The webhook is the reliable path and settles the order on its own; this
 * poll exists so the customer sees the result in the two seconds after they
 * enter their PIN rather than whenever the webhook lands. Both funnel through
 * `reconcileVerification`, and whichever arrives second is told it lost.
 */
export async function pollCheckoutStatus(
  input: unknown
): Promise<CheckoutStatus> {
  const parsed = pollSchema.safeParse(input);
  if (!parsed.success) return { state: "unknown" };

  // The reference is 96 bits of server-generated randomness, so it is not
  // guessable — but it is a bearer token, and bearer tokens deserve a ceiling
  // on how fast someone may try them.
  const identifier = await clientIdentifier();
  const limit = await rateLimit("payment-poll", identifier, RateLimits.poll);
  if (!limit.success) return { state: "pending" };

  const { reference } = parsed.data;

  const payment = await getPaymentByReference(reference);
  if (!payment) return { state: "unknown" };

  if (payment.status === "succeeded") {
    return {
      state: "paid",
      orderReference: await grantOrderAccess(payment.order_id),
    };
  }
  if (payment.status === "failed" || payment.status === "abandoned") {
    return {
      state: "failed",
      message: payment.failure_reason ?? "The payment was not completed.",
    };
  }

  let verification: Awaited<ReturnType<typeof verifyTransaction>>;
  try {
    verification = await verifyTransaction(reference);
  } catch {
    // Paystack unreachable. Not a failed payment — keep the client polling.
    return { state: "pending" };
  }

  // Paystack reports an unfinished mobile-money charge as `ongoing`; treat it
  // and `pending` alike, or an STK prompt still on the handset gets cancelled
  // the moment the customer is slow to find their phone.
  const status =
    verification.status === "ongoing" || verification.status === "pending"
      ? "pending"
      : verification.status === "success"
        ? "success"
        : verification.status === "abandoned"
          ? "abandoned"
          : "failed";

  const outcome = await reconcileVerification({
    reference,
    providerReference: verification.providerReference,
    status,
    amount: verification.amount,
    currency: verification.currency,
    reason: verification.gatewayResponse,
  });

  switch (outcome.state) {
    case "paid":
      return {
        state: "paid",
        orderReference: await grantOrderAccess(outcome.payment.order_id),
      };
    case "failed":
      return {
        state: "failed",
        message: outcome.reason ?? "The payment was not completed.",
      };
    case "pending":
      return { state: "pending" };
    default:
      return { state: "unknown" };
  }
}

/** Give up on an STK prompt the customer says they will not complete. */
export async function cancelCheckout(input: unknown): Promise<void> {
  const parsed = pollSchema.safeParse(input);
  if (!parsed.success) return;

  await failPayment(parsed.data.reference, "Cancelled by the customer.", "abandoned");
}
