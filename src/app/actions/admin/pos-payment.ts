"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  AdminAuthorizationError,
  createOperatorClient,
  requireAdminAction,
} from "@/lib/admin/guard";
import { CacheTags, invalidateTags } from "@/lib/cache";
import { describeError, refusalMessage } from "@/lib/admin/errors";
import {
  PaymentError,
  getPaymentByReference,
  reconcileVerification,
  startPayment,
} from "@/lib/payments";
import { verifyTransaction } from "@/lib/payments/paystack";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SaleRow } from "@/lib/supabase/types";

/**
 * Paystack at the counter.
 *
 * The same pathway the website uses — `startPayment`, the same `payments` row,
 * the same webhook and the same verify — pointed at a sale instead of an
 * order. Nothing here re-implements Paystack; it decides what a till does
 * around it.
 *
 * ## The order of operations, and why
 *
 * The sale is written *first*, as `pending`, which takes the stock. Then the
 * charge starts. Doing it the other way — take the money, then write the sale
 * — leaves a customer debited with nothing in the database when anything
 * fails between the two, and behind a counter that is unrecoverable.
 *
 * Writing it pending rather than completed is the difference between "goods
 * are spoken for" and "this counts as takings". The stock still comes off
 * immediately, because the alternative is selling the last unit twice while a
 * prompt sits unanswered on somebody's handset.
 *
 * ## Two flows
 *
 *   mpesa  an STK push to the customer's own phone. They enter their PIN;
 *          the till polls until Paystack confirms.
 *   card   a hosted Paystack page. At a counter there is nobody to redirect,
 *          so the till shows the link as a QR the customer opens on their own
 *          phone — which also keeps card entry off the shop's device
 *          entirely, exactly as the website keeps it off this origin.
 */

export interface ChargeResult {
  ok: boolean;
  message: string;
  sale?: SaleRow;
  /** Our payment reference — what the till polls on. */
  reference?: string;
  /** M-Pesa: Paystack's own instruction copy, shown while waiting. */
  displayText?: string;
  /** M-Pesa: the handset the prompt went to, in E.164. */
  phone?: string;
  /** Card: the hosted page to show as a link and a QR. */
  url?: string;
}

const chargeSchema = z.object({
  saleId: z.string().uuid("Unknown sale."),
  method: z.enum(["mpesa", "card"]),
  /** Required for M-Pesa. Normalised inside the payments layer. */
  phone: z.string().trim().max(20).optional(),
  /**
   * Paystack requires an email on every transaction. A counter customer
   * usually has not given one, so the till falls back to a shop address.
   */
  email: z.string().trim().max(200).optional(),
});

async function authorise(): Promise<ChargeResult | null> {
  try {
    await requireAdminAction({ module: "pos" });
    return null;
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

const FALLBACK_EMAIL = "till@zylo.express";

/* ----------------------------------------------------------------- charge */

export async function chargeSale(input: unknown): Promise<ChargeResult> {
  const refusal = await authorise();
  if (refusal) return refusal;

  const parsed = chargeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the payment details.",
    };
  }

  const { saleId, method, phone, email } = parsed.data;

  if (method === "mpesa" && !phone) {
    return { ok: false, message: "Enter the customer's M-Pesa number." };
  }

  const supabase = await createOperatorClient();

  const { data: sale, error } = await supabase
    .from("sales")
    .select("*")
    .eq("id", saleId)
    .maybeSingle();

  if (error) {
    console.error(`[pos] could not load sale to charge: ${describeError(error)}`);
    return { ok: false, message: refusalMessage(error, "Could not find that sale.") };
  }
  if (!sale) return { ok: false, message: "Could not find that sale." };

  // Charging a sale that is already settled would take the money twice.
  if (sale.status !== "pending") {
    return {
      ok: false,
      message:
        sale.status === "completed"
          ? "That sale is already paid."
          : "That sale was cancelled.",
    };
  }

  try {
    const started = await startPayment({
      saleId: sale.id,
      orderReference: sale.reference,
      email: email?.trim() || sale.customer_email || FALLBACK_EMAIL,
      amount: sale.total,
      method,
      phone,
    });

    revalidatePath("/admin/sales");

    if (started.kind === "mpesa-prompt") {
      return {
        ok: true,
        message: "Prompt sent.",
        reference: started.reference,
        displayText: started.displayText,
        phone: started.phone,
      };
    }

    return {
      ok: true,
      message: "Payment link ready.",
      reference: started.reference,
      url: started.url,
    };
  } catch (cause) {
    if (cause instanceof PaymentError) {
      return { ok: false, message: cause.message };
    }
    console.error("[pos] charge failed:", cause);
    return { ok: false, message: "Could not start that payment." };
  }
}

/* ------------------------------------------------------------------- poll */

export interface PollResult {
  /** `pending` means keep polling. */
  state: "pending" | "paid" | "failed";
  message?: string;
  sale?: SaleRow;
}

/**
 * Ask Paystack what happened, then reconcile.
 *
 * The webhook is the authority and usually lands first, but a till cannot wait
 * on somebody else's network — so this verifies directly and reconciles the
 * same way. `settle_payment` and `fail_payment` are both guarded on the
 * payment still being unsettled, so whichever of the two paths arrives second
 * is a no-op rather than a double settlement.
 */
export async function pollSalePayment(reference: string): Promise<PollResult> {
  const refusal = await authorise();
  if (refusal) return { state: "failed", message: refusal.message };

  if (typeof reference !== "string" || !reference) {
    return { state: "failed", message: "Unknown payment." };
  }

  const payment = await getPaymentByReference(reference);
  if (!payment) return { state: "failed", message: "Unknown payment." };

  // Already settled by the webhook, which usually beats this.
  if (payment.status === "succeeded") return settled(payment.sale_id);
  if (payment.status === "failed" || payment.status === "abandoned") {
    return {
      state: "failed",
      message: payment.failure_reason ?? "That payment did not go through.",
    };
  }

  let verification: Awaited<ReturnType<typeof verifyTransaction>>;
  try {
    verification = await verifyTransaction(reference);
  } catch {
    // Paystack unreachable. Not a failed payment — keep the till polling.
    return { state: "pending" };
  }

  // Paystack reports an unfinished mobile-money charge as `ongoing`; treat it
  // and `pending` alike, or an STK prompt still on the handset is written off
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
      return settled(outcome.payment.sale_id);
    case "failed":
      // `fail_payment` has already cancelled the sale and put the stock back,
      // so the till's stock counts are stale too.
      await refresh();
      return {
        state: "failed",
        message: outcome.reason ?? "That payment did not go through.",
      };
    case "pending":
      return { state: "pending" };
    default:
      return { state: "failed", message: "That payment could not be confirmed." };
  }
}

async function refresh(): Promise<void> {
  await invalidateTags([CacheTags.products, CacheTags.facets]);
  revalidatePath("/admin/sales");
  revalidatePath("/admin/pos");
  revalidatePath("/admin");
}

async function settled(saleId: string | null): Promise<PollResult> {
  await refresh();
  return {
    state: "paid",
    sale: saleId ? await readSale(saleId) : undefined,
    message: "Payment received.",
  };
}

/**
 * Read back with the service client.
 *
 * The sale was moved by a SECURITY DEFINER function reacting to the provider,
 * and this is a read of the row that function just wrote — not an action taken
 * on the operator's behalf.
 */
async function readSale(saleId: string): Promise<SaleRow | undefined> {
  const { data } = await createAdminClient()
    .from("sales")
    .select("*")
    .eq("id", saleId)
    .maybeSingle();

  return (data as SaleRow | null) ?? undefined;
}

/* ----------------------------------------------------------------- cancel */

/** Abandon an unanswered prompt: fails the payment, which voids the sale. */
export async function abandonSalePayment(
  reference: string
): Promise<{ ok: boolean; message: string }> {
  const refusal = await authorise();
  if (refusal) return { ok: false, message: refusal.message };

  const { failPayment } = await import("@/lib/payments");
  await failPayment(reference, "Cancelled at the till.");

  await invalidateTags([CacheTags.products, CacheTags.facets]);
  revalidatePath("/admin/sales");
  revalidatePath("/admin/pos");

  return { ok: true, message: "Payment cancelled and stock returned." };
}
