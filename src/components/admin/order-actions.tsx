"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  Check,
  Eye,
  Loader2,
  MapPin,
  Printer,
  Trash2,
  Truck,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  addTrackingEvent,
  cancelOrder,
  deleteOrder,
  getOrder,
  setOrderStatus,
  setOrderTracking,
} from "@/app/actions/admin/orders";
import type { OrderDetail, OrderListRow } from "@/lib/admin/queries";
import {
  ORDER_ROUTINE_STATUSES,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
} from "@/lib/admin/status";
import { Money } from "@/components/admin/admin-currency";
import { AdminButton, Badge } from "@/components/admin/primitives";
import { MenuItem, MenuSeparator, RowMenu } from "@/components/admin/row-menu";
import {
  ConfirmDialog,
  Field,
  Modal,
  ModalBody,
  ModalFooter,
  Toggle,
  inputClass,
} from "@/components/admin/modal";
import type { OrderStatusDb } from "@/lib/supabase/types";

/**
 * Row actions for a website order.
 *
 * Deliberately the same shape as `sale-actions.tsx` — a portalled row menu, a
 * detail drawer that fetches its lines on open, and confirm dialogs for
 * anything destructive. An operator who has learnt the till's Sales screen
 * should not have to learn a second set of gestures for Orders.
 *
 * ## What is different from a sale
 *
 * A sale is finished the moment it is rung up; an order has a life. So this
 * carries a status control the sales row has no use for, and a tracking dialog,
 * and everything it changes is visible to a customer on `/account/orders` —
 * which is why the wording in these dialogs says so rather than treating the
 * portal as a private ledger.
 */

const STAMP = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

type Busy = null | "status" | "cancel" | "delete" | "tracking" | "checkpoint";

/**
 * Shows a green toast for the action and a separate warning when the email did
 * not go out.
 *
 * Two toasts rather than one hedged sentence: the status change *did* happen,
 * and folding "but email failed" into its message makes a completed action read
 * as a failed one. The warning names the reason, which is usually actionable —
 * no key saved, sandbox sender, Resend down.
 */
function report(result: {
  ok: boolean;
  message: string;
  emailNote?: string;
}): void {
  if (!result.ok) {
    toast.error(result.message);
    return;
  }

  toast.success(result.message);
  if (result.emailNote) {
    toast.warning("The customer was not emailed.", {
      description: result.emailNote,
      duration: 8000,
    });
  }
}

export function OrderActions({
  order,
  canElevate,
}: {
  order: OrderListRow;
  /** Cancelling, refunding and deleting all need an administrator. */
  canElevate: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<Busy>(null);
  const [viewing, setViewing] = React.useState(false);
  const [tracking, setTracking] = React.useState(false);
  const [checkpoint, setCheckpoint] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const run = async (
    kind: Busy,
    work: () => Promise<{ ok: boolean; message: string; emailNote?: string }>
  ) => {
    setBusy(kind);
    try {
      const result = await work();
      report(result);
      if (result.ok) router.refresh();
      return result;
    } finally {
      setBusy(null);
    }
  };

  const cancelled = order.status === "cancelled";

  return (
    <>
      <RowMenu label={`Actions for ${order.reference}`} busy={busy !== null}>
        {(close) => (
          <>
            <MenuItem
              icon={Eye}
              label="View order"
              onClick={() => {
                close();
                setViewing(true);
              }}
            />

            <MenuItem
              icon={MapPin}
              label="Add checkpoint"
              onClick={() => {
                close();
                setCheckpoint(true);
              }}
            />

            <MenuItem
              icon={Truck}
              label={order.tracking_number || order.tracking_url ? "Edit tracking" : "Add tracking"}
              onClick={() => {
                close();
                setTracking(true);
              }}
            />

            <MenuSeparator />

            {/* The forward path, as one click each. A submenu would hide the
                single most common action on this screen behind a hover. */}
            {ORDER_ROUTINE_STATUSES.map((status) => (
              <MenuItem
                key={status}
                icon={Check}
                label={`Mark ${ORDER_STATUS_LABEL[status].toLowerCase()}`}
                disabled={order.status === status}
                onClick={() => {
                  close();
                  void run("status", () =>
                    setOrderStatus({ orderId: order.id, status })
                  );
                }}
              />
            ))}

            {canElevate && (
              <>
                <MenuSeparator />

                <MenuItem
                  icon={Ban}
                  label={cancelled ? "Reinstate order" : "Cancel order"}
                  tone={cancelled ? "default" : "danger"}
                  onClick={() => {
                    close();
                    if (cancelled) {
                      // Reinstating re-reserves stock and can be refused, so it
                      // goes through the same action rather than a bare update.
                      void run("status", () =>
                        setOrderStatus({ orderId: order.id, status: "confirmed" })
                      );
                    } else {
                      setCancelling(true);
                    }
                  }}
                />

                <MenuItem
                  icon={Ban}
                  label="Mark refunded"
                  disabled={order.status === "refunded"}
                  tone="danger"
                  onClick={() => {
                    close();
                    void run("status", () =>
                      setOrderStatus({ orderId: order.id, status: "refunded" })
                    );
                  }}
                />

                <MenuItem
                  icon={Trash2}
                  label="Delete order"
                  tone="danger"
                  // `delete_order` refuses a settled order outright. Showing the
                  // item disabled says why it cannot be done; hiding it would
                  // leave an operator hunting for an action that is simply not
                  // available for this row.
                  disabled={order.paid}
                  onClick={() => {
                    close();
                    setDeleting(true);
                  }}
                />
              </>
            )}
          </>
        )}
      </RowMenu>

      {viewing && (
        <OrderDrawer order={order} onClose={() => setViewing(false)} />
      )}

      {checkpoint && (
        <CheckpointDialog
          order={order}
          canElevate={canElevate}
          onClose={() => setCheckpoint(false)}
          onSave={async (values) => {
            const result = await run("checkpoint", () =>
              addTrackingEvent({ orderId: order.id, ...values })
            );
            return result.ok;
          }}
        />
      )}

      {tracking && (
        <TrackingDialog
          order={order}
          onClose={() => setTracking(false)}
          onSave={async (values) => {
            const result = await run("tracking", () =>
              setOrderTracking({ orderId: order.id, ...values })
            );
            return result.ok;
          }}
        />
      )}

      {cancelling && (
        <CancelDialog
          order={order}
          onClose={() => setCancelling(false)}
          onConfirm={async (reason) => {
            const result = await run("cancel", () =>
              cancelOrder({ orderId: order.id, reason })
            );
            return result.ok;
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete order"
          confirmLabel="Delete order"
          busyLabel="Deleting…"
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            const result = await run("delete", () =>
              deleteOrder({ orderId: order.id })
            );
            return result.ok;
          }}
        >
          <p>
            This removes <strong>{order.reference}</strong> and its lines
            permanently, and it disappears from the customer&rsquo;s account.
            Any stock it is still holding goes back on the shelf.
          </p>
          <p className="mt-2">
            There is no undo. If you only want it off the books, cancel it
            instead — that keeps the record and tells the customer why.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ drawer */

function OrderDrawer({
  order,
  onClose,
}: {
  order: OrderListRow;
  onClose: () => void;
}) {
  const [detail, setDetail] = React.useState<OrderDetail | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let live = true;

    getOrder(order.id)
      .then((result) => {
        if (!live) return;
        if (result) setDetail(result);
        else setFailed(true);
      })
      .catch(() => live && setFailed(true));

    return () => {
      live = false;
    };
  }, [order.id]);

  const address = readAddress(order.shipping_address);

  return (
    <Modal title={order.reference} size="lg" onClose={onClose}>
      <ModalBody>
        {/* `data-receipt` is what the print stylesheet keeps — same mechanism
            the till and the sales drawer use. */}
        <div data-receipt className="space-y-5">
          <div className="hidden text-center print:block">
            <p className="text-lg font-semibold">ZYLO Express</p>
            <p className="text-[0.75rem]">{order.reference}</p>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[0.8125rem]">
            <Detail
              label="Status"
              value={
                <Badge tone={ORDER_STATUS_TONE[order.status]}>
                  {ORDER_STATUS_LABEL[order.status]}
                </Badge>
              }
            />
            <Detail label="Placed" value={STAMP.format(new Date(order.placed_at))} />
            <Detail label="Customer" value={order.email} />
            <Detail label="Shipping" value={order.shipping_method} />
            {order.promotion_code && (
              <Detail label="Promotion" value={order.promotion_code} />
            )}
            {order.tracking_carrier && (
              <Detail label="Carrier" value={order.tracking_carrier} />
            )}
            {order.tracking_number && (
              <Detail label="Tracking" value={order.tracking_number} />
            )}
          </dl>

          {address && (
            <div className="border-t border-admin-line pt-4">
              <p className="mb-1.5 text-[0.75rem] font-semibold text-admin-fg">
                Ships to
              </p>
              <p className="whitespace-pre-line text-[0.8125rem] leading-relaxed text-admin-muted">
                {address}
              </p>
            </div>
          )}

          {order.status === "cancelled" && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-[0.75rem] leading-relaxed text-destructive">
              Cancelled
              {order.cancelled_at
                ? ` on ${STAMP.format(new Date(order.cancelled_at))}`
                : ""}
              .
              {order.stock_released_at
                ? " Stock was returned to inventory."
                : ""}
              {order.cancel_reason ? ` Reason: ${order.cancel_reason}` : ""}
            </p>
          )}

          <div className="border-t border-admin-line pt-4">
            <p className="mb-2.5 text-[0.75rem] font-semibold text-admin-fg">
              Items
            </p>

            {failed ? (
              <p className="text-[0.8125rem] text-admin-muted">
                Could not load the lines for this order.
              </p>
            ) : !detail ? (
              <p className="flex items-center gap-2 text-[0.8125rem] text-admin-muted">
                <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
                Loading…
              </p>
            ) : detail.items.length === 0 ? (
              <p className="text-[0.8125rem] text-admin-muted">
                This order has no recorded lines.
              </p>
            ) : (
              <ul className="divide-y divide-admin-line">
                {detail.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-[0.8125rem] font-medium text-admin-fg">
                        {item.product_name}
                      </p>
                      <p className="mt-0.5 text-[0.6875rem] text-admin-faint">
                        {[item.variant_title, item.sku, item.origin_country_code]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="admin-figure text-[0.8125rem]">
                        {item.quantity} × <Money amount={item.unit_price} />
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
            <Total label="Subtotal" amount={order.subtotal} />
            {order.discount > 0 && (
              <Total label="Discount" amount={-order.discount} />
            )}
            <Total label="Shipping" amount={order.shipping} />
            {order.tax > 0 && <Total label="Tax" amount={order.tax} />}
            <div className="flex items-center justify-between border-t border-admin-line pt-2 text-[0.9375rem] font-semibold">
              <dt>Total</dt>
              <dd className="admin-figure">
                <Money amount={order.total} />
              </dd>
            </div>
          </dl>

          {/* Payment attempts, including the failed ones. "The customer says
              they paid" is the single most common query this screen has to
              answer, and a list showing only the success cannot answer it. */}
          {detail && detail.payments.length > 0 && (
            <div className="border-t border-admin-line pt-4 print:hidden">
              <p className="mb-2.5 text-[0.75rem] font-semibold text-admin-fg">
                Payments
              </p>
              <ul className="space-y-2">
                {detail.payments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex items-start justify-between gap-4 text-[0.75rem]"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-admin-fg">
                        {payment.provider} · {payment.method}
                      </p>
                      <p className="admin-figure mt-0.5 truncate text-admin-faint">
                        {payment.provider_reference ?? payment.reference}
                      </p>
                      {payment.failure_reason && (
                        <p className="mt-0.5 text-destructive">
                          {payment.failure_reason}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={cn(
                          "font-semibold",
                          payment.status === "succeeded"
                            ? "text-forest"
                            : payment.status === "failed"
                              ? "text-destructive"
                              : "text-admin-muted"
                        )}
                      >
                        {payment.status}
                      </p>
                      <p className="admin-figure mt-0.5 text-admin-faint">
                        {payment.charge_amount / 100} {payment.charge_currency}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {order.notes && (
            <p className="border-t border-admin-line pt-4 text-[0.75rem] leading-relaxed text-admin-muted">
              {order.notes}
            </p>
          )}
        </div>
      </ModalBody>

      <ModalFooter>
        <AdminButton variant="secondary" onClick={onClose}>
          Close
        </AdminButton>
        <AdminButton onClick={() => window.print()} disabled={!detail}>
          <Printer className="size-3.5" strokeWidth={2} />
          Print
        </AdminButton>
      </ModalFooter>
    </Modal>
  );
}

/**
 * The shipping address, as lines.
 *
 * `shipping_address` is jsonb written by checkout, so it is typed as an open
 * record here rather than trusted to have a shape. Anything missing is dropped
 * instead of rendering "undefined" into an address label.
 */
function readAddress(value: Record<string, unknown> | null): string | null {
  if (!value || typeof value !== "object") return null;

  const pick = (key: string) => {
    const found = value[key];
    return typeof found === "string" && found.trim() ? found.trim() : null;
  };

  const name = [pick("firstName"), pick("lastName")].filter(Boolean).join(" ");

  const lines = [
    name || pick("name"),
    pick("line1") ?? pick("address1"),
    pick("line2") ?? pick("address2"),
    [pick("city"), pick("postalCode") ?? pick("postcode")]
      .filter(Boolean)
      .join(", "),
    pick("country") ?? pick("countryCode"),
    pick("phone"),
  ].filter(Boolean);

  return lines.length > 0 ? lines.join("\n") : null;
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
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

/* -------------------------------------------------------------- checkpoint */

/**
 * The half-dozen things that actually get typed.
 *
 * A free-text box with no suggestions produces "left warehouse", "Left
 * Warehouse", "departed WH" and "shipped out" from four operators for one event,
 * and a customer-facing timeline reading like four different companies. These
 * fill the field and stay editable.
 */
const COMMON_CHECKPOINTS = [
  "Left our warehouse",
  "Arrived at the airport",
  "Departed origin country",
  "Arrived in destination country",
  "Cleared customs",
  "With the local courier",
  "Out for delivery",
];

function CheckpointDialog({
  order,
  canElevate,
  onClose,
  onSave,
}: {
  order: OrderListRow;
  canElevate: boolean;
  onClose: () => void;
  onSave: (values: {
    label: string;
    location: string;
    countryCode: string;
    detail: string;
    status?: OrderStatusDb;
    occurredAt?: string;
    isPublic: boolean;
    notify: boolean;
  }) => Promise<boolean>;
}) {
  const [label, setLabel] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [countryCode, setCountryCode] = React.useState("");
  const [detail, setDetail] = React.useState("");
  const [status, setStatus] = React.useState<OrderStatusDb | "">("");
  const [isPublic, setIsPublic] = React.useState(true);
  const [notify, setNotify] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!label.trim()) return;

    setSaving(true);
    try {
      const ok = await onSave({
        label,
        location,
        countryCode,
        detail,
        status: status || undefined,
        isPublic,
        // An internal note is never emailed, whatever this says — the action
        // enforces that. Reflected here so the checkbox does not promise
        // something the server will refuse.
        notify: notify && isPublic,
      });
      if (ok) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Add checkpoint" size="lg" onClose={onClose}>
      <form onSubmit={submit}>
        <ModalBody>
          <p className="mb-4 text-[0.8125rem] leading-relaxed text-admin-muted">
            Where <strong className="text-admin-fg">{order.reference}</strong> has
            got to. This appears on the customer&rsquo;s tracking page
            immediately.
          </p>

          <div className="space-y-4">
            <Field label="What happened" hint="One line, in the customer's words">
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Departed Guangzhou"
                maxLength={120}
                required
                autoFocus
                className={cn(inputClass(false), "mt-1")}
              />
            </Field>

            <div className="flex flex-wrap gap-1.5">
              {COMMON_CHECKPOINTS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setLabel(suggestion)}
                  className="rounded-full border border-admin-line px-2.5 py-1 text-[0.6875rem] text-admin-muted transition-colors duration-150 hover:border-admin-fg/30 hover:text-admin-fg"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
              <Field label="Location" hint="Optional">
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="Guangzhou, China"
                  maxLength={120}
                  className={cn(inputClass(false), "mt-1")}
                />
              </Field>

              <Field label="Country" hint="Two letters">
                <input
                  value={countryCode}
                  onChange={(event) =>
                    setCountryCode(event.target.value.toUpperCase().slice(0, 2))
                  }
                  placeholder="CN"
                  maxLength={2}
                  className={cn(inputClass(false), "mt-1 uppercase")}
                />
              </Field>
            </div>

            <Field label="Note" hint="Optional second line">
              <input
                value={detail}
                onChange={(event) => setDetail(event.target.value)}
                placeholder="Held for customs inspection"
                maxLength={400}
                className={cn(inputClass(false), "mt-1")}
              />
            </Field>

            <Field
              label="Also move the order to"
              hint="Optional. Leave as is to record the checkpoint only."
            >
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as OrderStatusDb | "")
                }
                className={cn(inputClass(false), "mt-1")}
              >
                <option value="">Leave the status unchanged</option>
                {ORDER_ROUTINE_STATUSES.filter((s) => s !== order.status).map(
                  (option) => (
                    <option key={option} value={option}>
                      {ORDER_STATUS_LABEL[option]}
                    </option>
                  )
                )}
              </select>
            </Field>

            <div className="space-y-3 border-t border-admin-line pt-4">
              <Toggle
                checked={isPublic}
                onChange={(value) => {
                  setIsPublic(value);
                  if (!value) setNotify(false);
                }}
                label="Show the customer"
                hint="Off makes this an internal note — visible in the portal only, and never emailed."
              />
              <Toggle
                checked={notify}
                onChange={setNotify}
                disabled={!isPublic}
                label="Email the customer"
                hint="Sends the tracking email with this checkpoint at the top."
              />
            </div>

            {!canElevate && (
              <p className="text-[0.6875rem] leading-relaxed text-admin-faint">
                Cancelling or refunding from here needs an administrator, so
                those statuses are not offered.
              </p>
            )}
          </div>
        </ModalBody>

        <ModalFooter>
          <AdminButton type="button" variant="secondary" onClick={onClose}>
            Cancel
          </AdminButton>
          <AdminButton type="submit" disabled={saving || !label.trim()}>
            {saving && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />}
            {saving ? "Saving…" : "Add checkpoint"}
          </AdminButton>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/* ---------------------------------------------------------------- tracking */

function TrackingDialog({
  order,
  onClose,
  onSave,
}: {
  order: OrderListRow;
  onClose: () => void;
  onSave: (values: {
    carrier: string;
    number: string;
    url: string;
  }) => Promise<boolean>;
}) {
  const [carrier, setCarrier] = React.useState(order.tracking_carrier ?? "");
  const [number, setNumber] = React.useState(order.tracking_number ?? "");
  const [url, setUrl] = React.useState(order.tracking_url ?? "");
  const [saving, setSaving] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (await onSave({ carrier, number, url })) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Tracking" onClose={onClose}>
      <form onSubmit={submit}>
        <ModalBody>
          <p className="mb-4 text-[0.8125rem] leading-relaxed text-admin-muted">
            This appears on the customer&rsquo;s account against{" "}
            <strong className="text-admin-fg">{order.reference}</strong> as soon
            as you save. Leave a field blank to clear it.
          </p>

          <div className="space-y-4">
            <Field label="Carrier" hint="DHL, Aramex, Posta Kenya…">
              <input
                value={carrier}
                onChange={(event) => setCarrier(event.target.value)}
                maxLength={80}
                placeholder="DHL Express"
                className={cn(inputClass(false), "mt-1")}
              />
            </Field>

            <Field label="Tracking number">
              <input
                value={number}
                onChange={(event) => setNumber(event.target.value)}
                maxLength={120}
                placeholder="1234567890"
                className={cn(inputClass(false), "mt-1")}
              />
            </Field>

            <Field
              label="Tracking link"
              hint="The page the customer opens. Must start with https://"
            >
              <input
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                maxLength={2000}
                placeholder="https://www.dhl.com/track?id=…"
                className={cn(inputClass(false), "mt-1")}
              />
            </Field>
          </div>
        </ModalBody>

        <ModalFooter>
          <AdminButton type="button" variant="secondary" onClick={onClose}>
            Cancel
          </AdminButton>
          <AdminButton type="submit" disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />}
            {saving ? "Saving…" : "Save tracking"}
          </AdminButton>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ cancel */

function CancelDialog({
  order,
  onClose,
  onConfirm,
}: {
  order: OrderListRow;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<boolean>;
}) {
  const [reason, setReason] = React.useState("");

  return (
    <ConfirmDialog
      title="Cancel order"
      confirmLabel="Cancel order"
      busyLabel="Cancelling…"
      onClose={onClose}
      onConfirm={() => onConfirm(reason)}
    >
      <p>
        This marks <strong>{order.reference}</strong> cancelled and puts every
        line back into stock. The order stays on the books rather than
        disappearing, so the month still reconciles.
      </p>
      <p className="mt-2">
        The customer sees the change on their account immediately, along with
        the reason if you give one.
        {order.paid
          ? " This order has been paid — cancelling does not refund it, so issue the refund with the provider separately."
          : ""}
      </p>

      <Field label="Reason" hint="Shown to the customer">
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Out of stock at the supplier"
          maxLength={240}
          className={cn(inputClass(false), "mt-1")}
        />
      </Field>
    </ConfirmDialog>
  );
}
