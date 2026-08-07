import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { requireAdmin } from "@/lib/admin/guard";
import { listPosItems } from "@/lib/admin/queries";
import { EmptyState, PageHeader, Panel } from "@/components/admin/primitives";
import { RealtimeRefresh } from "@/components/admin/realtime-refresh";
import { PosTerminal } from "@/components/admin/pos-terminal";
import { isProviderLive } from "@/lib/payments/credentials";

export const metadata = { title: "Point of sale" };

export default async function AdminPosPage() {
  await requireAdmin("pos");

  // Whether card and M-Pesa actually charge, or are only labels on a sale
  // settled some other way. A server fact — it depends on stored credentials,
  // which never reach the browser.
  const [items, paystackReady] = await Promise.all([
    listPosItems(),
    isProviderLive("paystack"),
  ]);

  return (
    <>
      <PageHeader title="Point of sale">
        {/* Stock moves under the till whenever the shop sells online, so the
            counter needs to see that rather than a figure from page load. */}
        <RealtimeRefresh channel="inventory" />
        <Link
          href="/admin/sales"
          className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-admin-muted transition-colors hover:text-admin-fg"
        >
          Sales
          <ArrowUpRight className="size-3.5" strokeWidth={2} />
        </Link>
      </PageHeader>

      {items.length === 0 ? (
        <Panel>
          <EmptyState
            title="Nothing to sell"
            description="The till reads product variants. Add a product with at least one variant first."
          />
        </Panel>
      ) : (
        <PosTerminal items={items} paystackReady={paystackReady} />
      )}
    </>
  );
}
