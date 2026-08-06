import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { failPayment } from "@/lib/payments";

/**
 * The customer backed out on PayPal's approval page.
 *
 * Releasing the stock here rather than waiting for the expiry sweep is the
 * whole point of the route: someone who cancels is usually about to try
 * another method, and they should not be blocked by the units their own
 * abandoned attempt is still holding.
 *
 * `abandoned`, not `failed` — nothing was declined.
 */

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const reference = searchParams.get("reference");

  if (reference) {
    await failPayment(reference, "Cancelled at PayPal.", "abandoned");
  }

  return NextResponse.redirect(
    new URL("/checkout?payment=cancelled", env.siteUrl)
  );
}
