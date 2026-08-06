"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Boxes,
  ExternalLink,
  Eye,
  Loader2,
  Minus,
  MoreHorizontal,
  PackageX,
  Pencil,
  Plus,
  Truck,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type { InventoryRow } from "@/lib/admin/queries";
import {
  adjustVariantStock,
  setVariantStock,
  updateVariant,
} from "@/app/actions/admin/variants";
import { AdminButton, IconButton } from "@/components/admin/primitives";
import { SkuField } from "@/components/admin/sku-field";
import {
  Field,
  Modal,
  ModalBody,
  ModalFooter,
  inputClass,
  toAmountField,
} from "@/components/admin/modal";

/**
 * Stock controls for one variant.
 *
 * Three tiers, by how often the operation happens:
 *
 *   − / +        inline, one click. Receiving a unit, recording breakage.
 *   Set / Receive  a modal. Stock counts and deliveries.
 *   ⋯ menu       everything else.
 *
 * The inline pair is the reason this module is worth building rather than
 * sending operators to each product's detail page: walking a shelf and
 * correcting a dozen counts should not be a dozen page loads.
 *
 * `−` and `+` are relative and go through an atomic RPC; "Set" is absolute.
 * Mixing those up is how stock drifts, so they are visually and verbally
 * distinct rather than two ways into one form.
 */

type Busy = null | "adjust" | "set" | "receive" | "save" | "zero";

interface MenuAnchor {
  top: number;
  right: number;
}

export function InventoryActions({ row }: { row: InventoryRow }) {
  const router = useRouter();
  const [anchor, setAnchor] = React.useState<MenuAnchor | null>(null);
  const [busy, setBusy] = React.useState<Busy>(null);
  const [setting, setSetting] = React.useState(false);
  const [receiving, setReceiving] = React.useState(false);
  const [editing, setEditing] = React.useState(false);

  const menuRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const open = anchor !== null;
  const close = React.useCallback(() => setAnchor(null), []);

  const toggle = () => {
    if (open) return close();
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setAnchor({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
  };

  React.useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close();
      triggerRef.current?.focus();
    };
    const onScroll = () => close();

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, close]);

  const run = async (
    kind: Busy,
    work: () => Promise<{ ok: boolean; message: string }>,
    options: { quiet?: boolean } = {}
  ) => {
    setBusy(kind);
    close();
    try {
      const result = await work();
      if (result.ok) {
        // Single-unit adjustments are announced quietly: a shelf walk would
        // otherwise stack a dozen toasts over the table being worked on.
        if (!options.quiet) toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
      return result;
    } finally {
      setBusy(null);
    }
  };

  const adjust = (delta: number) =>
    run("adjust", () => adjustVariantStock({ id: row.id, delta }), {
      quiet: Math.abs(delta) === 1,
    });

  const menu = anchor && (
    <div
      ref={menuRef}
      role="menu"
      style={{ top: anchor.top, right: anchor.right }}
      className="fixed z-50 w-56 origin-top-right overflow-hidden rounded-lg border border-admin-line bg-admin-panel py-1 shadow-xl shadow-black/15 animate-in fade-in-0 zoom-in-95 duration-150"
    >
      <MenuItem
        icon={Truck}
        label="Receive stock"
        onClick={() => {
          close();
          setReceiving(true);
        }}
      />
      <MenuItem
        icon={Boxes}
        label="Set exact count"
        onClick={() => {
          close();
          setSetting(true);
        }}
      />
      <MenuItem
        icon={PackageX}
        label="Mark sold out"
        disabled={row.inventory_quantity <= 0}
        onClick={() =>
          run("zero", () => setVariantStock({ id: row.id, quantity: 0 }))
        }
      />

      <div className="my-1 h-px bg-admin-line" aria-hidden />

      <MenuItem
        icon={Pencil}
        label="Edit variant"
        onClick={() => {
          close();
          setEditing(true);
        }}
      />
      <MenuItem
        as="link"
        href={`/admin/products/${row.product_id}`}
        icon={Eye}
        label="View product"
      />
      <MenuItem
        as="link"
        href={`/products/${row.product_slug}`}
        icon={ExternalLink}
        label="Open on storefront"
        external
      />
    </div>
  );

  return (
    <div className="flex items-center justify-end gap-1">
      {/* Inline adjust. Grouped into one bordered control so the pair reads as
          a single stepper rather than two unrelated buttons. */}
      <div className="flex items-center rounded-md border border-admin-line">
        <StepButton
          label={`Remove one ${row.title}`}
          disabled={busy !== null || row.inventory_quantity <= 0}
          onClick={() => adjust(-1)}
        >
          <Minus className="size-3.5" strokeWidth={2.5} />
        </StepButton>

        <span
          aria-live="polite"
          className="admin-figure grid h-7 w-9 place-items-center border-x border-admin-line text-[0.75rem] font-semibold tabular-nums"
        >
          {busy === "adjust" ? (
            <Loader2 className="size-3 animate-spin" strokeWidth={2.5} />
          ) : (
            row.inventory_quantity
          )}
        </span>

        <StepButton
          label={`Add one ${row.title}`}
          disabled={busy !== null}
          onClick={() => adjust(1)}
        >
          <Plus className="size-3.5" strokeWidth={2.5} />
        </StepButton>
      </div>

      <IconButton
        ref={triggerRef}
        label={`More actions for ${row.title}`}
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={busy !== null}
        className={cn(open && "bg-admin-hover text-admin-fg")}
      >
        {busy && busy !== "adjust" ? (
          <Loader2 className="size-4 animate-spin" strokeWidth={2} />
        ) : (
          <MoreHorizontal className="size-4" strokeWidth={2} />
        )}
      </IconButton>

      {menu && createPortal(menu, document.body)}

      {setting && (
        <CountModal
          row={row}
          onClose={() => setSetting(false)}
          onSave={(quantity) =>
            run("set", () => setVariantStock({ id: row.id, quantity }))
          }
        />
      )}

      {receiving && (
        <ReceiveModal
          row={row}
          onClose={() => setReceiving(false)}
          onSave={(delta) =>
            run("receive", () => adjustVariantStock({ id: row.id, delta }))
          }
        />
      )}

      {editing && (
        <EditPriceModal
          row={row}
          onClose={() => setEditing(false)}
          onSave={(values) => run("save", () => updateVariant(values))}
        />
      )}
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-7 place-items-center text-admin-muted transition-colors duration-150 hover:bg-admin-hover hover:text-admin-fg disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

type MenuItemProps = {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
} & (
  | { as: "link"; href: string; external?: boolean; onClick?: never; disabled?: never }
  | { as?: undefined; href?: never; external?: never; onClick: () => void; disabled?: boolean }
);

function MenuItem({ icon: Icon, label, ...props }: MenuItemProps) {
  const className =
    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[0.8125rem] font-medium text-admin-muted transition-colors duration-150 hover:bg-admin-hover hover:text-admin-fg disabled:pointer-events-none disabled:opacity-40";

  if (props.as === "link") {
    return (
      <Link
        href={props.href}
        role="menuitem"
        {...(props.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className={className}
      >
        <Icon className="size-4 shrink-0" strokeWidth={1.7} />
        {label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      role="menuitem"
      disabled={props.disabled}
      onClick={props.onClick}
      className={className}
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.7} />
      {label}
    </button>
  );
}

/* ------------------------------------------------------------- stock count */

function CountModal({
  row,
  onClose,
  onSave,
}: {
  row: InventoryRow;
  onClose: () => void;
  onSave: (quantity: number) => Promise<{ ok: boolean }>;
}) {
  const [value, setValue] = React.useState(String(row.inventory_quantity));
  const [saving, setSaving] = React.useState(false);

  const parsed = Number(value);
  const valid = Number.isInteger(parsed) && parsed >= 0;
  const delta = valid ? parsed - row.inventory_quantity : 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setSaving(true);
    const result = await onSave(parsed);
    setSaving(false);
    if (result.ok) onClose();
  };

  return (
    <Modal
      title="Set exact count"
      description={`${row.product_name} · ${row.title}`}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <ModalBody>
          <Field
            label="Units on the shelf"
            hint={`System says ${row.inventory_quantity}`}
            error={valid ? undefined : "Enter a whole number, 0 or more"}
          >
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              inputMode="numeric"
              autoFocus
              className={cn(inputClass(!valid), "admin-figure")}
            />
          </Field>

          {valid && delta !== 0 && (
            <p className="mt-3 rounded-lg border border-admin-line px-3 py-2.5 text-[0.75rem] leading-relaxed text-admin-muted">
              This will{" "}
              <strong className="text-admin-fg">
                {delta > 0 ? "add" : "remove"} {Math.abs(delta)} unit
                {Math.abs(delta) === 1 ? "" : "s"}
              </strong>
              . Use this after a physical count — it overwrites the figure
              rather than adjusting it, so a sale made in the last few seconds
              would be overwritten too.
            </p>
          )}
        </ModalBody>

        <ModalFooter>
          <AdminButton variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </AdminButton>
          <AdminButton type="submit" disabled={saving || !valid}>
            {saving && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />}
            {saving ? "Saving…" : "Set count"}
          </AdminButton>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/* ----------------------------------------------------------------- receive */

function ReceiveModal({
  row,
  onClose,
  onSave,
}: {
  row: InventoryRow;
  onClose: () => void;
  onSave: (delta: number) => Promise<{ ok: boolean }>;
}) {
  const [value, setValue] = React.useState("1");
  const [saving, setSaving] = React.useState(false);

  const parsed = Number(value);
  const valid = Number.isInteger(parsed) && parsed > 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setSaving(true);
    const result = await onSave(parsed);
    setSaving(false);
    if (result.ok) onClose();
  };

  return (
    <Modal
      title="Receive stock"
      description={`${row.product_name} · ${row.title}`}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <ModalBody>
          <Field
            label="Units received"
            hint={`${row.inventory_quantity} → ${valid ? row.inventory_quantity + parsed : "…"}`}
            error={valid ? undefined : "Enter a whole number, 1 or more"}
          >
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              inputMode="numeric"
              autoFocus
              className={cn(inputClass(!valid), "admin-figure")}
            />
          </Field>

          <p className="mt-3 text-[0.75rem] leading-relaxed text-admin-faint">
            Added to whatever is on hand when this saves, so a sale made while
            you are typing is not overwritten. Use{" "}
            <strong className="text-admin-muted">Set exact count</strong>{" "}
            instead when you have counted the shelf.
          </p>
        </ModalBody>

        <ModalFooter>
          <AdminButton variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </AdminButton>
          <AdminButton type="submit" disabled={saving || !valid}>
            {saving && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />}
            {saving ? "Saving…" : "Receive"}
          </AdminButton>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------- price */

/**
 * Price and SKU, without leaving the inventory list.
 *
 * A narrower form than the variant editor on the product page — no image
 * picker, no stock field, because stock has three better controls six pixels
 * away and offering a fourth invites someone to type over a count they just
 * took.
 */
function EditPriceModal({
  row,
  onClose,
  onSave,
}: {
  row: InventoryRow;
  onClose: () => void;
  onSave: (values: Record<string, unknown>) => Promise<{ ok: boolean }>;
}) {
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const [values, setValues] = React.useState({
    sku: row.sku,
    title: row.title,
    price: toAmountField(row.price),
    compareAtPrice: toAmountField(row.compare_at_price),
  });

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const result = (await onSave({
      id: row.id,
      ...values,
      // Sent unchanged: `updateVariant` writes the whole row, and omitting
      // stock here would blank it.
      inventoryQuantity: row.inventory_quantity,
      imageId: row.image_id ?? "",
    })) as { ok: boolean; fieldErrors?: Record<string, string> };

    setSaving(false);
    if (result.ok) onClose();
    else if (result.fieldErrors) setErrors(result.fieldErrors);
  };

  return (
    <Modal
      title="Edit variant"
      description={`${row.product_name} · stock is managed from the list`}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <ModalBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" error={errors.title}>
              <input
                value={values.title}
                onChange={(e) => set("title", e.target.value)}
                className={inputClass(Boolean(errors.title))}
              />
            </Field>

            <SkuField
              productId={row.product_id}
              value={values.sku}
              onChange={(sku) => set("sku", sku)}
              error={errors.sku}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Price" hint="USD" error={errors.price}>
              <input
                value={values.price}
                onChange={(e) => set("price", e.target.value)}
                inputMode="decimal"
                className={cn(inputClass(Boolean(errors.price)), "admin-figure")}
              />
            </Field>

            <Field label="Compare-at" error={errors.compareAtPrice}>
              <input
                value={values.compareAtPrice}
                onChange={(e) => set("compareAtPrice", e.target.value)}
                inputMode="decimal"
                placeholder="—"
                className={cn(
                  inputClass(Boolean(errors.compareAtPrice)),
                  "admin-figure"
                )}
              />
            </Field>
          </div>
        </ModalBody>

        <ModalFooter>
          <AdminButton variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </AdminButton>
          <AdminButton type="submit" disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />}
            {saving ? "Saving…" : "Save variant"}
          </AdminButton>
        </ModalFooter>
      </form>
    </Modal>
  );
}
