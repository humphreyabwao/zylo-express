import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * Release the stock held by checkouts nobody finished.
 *
 * Every redirect flow leaks abandoned attempts — a closed tab on Paystack's
 * page, an M-Pesa prompt left to time out. Each one holds its units in a
 * `pending` order forever, and on a limited run that quietly makes the last
 * piece unbuyable. This sweeps them.
 *
 * Schedule it every few minutes. On Vercel, add to vercel.json:
 *
 *   { "crons": [{ "path": "/api/payments/expire", "schedule": "*\/5 * * * *" }] }
 *
 * Vercel signs cron invocations with CRON_SECRET; the same header works for
 * any external scheduler. With no secret set the route refuses to run rather
 * than exposing a cancel-orders button to the internet.
 */

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 503 }
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ expired: 0, skipped: "supabase-unconfigured" });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("expire_pending_payments");

  if (error) {
    console.error("[payments] expiry sweep failed:", error);
    return NextResponse.json({ error: "Sweep failed." }, { status: 500 });
  }

  return NextResponse.json({ expired: data ?? 0 });
}
