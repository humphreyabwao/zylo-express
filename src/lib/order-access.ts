import "server-only";

import { cookies } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Who may see an order's confirmation.
 *
 * Guest checkout has no session to check an order against, and an order
 * reference is a support-desk identifier rather than a secret — six characters
 * from a 32-glyph alphabet is roughly a billion, which is plenty to avoid
 * collisions and not enough to resist enumeration.
 *
 * So entitlement is an httpOnly cookie holding the order's uuid, written the
 * moment a payment verifies. Script cannot read or forge it, it expires within
 * the hour, and because every provider return lands back on this origin it
 * survives the round trip through Paystack or PayPal.
 *
 * Signed-in customers do not depend on it: `/account/orders` reads their
 * history through RLS, which is the durable path.
 */

const COOKIE = "zylo.order";
const MAX_AGE_SECONDS = 60 * 60;

/** Grant access and return the order's human reference for the redirect. */
export async function grantOrderAccess(
  // Nullable since `payments` grew a `sale_id`: a counter sale has no order to
  // grant access to, and the confirmation page it would lead to does not exist
  // for one. Callers on the checkout path always pass an id.
  orderId: string | null
): Promise<string | null> {
  if (!orderId) return null;

  const store = await cookies();

  store.set(COOKIE, orderId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("orders")
    .select("reference")
    .eq("id", orderId)
    .maybeSingle();

  return data?.reference ?? null;
}

/** The order id this browser is entitled to, if any. */
export async function readOrderAccess(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE)?.value ?? null;
}
