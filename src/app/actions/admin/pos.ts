"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  AdminAuthorizationError,
  createOperatorClient,
  requireAdminAction,
} from "@/lib/admin/guard";
import { CacheTags, invalidateTags } from "@/lib/cache";
import { refusalMessage } from "@/lib/admin/errors";
import type { SaleRow } from "@/lib/supabase/types";

/**
 * Point of sale.
 *
 * ## Prices are never taken from the payload
 *
 * The till sends variant ids and quantities. Everything else — unit price, line
 * total, subtotal — is computed inside `record_sale` from the rows themselves.
 * A till that trusts a client-sent price is a till that can be told to charge
 * nothing, and this one is reachable by anyone who can sign in as staff.
 *
 * ## One transaction
 *
 * Writing the sale, its lines and the stock decrement are a single RPC. Done as
 * separate statements from here, a failure halfway leaves either a sale whose
 * stock never moved or stock that moved for a sale nobody recorded — and
 * neither is recoverable from behind a counter.
 */

export interface PosResult {
  ok: boolean;
  message: string;
  sale?: SaleRow;
  fieldErrors?: Record<string, string>;
}

async function authorise() {
  return requireAdminAction({ module: "pos" });
}

const saleSchema = z.object({
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.number().int().min(1, "Quantity must be at least one.").max(999),
      })
    )
    .min(1, "Add something to the sale first.")
    .max(100, "That is more lines than one sale should carry."),
  customerName: z.string().trim().max(120).optional().default(""),
  customerEmail: z
    .string()
    .trim()
    .max(200)
    .optional()
    .default("")
    .refine(
      (value) => value === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
      "That does not look like an email address."
    ),
  paymentMethod: z.enum(["cash", "card", "mpesa", "other"]),
  /** Base minor units. Validated against the subtotal inside the RPC. */
  discount: z.number().int().min(0).max(100_000_000).optional().default(0),
  tendered: z.number().int().min(0).max(100_000_000).nullable().optional().default(null),
  note: z.string().trim().max(500).optional().default(""),
  /**
   * Write the sale as `pending` because a Paystack charge is about to be
   * started against it.
   *
   * The stock still comes off now — the goods are spoken for either way, and
   * holding them is the point. What is deferred is whether the sale counts as
   * takings, which `settle_payment` decides when the provider confirms.
   */
  awaitPayment: z.boolean().optional().default(false),
});

export async function recordSale(input: unknown): Promise<PosResult> {
  let identity;
  try {
    identity = await authorise();
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the sale.",
      fieldErrors,
    };
  }

  const operatorName =
    [identity.profile.first_name, identity.profile.last_name]
      .filter(Boolean)
      .join(" ") || identity.profile.email;

  const supabase = await createOperatorClient();

  const { data, error } = await supabase.rpc("record_sale", {
    p_operator_name: operatorName,
    p_customer_name: parsed.data.customerName || null,
    p_customer_email: parsed.data.customerEmail || null,
    p_payment_method: parsed.data.paymentMethod,
    p_discount: parsed.data.discount,
    p_tendered:
      parsed.data.paymentMethod === "cash" ? parsed.data.tendered : null,
    p_note: parsed.data.note,
    p_items: parsed.data.items,
    // Cash and "other" are settled at the counter. A sale about to be charged
    // through Paystack is not settled until the provider says so.
    p_status: parsed.data.awaitPayment ? "pending" : "completed",
  });

  if (error) {
    console.error("[pos] sale failed:", error);

    // The RPC raises with sentences meant to be read at a counter — "Not
    // enough stock for ZY-1234" — so they are surfaced rather than replaced.
    // Anything else gets the generic message.
    const raised = /stock|catalogue|quantity|discount|line/i.test(error.message ?? "");
    return {
      ok: false,
      message: raised
        ? error.message
        : refusalMessage(error, "Could not record that sale."),
    };
  }

  // Stock moved, so every catalogue view that shows availability is stale.
  await invalidateTags([CacheTags.products, CacheTags.facets]);
  revalidatePath("/admin/pos");
  revalidatePath("/admin/sales");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");

  return {
    ok: true,
    message: `Sale ${(data as SaleRow).reference} recorded.`,
    sale: data as SaleRow,
  };
}
