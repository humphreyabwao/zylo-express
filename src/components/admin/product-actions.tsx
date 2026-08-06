"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  deleteProduct,
  duplicateProduct,
  setProductPublished,
  updateProduct,
} from "@/app/actions/admin/products";
import type { ProductListRow } from "@/lib/admin/queries";
import { AdminButton, IconButton } from "@/components/admin/primitives";
import {
  Field,
  Modal,
  ModalBody,
  ModalFooter,
  Toggle,
  inputClass,
  toAmountField,
} from "@/components/admin/modal";
import {
  ProductImageManager,
  type AdminProductImage,
} from "@/components/admin/product-images";

/**
 * Row actions for a product.
 *
 * One trigger, one menu, and a modal for the two operations that need more
 * than a click. The alternative — five icon buttons per row — costs 200px of
 * horizontal space on a table that already scrolls, and puts Delete one
 * mis-click from Edit on every single line.
 *
 * The menu is hand-rolled, matching `profile-menu.tsx`: this project removed
 * its dropdown primitive deliberately, and outside-click, Escape and focus
 * return are a dozen lines.
 */

type Busy = null | "publish" | "duplicate" | "delete" | "save";

/** Where a portalled menu should sit, in viewport coordinates. */
interface MenuAnchor {
  top: number;
  right: number;
}

export function ProductActions({
  product,
  images = [],
}: {
  product: ProductListRow;
  /**
   * Passed only where the page has already loaded them — the detail view.
   * The list view leaves this empty, and the dialog then links through to the
   * detail page rather than fetching every product's imagery to render one
   * table. Managing images is not a bulk operation.
   */
  images?: AdminProductImage[];
}) {
  const router = useRouter();
  const [anchor, setAnchor] = React.useState<MenuAnchor | null>(null);
  const [busy, setBusy] = React.useState<Busy>(null);
  const [editing, setEditing] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  const menuRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const open = anchor !== null;
  const close = React.useCallback(() => setAnchor(null), []);

  /**
   * The menu is rendered into `document.body`, not next to its trigger.
   *
   * `Table` wraps its rows in `overflow-x-auto` so a wide table scrolls
   * instead of the page. That establishes a scroll container on both axes —
   * setting `overflow-x` to anything but `visible` makes `overflow-y` compute
   * to `auto` — so an absolutely positioned menu inside a cell is clipped at
   * the row's edge. The last three rows of any table would open a menu into
   * a scrollbar.
   *
   * Portalling escapes the clip. The cost is that the position has to be
   * measured rather than inherited, and recomputed if anything moves — which
   * is why scrolling closes it rather than chasing it.
   */
  const toggle = () => {
    if (open) {
      close();
      return;
    }

    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    setAnchor({
      top: rect.bottom + 6,
      right: window.innerWidth - rect.right,
    });
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
      // Escape must hand focus back, or the next Tab starts from the top of
      // the document rather than from the row the operator was working on.
      triggerRef.current?.focus();
    };
    // Measured coordinates go stale the moment anything scrolls. Closing is
    // both simpler and less surprising than a menu that drifts off its row.
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

  const run = async (kind: Busy, work: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(kind);
    close();
    try {
      const result = await work();
      if (result.ok) {
        toast.success(result.message);
        // The list is server-rendered, so the row only reflects the new state
        // once the server re-renders it. Realtime would deliver this too, but
        // not to the operator who has RLS-invisible drafts on screen.
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
      className="fixed z-50 w-56 origin-top-right overflow-hidden rounded-lg border border-admin-line bg-admin-panel py-1 shadow-xl shadow-black/15 animate-in fade-in-0 zoom-in-95 duration-150"
    >
      <MenuItem
        as="link"
        href={`/admin/products/${product.id}`}
        icon={Eye}
        label="View details"
      />
      <MenuItem
        icon={Pencil}
        label="Edit"
        onClick={() => {
          close();
          setEditing(true);
        }}
      />
      <MenuItem
        as="link"
        href={`/products/${product.slug}`}
        icon={ExternalLink}
        label="Open on storefront"
        external
      />

      <Separator />

      <MenuItem
        icon={product.is_active ? EyeOff : Eye}
        label={product.is_active ? "Unpublish" : "Publish"}
        onClick={() =>
          run("publish", () => setProductPublished(product.id, !product.is_active))
        }
      />
      <MenuItem
        icon={Copy}
        label="Duplicate"
        onClick={() => run("duplicate", () => duplicateProduct(product.id))}
      />

      <Separator />

      <MenuItem
        icon={Trash2}
        label="Delete"
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
        label={`Actions for ${product.name}`}
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

      {/* Portalled after mount only: `document` does not exist during the
          server render, and reaching for it would break hydration. */}
      {menu && createPortal(menu, document.body)}

      {editing && (
        <EditProductModal
          product={product}
          images={images}
          onClose={() => setEditing(false)}
          onSave={(values) => run("save", () => updateProduct(values))}
        />
      )}

      {confirming && (
        <ConfirmDeleteModal
          name={product.name}
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            const result = await run("delete", () => deleteProduct(product.id));
            // Stays open on refusal so the reason — usually "this has sold" —
            // is read next to the thing it is refusing.
            if (result.ok) setConfirming(false);
            return result.ok;
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------- menu */

function Separator() {
  return <div className="my-1 h-px bg-admin-line" aria-hidden />;
}

type MenuItemProps = {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  tone?: "default" | "danger";
} & (
  | { as: "link"; href: string; external?: boolean; onClick?: never }
  | { as?: undefined; href?: never; external?: never; onClick: () => void }
);

function MenuItem({ icon: Icon, label, tone = "default", ...props }: MenuItemProps) {
  const className = cn(
    "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[0.8125rem] font-medium transition-colors duration-150",
    tone === "danger"
      ? "text-destructive hover:bg-destructive/10"
      : "text-admin-muted hover:bg-admin-hover hover:text-admin-fg"
  );

  if (props.as === "link") {
    return (
      <Link
        href={props.href}
        role="menuitem"
        {...(props.external
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
        className={className}
      >
        <Icon className="size-4 shrink-0" strokeWidth={1.7} />
        {label}
      </Link>
    );
  }

  return (
    <button type="button" role="menuitem" onClick={props.onClick} className={className}>
      <Icon className="size-4 shrink-0" strokeWidth={1.7} />
      {label}
    </button>
  );
}

/* -------------------------------------------------------------- edit modal */

function EditProductModal({
  product,
  images,
  onClose,
  onSave,
}: {
  product: ProductListRow;
  images: AdminProductImage[];
  onClose: () => void;
  onSave: (values: Record<string, unknown>) => Promise<{ ok: boolean }>;
}) {
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const [values, setValues] = React.useState({
    name: product.name,
    slug: product.slug,
    tagline: product.tagline ?? "",
    price: toAmountField(product.price),
    compareAtPrice: toAmountField(product.compare_at_price),
    isActive: product.is_active,
    isFeatured: product.is_featured,
  });

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const result = (await onSave({ id: product.id, ...values })) as {
      ok: boolean;
      fieldErrors?: Record<string, string>;
    };

    setSaving(false);
    if (result.ok) onClose();
    else if (result.fieldErrors) setErrors(result.fieldErrors);
  };

  return (
    <Modal
      title="Edit product"
      description="Changes go live on the storefront as soon as they are saved."
      size="lg"
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <ModalBody className="space-y-4">
          <Field label="Name" error={errors.name}>
            <input
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              className={inputClass(Boolean(errors.name))}
            />
          </Field>

          <Field
            label="Slug"
            hint="The storefront URL: /products/…"
            error={errors.slug}
          >
            <input
              value={values.slug}
              onChange={(e) => set("slug", e.target.value)}
              className={cn(inputClass(Boolean(errors.slug)), "admin-figure")}
            />
          </Field>

          <Field label="Tagline" error={errors.tagline}>
            <input
              value={values.tagline}
              onChange={(e) => set("tagline", e.target.value)}
              className={inputClass(Boolean(errors.tagline))}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Price" hint="USD" error={errors.price}>
              <input
                value={values.price}
                onChange={(e) => set("price", e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className={cn(inputClass(Boolean(errors.price)), "admin-figure")}
              />
            </Field>

            <Field
              label="Compare-at"
              hint="Was-price, optional"
              error={errors.compareAtPrice}
            >
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

          <div className="space-y-2.5 rounded-lg border border-admin-line p-4">
            <Toggle
              checked={values.isActive}
              onChange={(v) => set("isActive", v)}
              label="Published"
              hint="Visible to shoppers on the storefront"
            />
            <Toggle
              checked={values.isFeatured}
              onChange={(v) => set("isFeatured", v)}
              label="Featured"
              hint="Eligible for the homepage and edits"
            />
          </div>

          <div>
            <p className="mb-2 text-[0.75rem] font-semibold text-admin-fg">
              Imagery
            </p>

            {/* Image operations save on their own, immediately — they are not
                part of this form's submit. Uploading a photograph and then
                pressing Cancel does not unsend the file, and pretending
                otherwise would be the more confusing lie. */}
            <ProductImageManager
              productId={product.id}
              images={images}
              compact
            />

            <p className="mt-2 text-[0.6875rem] text-admin-faint">
              Images save as soon as they are added, moved or removed —
              separately from the fields above.
            </p>
          </div>
        </ModalBody>

        <ModalFooter>
          <AdminButton variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </AdminButton>
          <AdminButton type="submit" disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />}
            {saving ? "Saving…" : "Save changes"}
          </AdminButton>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------ delete modal */

/**
 * Type-to-confirm.
 *
 * Reserved for the one irreversible action in the module. An ordinary
 * "are you sure" is clicked through reflexively within a week; having to type
 * the product's name is the difference between confirming and acknowledging.
 */
function ConfirmDeleteModal({
  name,
  onClose,
  onConfirm,
}: {
  name: string;
  onClose: () => void;
  onConfirm: () => Promise<boolean>;
}) {
  const [typed, setTyped] = React.useState("");
  const [working, setWorking] = React.useState(false);

  const matches = typed.trim().toLowerCase() === name.trim().toLowerCase();

  return (
    <Modal title="Delete product" onClose={onClose}>
      <div className="space-y-4 px-6 py-5">
        <div className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4">
          <TriangleAlert
            className="mt-0.5 size-4 shrink-0 text-destructive"
            strokeWidth={2}
          />
          <p className="text-[0.8125rem] leading-relaxed text-admin-fg">
            This permanently removes <strong>{name}</strong> along with its
            images, options and variants. It cannot be undone. To take it off
            the storefront and keep it, unpublish instead.
          </p>
        </div>

        <Field label={`Type “${name}” to confirm`}>
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            className={inputClass(false)}
          />
        </Field>
      </div>

      <ModalFooter>
        <AdminButton variant="secondary" onClick={onClose} disabled={working}>
          Cancel
        </AdminButton>
        <AdminButton
          variant="danger"
          disabled={!matches || working}
          onClick={async () => {
            setWorking(true);
            const ok = await onConfirm();
            setWorking(false);
            if (ok) onClose();
          }}
        >
          {working && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />}
          {working ? "Deleting…" : "Delete permanently"}
        </AdminButton>
      </ModalFooter>
    </Modal>
  );
}
