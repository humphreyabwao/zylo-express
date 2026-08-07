"use server";

import { AdminAuthorizationError, requireAdminAction } from "@/lib/admin/guard";
import { getSaleDetail, type SaleItemRow } from "@/lib/admin/queries";

/**
 * The lines of one sale, fetched when the view drawer opens.
 *
 * Kept out of the list query on purpose: a page of twenty sales carries a
 * hundred-odd line items and almost none are ever looked at, so shipping them
 * with every row would pay for the exception on every request.
 *
 * A read rather than a mutation, but a Server Action rather than a route
 * handler because it is only ever called from a component that already has the
 * sale id — an action keeps the type across the boundary and the module guard
 * in one place.
 */
export async function getSaleLines(
  saleId: string
): Promise<SaleItemRow[] | null> {
  try {
    await requireAdminAction({ module: "sales" });
  } catch (error) {
    if (error instanceof AdminAuthorizationError) return null;
    throw error;
  }

  const sale = await getSaleDetail(saleId);
  return sale?.items ?? null;
}
