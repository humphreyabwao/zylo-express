"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Ban, CheckCircle2, Eye, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { approveSale, cancelSale } from "@/app/actions/admin/sales";
import { getSaleLines } from "@/app/actions/admin/sale-lines";
import type { SaleItemRow, SaleListRow } from "@/lib/admin/queries";
import { Money } from "@/components/admin/admin-currency";
import { AdminButton } from "@/components/admin/primitives";
import { MenuItem, MenuSeparator, RowMenu } from "@/components/admin/row-menu";
import {
  ConfirmDialog,
  Field,
  Modal,
  ModalBody,
  ModalFooter,
  inputClass,
} from "@/components/admin/modal";
import {
  SALE_METHOD_LABEL,
  SALE_STATUS_LABEL,
} from "@/lib/admin/status";

/**
 * Row actions for a till sale.
 *
 * The lines are fetched when the drawer opens rather than shipped with every
 * row: a page of twenty sales carries a hundred-odd line items, and almost
 * none of them are ever looked at.
 */

const STAMP = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

type Busy = null | "approve" | "cancel";

export function SaleActions({
  sale,
  canElevate,
}: {
  sale: SaleListRow;
  /** Approving and cancelling move stock, so they need an administrator. */
  canElevate: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<Busy>(null);
  const [viewing, setViewing] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);

  const run = async (
    kind: Busy,
    work: () => Promise<{ ok: boolean; message: string }>
  ) => {
    setBusy(kind);
    try {
      const result = await work();
      if (result.ok) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
      return result;
    } finally {
      setBusy(null);
    }
  };

  const cancelled = sale.status === "cancelled";

  return (
    <>
      <RowMenu label={`Actions for ${sale.reference}`} busy={busy !== null}>
        {(close) => (
          <>
            <MenuItem
              icon={Eye}
              label="View sale"
              onClick={() => {
                close();
                setViewing(true);
              }}
            />
            <MenuItem
              icon={Printer}
              label="Print receipt"
              onClick={() => {
                close();
                setViewing(true);
                // The drawer has to be mounted and its lines loaded before the
                // print dialog can have anything to show, so printing is a
                // button inside it rather than something fired from here.
              }}
            />

            {canElevate && (
              <>
                <MenuSeparator />

                <MenuItem
                  icon={CheckCircle2}
                  label={cancelled ? "Reinstate sale" : "Approve sale"}
                  disabled={sale.status === "completed"}
                  onClick={() => {
                    close();
                    void run("approve", () => approveSale({ saleId: sale.id }));
                  }}
                />

                <MenuItem
                  icon={Ban}
                  label="Cancel sale"
                  tone="danger"
                  disabled={cancelled}
                  onClick={() => {
                    close();
                    setCancelling(true);
                  }}
                />
              </>
            )}
          </>
        )}
      </RowMenu>

      {viewing && (
        <SaleDrawer sale={sale} onClose={() => setViewing(false)} />
      )}

      {cancelling && (
        <CancelDialog
          sale={sale}
          onClose={() => setCancelling(false)}
          onConfirm={async (reason) => {
            const result = await run("cancel", () =>
              cancelSale({ saleId: sale.id, reason })
            );
            return result.ok;
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ drawer */

function SaleDrawer({
  sale,
  onClose,
}: {
  sale: SaleListRow;
  onClose: () => void;
}) {
  const [items, setItems] = React.useState<SaleItemRow[] | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let live = true;

    getSaleLines(sale.id)
      .then((result) => {
        if (!live) return;
        if (result) setItems(result);
        else setFailed(true);
      })
      .catch(() => live && setFailed(true));

    return () => {
      live = false;
    };
  }, [sale.id]);

  return (
    <Modal title={sale.reference} size="lg" onClose={onClose}>
      <ModalBody>
        {/* `data-receipt` is what the print stylesheet keeps; everything else
            on the page is hidden. Same mechanism the till uses. */}
        <div data-receipt className="space-y-5">
          <div className="hidden text-center print:block">
            <p className="text-lg font-semibold">ZYLO Express</p>
            <p className="text-[0.75rem]">{sale.reference}</p>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[0.8125rem]">
            <Detail label="Status" value={SALE_STATUS_LABEL[sale.status] ?? sale.status} />
            <Detail label="Taken" value={STAMP.format(new Date(sale.created_at))} />
            <Detail label="Operator" value={sale.operator_name || "—"} />
            <Detail
              label="Payment"
              value={SALE_METHOD_LABEL[sale.payment_method] ?? sale.payment_method}
            />
            <Detail label="Customer" value={sale.customer_name || "Walk-in"} />
            {sale.customer_email && (
              <Detail label="Email" value={sale.customer_email} />
            )}
          </dl>

          {sale.status === "cancelled" && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.75rem] leading-relaxed text-destructive">
              Cancelled
              {sale.cancelled_at
                ? ` on ${STAMP.format(new Date(sale.cancelled_at))}`
                : ""}
              . Stock was returned to inventory.
              {sale.cancel_reason ? ` Reason: ${sale.cancel_reason}` : ""}
            </p>
          )}

          <div className="border-t border-admin-line pt-4">
            <p className="mb-2.5 text-[0.75rem] font-semibold text-admin-fg">
              Items sold
            </p>

            {failed ? (
              <p className="text-[0.8125rem] text-admin-muted">
                Could not load the lines for this sale.
              </p>
            ) : !items ? (
              <p className="flex items-center gap-2 text-[0.8125rem] text-admin-muted">
                <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
                Loading…
              </p>
            ) : items.length === 0 ? (
              <p className="text-[0.8125rem] text-admin-muted">
                This sale has no recorded lines.
              </p>
            ) : (
              <ul className="divide-y divide-admin-line">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-[0.8125rem] font-medium text-admin-fg">
                        {item.product_name}
                      </p>
                      <p className="mt-0.5 text-[0.6875rem] text-admin-faint">
                        {[item.variant_title, item.sku]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="admin-figure text-[0.8125rem]">
                        {item.quantity} ×{" "}
                        <Money amount={item.unit_price} />
                      </p>
                      <p className="admin-figure mt-0.5 text-[0.8125rem] font-semibold">
                        <Money amount={item.line_total} />
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <dl className="space-y-1.5 border-t border-admin-line pt-4 text-[0.8125rem]">
            <Total label="Subtotal" amount={sale.subtotal} />
            {sale.discount > 0 && (
              <Total label="Discount" amount={-sale.discount} />
            )}
            <div className="flex items-center justify-between border-t border-admin-line pt-2 text-[0.9375rem] font-semibold">
              <dt>Total</dt>
              <dd className="admin-figure">
                <Money amount={sale.total} />
              </dd>
            </div>
            {sale.tendered !== null && (
              <>
                <Total label="Tendered" amount={sale.tendered} />
                <Total
                  label="Change"
                  amount={Math.max(0, sale.tendered - sale.total)}
                 
                />
              </>
            )}
          </dl>

          {sale.note && (
            <p className="border-t border-admin-line pt-4 text-[0.75rem] leading-relaxed text-admin-muted">
              {sale.note}
            </p>
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <AdminButton variant="secondary" onClick={onClose}>
          Close
        </AdminButton>
        <AdminButton onClick={() => window.print()} disabled={!items}>
          <Printer className="size-3.5" strokeWidth={2} />
          Print receipt
        </AdminButton>
      </ModalFooter>
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.6875rem] uppercase tracking-[0.14em] text-admin-faint">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-admin-fg">{value}</dd>
    </div>
  );
}

function Total({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-center justify-between text-admin-muted">
      <dt>{label}</dt>
      <dd className="admin-figure">
        <Money amount={amount} />
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ cancel */

function CancelDialog({
  sale,
  onClose,
  onConfirm,
}: {
  sale: SaleListRow;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<boolean>;
}) {
  const [reason, setReason] = React.useState("");

  return (
    <ConfirmDialog
      title="Cancel sale"
      confirmLabel="Cancel sale"
      busyLabel="Cancelling…"
      onClose={onClose}
      onConfirm={() => onConfirm(reason)}
    >
      <p>
        This voids <strong>{sale.reference}</strong> and puts every item back
        into stock. The sale stays on the ledger marked cancelled rather than
        disappearing, so the day still reconciles.
      </p>

      <Field label="Reason" hint="Optional, kept on the record">
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Rung up twice"
          maxLength={240}
          className={cn(inputClass(false), "mt-1")}
        />
      </Field>
    </ConfirmDialog>
  );
}
