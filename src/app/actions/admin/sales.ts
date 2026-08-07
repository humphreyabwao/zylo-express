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
import type { SaleRow } from "@/lib/supabase/types";

/**
 * Sale state changes.
 *
 * Approving and cancelling both go through an RPC rather than an update from
 * here, because both move stock as well as status. `cancel_sale` puts every
 * line back on the shelf; `approve_sale` takes it off again when a cancelled
 * sale is reinstated, and refuses if the units have since sold. Doing that as
 * separate statements from a Server Action would leave a voided sale whose
 * stock never returned the moment anything failed between them.
 *
 * Both require an elevated account. Voiding a sale rewrites the day's takings
 * and moves inventory, which is not the same authority as ringing one up.
 */

export interface SaleActionResult {
  ok: boolean;
  message: string;
  sale?: SaleRow;
}

async function authorise(): Promise<SaleActionResult | null> {
  try {
    await requireAdminAction({ elevated: true, module: "sales" });
    return null;
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

/** Drop the caches a change in takings or stock invalidates. */
function done(): void {
  void invalidateTags([CacheTags.products]);
  revalidatePath("/admin/sales");
  revalidatePath("/admin/pos");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
}

const idSchema = z.object({ saleId: z.string().uuid("Unknown sale.") });

const cancelSchema = idSchema.extend({
  reason: z.string().trim().max(240, "Keep the reason under 240 characters.").optional(),
});

/* ---------------------------------------------------------------- approve */

export async function approveSale(input: unknown): Promise<SaleActionResult> {
  const refusal = await authorise();
  if (refusal) return refusal;

  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Unknown sale." };

  const supabase = await createOperatorClient();

  const { data, error } = await supabase.rpc("approve_sale", {
    p_sale_id: parsed.data.saleId,
  });

  if (error) {
    console.error(`[admin] approve sale failed: ${describeError(error)}`);
    return {
      ok: false,
      // The RPC raises a readable message for the two cases an operator can
      // actually hit — already completed, and not enough stock to reinstate.
      message: refusalMessage(error, error.message || "Could not approve that sale."),
    };
  }

  done();
  return {
    ok: true,
    message: "Sale approved.",
    sale: data as unknown as SaleRow,
  };
}

/* ----------------------------------------------------------------- cancel */

export async function cancelSale(input: unknown): Promise<SaleActionResult> {
  const refusal = await authorise();
  if (refusal) return refusal;

  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Unknown sale.",
    };
  }

  const supabase = await createOperatorClient();

  const { data, error } = await supabase.rpc("cancel_sale", {
    p_sale_id: parsed.data.saleId,
    p_reason: parsed.data.reason ?? "",
  });

  if (error) {
    console.error(`[admin] cancel sale failed: ${describeError(error)}`);
    return {
      ok: false,
      message: refusalMessage(error, error.message || "Could not cancel that sale."),
    };
  }

  done();
  return {
    ok: true,
    message: "Sale cancelled and stock returned.",
    sale: data as unknown as SaleRow,
  };
}
