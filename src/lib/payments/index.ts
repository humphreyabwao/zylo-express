import "server-only";

import { randomBytes } from "node:crypto";

import { env } from "@/lib/env";
import { getCredentials, isProviderLive } from "@/lib/payments/credentials";
import { countPromotionRedemption } from "@/lib/orders";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  PaymentMethodDb,
  PaymentProviderDb,
  PaymentRow,
  PaymentStatusDb,
} from "@/lib/supabase/types";

import { convertForCharge } from "./currency";
import * as paypal from "./paypal";
import * as paystack from "./paystack";

/**
 * Payment orchestration.
 *
 * Sits between the checkout and the two provider adapters, and owns the one
 * invariant that matters: a payment row is written *before* any provider is
 * called, and only a verified provider response moves it out of `pending`.
 *
 * The reverse order — call the provider, then record what happened — loses
 * money. A charge that succeeds while the process dies leaves the customer
 * debited with nothing in the database to reconcile against, and the webhook
 * that follows has no row to match.
 */

export type PaymentMethod = PaymentMethodDb;

export const PAYMENT_METHODS = ["card", "mpesa", "paypal"] as const;

const PROVIDER_FOR: Record<PaymentMethod, PaymentProviderDb> = {
  card: "paystack",
  mpesa: "paystack",
  paypal: "paypal",
};

export class PaymentError extends Error {
  /**
   * Whether the order's stock has already been handed back.
   *
   * True once a payment row exists and has been marked failed, because
   * `fail_payment` releases inventory and cancels the order in the same
   * statement. The caller must not release it a second time — doing so
   * *inflates* stock, which is worse than the leak it was trying to fix.
   */
  readonly stockReleased: boolean;

  constructor(message: string, stockReleased = false) {
    super(message);
    this.name = "PaymentError";
    this.stockReleased = stockReleased;
  }
}

/**
 * Which methods are actually offerable.
 *
 * A provider counts when it has a usable key — from Settings or, failing that,
 * the environment — *and* has not been switched off by an operator. Async
 * because the keys now live in a table; checkout is `force-dynamic`, so this
 * is one query on a page that was never cacheable to begin with.
 */
export async function availablePaymentMethods(): Promise<PaymentMethod[]> {
  const [paystack, paypal] = await Promise.all([
    isProviderLive("paystack"),
    isProviderLive("paypal"),
  ]);

  const methods: PaymentMethod[] = [];
  if (paystack) methods.push("card", "mpesa");
  if (paypal) methods.push("paypal");
  return methods;
}

/**
 * Our reference for a payment attempt.
 *
 * Sent to both providers as their `reference` / `invoice_id`, so it has to
 * survive their character rules — Paystack permits alphanumerics plus `-.=`
 * only, which rules out the underscores and colons used elsewhere in this
 * codebase. 96 bits of randomness, because it is also the idempotency key.
 */
function newReference(): string {
  return `zyp-${randomBytes(12).toString("hex")}`;
}

/* ------------------------------------------------------------------ start */

export interface StartPaymentInput {
  orderId: string;
  orderReference: string;
  email: string;
  /** Order total in store currency (USD minor units). */
  amount: number;
  method: PaymentMethod;
  /** Required for M-Pesa; ignored otherwise. */
  phone?: string;
}

export type StartPaymentResult =
  | { kind: "redirect"; reference: string; url: string }
  | {
      kind: "mpesa-prompt";
      reference: string;
      /** Paystack's own instruction copy, shown verbatim while polling. */
      displayText: string;
      phone: string;
    };

export async function startPayment(
  input: StartPaymentInput
): Promise<StartPaymentResult> {
  const provider = PROVIDER_FOR[input.method];

  const credentials = await getCredentials(provider);

  if (!credentials?.enabled) {
    throw new PaymentError(
      provider === "paypal"
        ? "PayPal is unavailable right now."
        : "This payment method is unavailable right now."
    );
  }

  // PayPal is billed in the store's own currency; Paystack in whatever its
  // account settles, which for an M-Pesa-capable account is KES. Taken from
  // the resolved credentials so the settlement currency travels with the key
  // it belongs to — a test account registered for a different currency than
  // the live one would otherwise charge in the wrong one after a mode switch.
  const target = provider === "paypal" ? "USD" : credentials.settlementCurrency;
  const charge = convertForCharge(input.amount, "USD", target);

  const reference = newReference();
  const supabase = createAdminClient();

  let phone: paystack.NormalisedMsisdn | null = null;
  if (input.method === "mpesa") {
    phone = paystack.normaliseKenyanMsisdn(input.phone ?? "");
    if (!phone) {
      throw new PaymentError("Enter a valid Kenyan mobile number.");
    }
  }

  const { data: payment, error } = await supabase
    .from("payments")
    .insert({
      order_id: input.orderId,
      provider,
      method: input.method,
      status: "pending",
      reference,
      amount: input.amount,
      currency: "USD",
      charge_amount: charge.amount,
      charge_currency: charge.currency,
      exchange_rate: charge.rate,
      phone: phone?.e164 ?? null,
    })
    .select("id, reference")
    .single();

  if (error || !payment) {
    console.error("[payments] could not record the attempt:", error);
    throw new PaymentError("Could not start the payment. Please try again.");
  }

  const siteUrl = env.siteUrl;
  const metadata = {
    order_id: input.orderId,
    order_reference: input.orderReference,
    payment_reference: reference,
  };

  try {
    if (input.method === "mpesa") {
      const result = await paystack.chargeMobileMoney({
        email: input.email,
        amount: charge.amount,
        currency: charge.currency,
        reference,
        phone: phone!.local,
        metadata,
      });

      if (result.status === "failed") {
        const released = await failPayment(
          reference,
          result.message ?? "The charge was declined."
        );
        throw new PaymentError(
          result.message ?? "That payment was declined. Try another method.",
          released
        );
      }

      // `pay_offline` is the STK prompt sitting on the handset. Anything else
      // Paystack answers here (`pending`, or an immediate `success`) is still
      // resolved by polling verify, so they share one path.
      await markProcessing(reference);

      return {
        kind: "mpesa-prompt",
        reference,
        displayText:
          result.displayText ??
          "Check your phone and enter your M-Pesa PIN to authorise the payment.",
        phone: phone!.e164,
      };
    }

    if (input.method === "card") {
      const result = await paystack.initializeTransaction({
        email: input.email,
        amount: charge.amount,
        currency: charge.currency,
        reference,
        callbackUrl: `${siteUrl}/api/payments/paystack/callback`,
        metadata,
      });

      await supabase
        .from("payments")
        .update({
          status: "processing",
          authorization_url: result.authorizationUrl,
        })
        .eq("reference", reference);

      return { kind: "redirect", reference, url: result.authorizationUrl };
    }

    const result = await paypal.createOrder({
      amount: charge.amount,
      currency: charge.currency,
      reference,
      orderReference: input.orderReference,
      returnUrl: `${siteUrl}/api/payments/paypal/return`,
      cancelUrl: `${siteUrl}/api/payments/paypal/cancel?reference=${reference}`,
    });

    await supabase
      .from("payments")
      .update({
        status: "processing",
        provider_reference: result.id,
        authorization_url: result.approvalUrl,
      })
      .eq("reference", reference);

    return { kind: "redirect", reference, url: result.approvalUrl };
  } catch (error) {
    if (error instanceof PaymentError) throw error;

    // The provider refused or was unreachable. The attempt row stays, marked
    // failed with the reason, so the order is released and the failure is
    // visible in support rather than being an unexplained abandoned cart.
    const reason =
      error instanceof Error ? error.message : "The payment could not be started.";
    const released = await failPayment(reference, reason);
    console.error("[payments] start failed:", error);
    throw new PaymentError(reason, released);
  }
}

async function markProcessing(reference: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("payments")
    .update({ status: "processing" })
    .eq("reference", reference);
}

/* ----------------------------------------------------------------- settle */

export async function getPaymentByReference(
  reference: string
): Promise<PaymentRow | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("payments")
    .select("*")
    .eq("reference", reference)
    .maybeSingle();

  return data ?? null;
}

/**
 * The settled payment for an order, if there is one.
 *
 * `maybeSingle` would be wrong here — an order can carry several payment rows
 * once a customer has had a card declined and paid by M-Pesa instead. Only one
 * can be `succeeded`, and that is the one the confirmation describes.
 */
export async function getSucceededPayment(
  orderId: string
): Promise<PaymentRow | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("payments")
    .select("*")
    .eq("order_id", orderId)
    .eq("status", "succeeded")
    .order("paid_at", { ascending: false })
    .limit(1);

  return data?.[0] ?? null;
}

/**
 * Mark a payment paid and confirm its order.
 *
 * Returns false when the payment was already settled. That is the normal case,
 * not an error: Paystack's webhook and the customer's redirect race constantly
 * and both call this. The guard lives in `settle_payment`'s WHERE clause, so
 * the loser of the race is told it lost rather than double-counting a
 * promotion or sending a second confirmation.
 */
export async function settlePayment(
  reference: string,
  providerReference: string | null,
  chargeAmount: number | null
): Promise<boolean> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("settle_payment", {
    p_reference: reference,
    p_provider_reference: providerReference,
    p_charge_amount: chargeAmount,
  });

  if (error) {
    console.error("[payments] settle failed:", error);
    return false;
  }
  if (!data) return false;

  const payment = await getPaymentByReference(reference);
  if (payment) {
    const { data: order } = await supabase
      .from("orders")
      .select("promotion_code")
      .eq("id", payment.order_id)
      .maybeSingle();

    if (order?.promotion_code) {
      await countPromotionRedemption(order.promotion_code);
    }
  }

  return true;
}

/** Mark a payment failed, cancel its order, and release the stock it held. */
export async function failPayment(
  reference: string,
  reason: string,
  status: Extract<PaymentStatusDb, "failed" | "abandoned"> = "failed"
): Promise<boolean> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("fail_payment", {
    p_reference: reference,
    p_reason: reason,
    p_status: status,
  });

  if (error) {
    console.error("[payments] fail failed:", error);
    return false;
  }

  return Boolean(data);
}

/**
 * Check what a provider says against what we recorded, then settle or fail.
 *
 * The amount comparison is the point of this function. A verified `success`
 * proves the transaction is real, not that it is the transaction we asked for
 * — a reference reused against a smaller charge, or an order whose total moved
 * between initialisation and payment, both surface as an underpayment here and
 * neither should confirm an order.
 */
export async function reconcileVerification(input: {
  reference: string;
  providerReference: string | null;
  status: "success" | "failed" | "abandoned" | "pending";
  amount: number | null;
  currency: string | null;
  reason?: string | null;
}): Promise<PaymentOutcome> {
  const payment = await getPaymentByReference(input.reference);
  if (!payment) return { state: "unknown" };

  if (payment.status === "succeeded") return { state: "paid", payment };
  if (payment.status === "failed" || payment.status === "abandoned") {
    return { state: "failed", payment, reason: payment.failure_reason };
  }

  if (input.status === "pending") return { state: "pending", payment };

  if (input.status !== "success") {
    await failPayment(
      input.reference,
      input.reason ?? "The payment was not completed."
    );
    return {
      state: "failed",
      payment,
      reason: input.reason ?? "The payment was not completed.",
    };
  }

  const underpaid =
    input.amount !== null && input.amount < payment.charge_amount;
  const wrongCurrency =
    input.currency !== null &&
    input.currency.toUpperCase() !== payment.charge_currency.toUpperCase();

  if (underpaid || wrongCurrency) {
    const reason = `Amount mismatch: expected ${payment.charge_amount} ${payment.charge_currency}, got ${input.amount} ${input.currency}.`;
    console.error(`[payments] ${input.reference} — ${reason}`);
    await failPayment(input.reference, "The amount paid did not match the order.");
    return { state: "failed", payment, reason: "Amount mismatch." };
  }

  const settled = await settlePayment(
    input.reference,
    input.providerReference,
    input.amount
  );

  return {
    state: "paid",
    payment: (await getPaymentByReference(input.reference)) ?? payment,
    firstSettlement: settled,
  };
}

export type PaymentOutcome =
  | { state: "unknown" }
  | { state: "pending"; payment: PaymentRow }
  | { state: "paid"; payment: PaymentRow; firstSettlement?: boolean }
  | { state: "failed"; payment: PaymentRow; reason?: string | null };

/* ---------------------------------------------------------------- events */

/**
 * Record a webhook delivery, or report that it is a replay.
 *
 * Returns false when this event has been seen before. Both providers deliver
 * at-least-once and will retry for hours after a 500, so every handler runs
 * this first and does nothing on false — the unique index on
 * (provider, event_id) is what makes the check atomic between instances.
 */
export async function recordEvent(input: {
  provider: PaymentProviderDb;
  eventId: string;
  eventType: string;
  paymentId?: string | null;
  payload: unknown;
}): Promise<boolean> {
  const supabase = createAdminClient();

  const { error } = await supabase.from("payment_events").insert({
    provider: input.provider,
    event_id: input.eventId,
    event_type: input.eventType,
    payment_id: input.paymentId ?? null,
    payload: input.payload as Record<string, unknown>,
  });

  if (error) {
    // 23505 — unique violation, i.e. a duplicate delivery. Anything else is a
    // real failure, and is worth failing the webhook over so it is retried.
    if (error.code === "23505") return false;
    console.error("[payments] event insert failed:", error);
    throw new PaymentError("Could not record the event.");
  }

  return true;
}

/**
 * Un-record an event whose processing failed.
 *
 * The dedup row is written before any side effect, which is what makes the
 * guard atomic — but it also means a handler that then fails and returns 500
 * would see its own row on the provider's retry, call it a duplicate, and
 * drop the delivery for good. For M-Pesa that is the only notification that
 * money moved.
 *
 * So a handler that cannot complete forgets the event on its way out, and the
 * retry starts clean.
 */
export async function forgetEvent(
  provider: PaymentProviderDb,
  eventId: string
): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase
      .from("payment_events")
      .delete()
      .eq("provider", provider)
      .eq("event_id", eventId);
  } catch (error) {
    console.error("[payments] could not forget the event:", error);
  }
}

export { convertForCharge } from "./currency";
