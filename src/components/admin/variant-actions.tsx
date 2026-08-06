"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Boxes,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type { ProductVariantRow } from "@/lib/supabase/types";
import {
  deleteVariant,
  setVariantStock,
  updateVariant,
} from "@/app/actions/admin/variants";
import type { AdminProductImage } from "@/components/admin/product-images";
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
 * Row actions for a variant — the "sub-product" that is actually bought.
 *
 * Same menu grammar as `product-actions.tsx` on purpose: an operator should
 * not have to learn that a product's overflow menu and a variant's behave
 * differently. Portalled for the same reason too — `Table` scrolls on both
 * axes, so an in-place menu is clipped at the row.
 *
 * Stock gets its own entry rather than living only inside Edit. It is the
 * field changed most often and least deliberately, usually from a delivery
 * note, and making that a five-field form is how stock counts stop happening.
 */

type Busy = null | "save" | "stock" | "delete";

interface MenuAnchor {
  top: number;
  right: number;
}

export function VariantActions({
  variant,
  images,
}: {
  variant: ProductVariantRow;
  /** For the "shown as" picker in Edit. */
  images: AdminProductImage[];
}) {
  const router = useRouter();
  const [anchor, setAnchor] = React.useState<MenuAnchor | null>(null);
  const [busy, setBusy] = React.useState<Busy>(null);
  const [editing, setEditing] = React.useState(false);
  const [stocking, setStocking] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

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
    work: () => Promise<{ ok: boolean; message: string }>
  ) => {
    setBusy(kind);
    close();
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

  const menu = anchor && (
    <div
      ref={menuRef}
      role="menu"
      style={{ top: anchor.top, right: anchor.right }}
      className="fixed z-50 w-52 origin-top-right overflow-hidden rounded-lg border border-admin-line bg-admin-panel py-1 shadow-xl shadow-black/15 animate-in fade-in-0 zoom-in-95 duration-150"
    >
      <MenuItem
        icon={Pencil}
        label="Edit variant"
        onClick={() => {
          close();
          setEditing(true);
        }}
      />
      <MenuItem
        icon={Boxes}
        label="Set stock"
        onClick={() => {
          close();
          setStocking(true);
        }}
      />

      <div className="my-1 h-px bg-admin-line" aria-hidden />

      <MenuItem
        icon={Trash2}
        label="Delete variant"
        tone="danger"
        onClick={() => {
          close();
          setConfirming(true);
        }}
      />
    </div>
  );

  return (
    <div className="flex justify-end">
      <IconButton
        ref={triggerRef}
        label={`Actions for ${variant.title}`}
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={busy !== null}
        className={cn(open && "bg-admin-hover text-admin-fg")}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" strokeWidth={2} />
        ) : (
          <MoreHorizontal className="size-4" strokeWidth={2} />
        )}
      </IconButton>

      {menu && createPortal(menu, document.body)}

      {editing && (
        <EditVariantModal
          variant={variant}
          images={images}
          onClose={() => setEditing(false)}
          onSave={(values) => run("save", () => updateVariant(values))}
        />
      )}

      {stocking && (
        <StockModal
          variant={variant}
          onClose={() => setStocking(false)}
          onSave={(quantity) =>
            run("stock", () => setVariantStock({ id: variant.id, quantity }))
          }
        />
      )}

      {confirming && (
        <ConfirmDeleteVariant
          title={variant.title}
          sku={variant.sku}
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            const result = await run("delete", () => deleteVariant(variant.id));
            // Stays open on refusal — "this has sold" is the reason the
            // operator needs to read, next to the thing being refused.
            return result.ok;
          }}
        />
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  tone = "default",
  onClick,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  tone?: "default" | "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[0.8125rem] font-medium transition-colors duration-150",
        tone === "danger"
          ? "text-destructive hover:bg-destructive/10"
          : "text-admin-muted hover:bg-admin-hover hover:text-admin-fg"
      )}
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.7} />
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------- edit */

function EditVariantModal({
  variant,
  images,
  onClose,
  onSave,
}: {
  variant: ProductVariantRow;
  images: AdminProductImage[];
  onClose: () => void;
  onSave: (values: Record<string, unknown>) => Promise<{ ok: boolean }>;
}) {
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const [values, setValues] = React.useState({
    sku: variant.sku,
    title: variant.title,
    price: toAmountField(variant.price),
    compareAtPrice: toAmountField(variant.compare_at_price),
    inventoryQuantity: String(variant.inventory_quantity),
    imageId: variant.image_id ?? "",
  });

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const result = (await onSave({
      id: variant.id,
      ...values,
      // The action's schema wants a number here; the input gives a string.
      inventoryQuantity: Number(values.inventoryQuantity),
    })) as { ok: boolean; fieldErrors?: Record<string, string> };

    setSaving(false);
    if (result.ok) onClose();
    else if (result.fieldErrors) setErrors(result.fieldErrors);
  };

  return (
    <Modal
      title="Edit variant"
      description="This is what a customer actually buys — its SKU, its price, and the stock checkout draws down."
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
              productId={variant.product_id}
              value={values.sku}
              onChange={(sku) => set("sku", sku)}
              error={errors.sku}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Price" hint="USD" error={errors.price}>
              <input
                value={values.price}
                onChange={(e) => set("price", e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
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

            <Field label="Stock" error={errors.inventoryQuantity}>
              <input
                value={values.inventoryQuantity}
                onChange={(e) => set("inventoryQuantity", e.target.value)}
                inputMode="numeric"
                className={cn(
                  inputClass(Boolean(errors.inventoryQuantity)),
                  "admin-figure"
                )}
              />
            </Field>
          </div>

          <Field
            label="Shown as"
            hint="Which photograph this option displays"
            error={errors.imageId}
          >
            <select
              value={values.imageId}
              onChange={(e) => set("imageId", e.target.value)}
              className={cn(
                inputClass(Boolean(errors.imageId)),
                "[&>option]:bg-admin-panel [&>option]:text-admin-fg"
              )}
            >
              <option value="">First image of the product</option>
              {images.map((image, index) => (
                <option key={image.id} value={image.id}>
                  Image {index + 1}
                  {image.alt ? ` — ${image.alt.slice(0, 48)}` : ""}
                </option>
              ))}
            </select>
          </Field>

          <p className="rounded-lg border border-admin-line px-3 py-2.5 text-[0.75rem] leading-relaxed text-admin-faint">
            Availability is not editable: the database derives it from stock, so
            a variant is buyable exactly when it has units. Set stock to zero to
            take this option off sale.
          </p>
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

/* ------------------------------------------------------------------ stock */

function StockModal({
  variant,
  onClose,
  onSave,
}: {
  variant: ProductVariantRow;
  onClose: () => void;
  onSave: (quantity: number) => Promise<{ ok: boolean }>;
}) {
  const [value, setValue] = React.useState(String(variant.inventory_quantity));
  const [saving, setSaving] = React.useState(false);

  const parsed = Number(value);
  const valid = Number.isInteger(parsed) && parsed >= 0;

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
      title="Set stock"
      description={`${variant.title} · ${variant.sku}`}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <ModalBody>
          <Field
            label="Units in stock"
            hint={`Currently ${variant.inventory_quantity}`}
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

          <p className="mt-3 text-[0.75rem] leading-relaxed text-admin-faint">
            This is an absolute count, not an adjustment — enter what is on the
            shelf. Setting it to zero takes the option off sale immediately.
          </p>
        </ModalBody>

        <ModalFooter>
          <AdminButton variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </AdminButton>
          <AdminButton type="submit" disabled={saving || !valid}>
            {saving && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />}
            {saving ? "Saving…" : "Set stock"}
          </AdminButton>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/* ----------------------------------------------------------------- delete */

function ConfirmDeleteVariant({
  title,
  sku,
  onClose,
  onConfirm,
}: {
  title: string;
  sku: string;
  onClose: () => void;
  onConfirm: () => Promise<boolean>;
}) {
  const [working, setWorking] = React.useState(false);

  return (
    <Modal title="Delete variant" onClose={onClose}>
      <div className="px-6 py-5">
        <div className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0 text-destructive"
            strokeWidth={2}
          />
          <p className="text-[0.8125rem] leading-relaxed text-admin-fg">
            This removes <strong>{title}</strong> ({sku}) permanently. It cannot
            be undone. To take the option off sale and keep it, set its stock to
            zero instead.
          </p>
        </div>
      </div>

      <ModalFooter>
        <AdminButton variant="secondary" onClick={onClose} disabled={working}>
          Cancel
        </AdminButton>
        <AdminButton
          variant="danger"
          disabled={working}
          onClick={async () => {
            setWorking(true);
            const ok = await onConfirm();
            setWorking(false);
            if (ok) onClose();
          }}
        >
          {working && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />}
          {working ? "Deleting…" : "Delete variant"}
        </AdminButton>
      </ModalFooter>
    </Modal>
  );
}
