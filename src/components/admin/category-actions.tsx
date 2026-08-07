"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Eye,
  EyeOff,
  ExternalLink,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  createCategory,
  deleteCategory,
  setCategoryPublished,
  updateCategory,
} from "@/app/actions/admin/categories";
import type { CategoryListRow } from "@/lib/admin/queries";
import { AdminButton } from "@/components/admin/primitives";
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

/**
 * Row actions for a category.
 *
 * The menu carries what a row needs and no more: view the products behind it,
 * edit, jump to the storefront, hide, delete. Five icon buttons per row would
 * cost the horizontal space this table does not have and put Delete one
 * mis-click from Edit on every line.
 */

type Busy = null | "publish" | "delete" | "save";

export function CategoryActions({
  category,
  groups,
}: {
  category: CategoryListRow;
  /** Existing nav groupings, offered as a datalist so they stay consistent. */
  groups: string[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<Busy>(null);
  const [editing, setEditing] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  const run = async (
    kind: Busy,
    work: () => Promise<{ ok: boolean; message: string }>
  ) => {
    setBusy(kind);
    try {
      const result = await work();
      if (result.ok) {
        toast.success(result.message);
        // The list is server-rendered, so the row only reflects the new state
        // once the server re-renders it. Realtime delivers this to *other*
        // operators; this is for the one who pressed the button.
        router.refresh();
      } else {
        toast.error(result.message);
      }
      return result;
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <RowMenu label={`Actions for ${category.name}`} busy={busy !== null}>
        {(close) => (
          <>
            <MenuItem
              as="link"
              href={`/admin/products?category=${encodeURIComponent(category.slug)}`}
              icon={ArrowUpRight}
              label={`View ${category.product_count} products`}
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
              href={`/shop?category=${encodeURIComponent(category.slug)}`}
              icon={ExternalLink}
              label="Open on storefront"
              external
            />

            <MenuSeparator />

            <MenuItem
              icon={category.is_active ? EyeOff : Eye}
              label={category.is_active ? "Hide" : "Show"}
              onClick={() => {
                close();
                void run("publish", () =>
                  setCategoryPublished(category.id, !category.is_active)
                );
              }}
            />

            <MenuSeparator />

            <MenuItem
              icon={Trash2}
              label="Delete"
              tone="danger"
              onClick={() => {
                close();
                setConfirming(true);
              }}
            />
          </>
        )}
      </RowMenu>

      {editing && (
        <CategoryFormModal
          category={category}
          groups={groups}
          onClose={() => setEditing(false)}
          onSave={(values) => run("save", () => updateCategory(values))}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title="Delete category"
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            const result = await run("delete", () => deleteCategory(category.id));
            return result.ok;
          }}
        >
          {category.product_count > 0 ? (
            <>
              <strong>{category.name}</strong> still holds{" "}
              {category.product_count}{" "}
              {category.product_count === 1 ? "product" : "products"}. Deleting a
              category does not delete its products — it leaves them
              uncategorised and unreachable through the shop&rsquo;s filters, so
              this will be refused. Move them elsewhere first, or hide the
              category instead.
            </>
          ) : (
            <>
              This permanently removes <strong>{category.name}</strong>. Nothing
              is filed under it, so no products are affected. To take it out of
              the navigation and keep it, hide it instead.
            </>
          )}
        </ConfirmDialog>
      )}
    </>
  );
}

/* ------------------------------------------------------------ create button */

/**
 * "New category", for the page header and the empty state.
 *
 * A client island rather than a route: a category is six fields, and sending
 * an operator to `/admin/categories/new` and back for that is a page load in
 * each direction to fill in a form that fits in a dialog.
 */
export function CategoryCreateButton({
  groups,
  children,
}: {
  groups: string[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <AdminButton onClick={() => setOpen(true)}>{children}</AdminButton>

      {open && (
        <CategoryFormModal
          groups={groups}
          onClose={() => setOpen(false)}
          onSave={async (values) => {
            const result = await createCategory(values);
            if (result.ok) {
              toast.success(result.message);
              router.refresh();
            } else if (!result.fieldErrors) {
              // Field-level failures render inside the form; only a whole-form
              // refusal needs a toast, or the operator gets both at once.
              toast.error(result.message);
            }
            return result;
          }}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------- form modal */

/**
 * Create and edit share one form.
 *
 * The fields are identical and the validation is identical — the only
 * difference is which action the submit calls and whether there is an id to
 * send. Two components would be two places to add the next field to.
 */
export function CategoryFormModal({
  category,
  groups,
  onClose,
  onSave,
}: {
  /** Omitted when creating. */
  category?: CategoryListRow;
  groups: string[];
  onClose: () => void;
  onSave: (values: Record<string, unknown>) => Promise<{ ok: boolean }>;
}) {
  const creating = category === undefined;

  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const [values, setValues] = React.useState({
    name: category?.name ?? "",
    slug: category?.slug ?? "",
    group: category?.group ?? "",
    description: category?.description ?? "",
    position: String(category?.position ?? 0),
    isActive: category?.is_active ?? true,
  });

  /**
   * The slug tracks the name until it is edited by hand.
   *
   * Only when creating. Auto-rewriting an existing slug would change the
   * storefront URL — and every product's `category_slug` with it — as a side
   * effect of fixing a typo in the display name.
   */
  const [slugTouched, setSlugTouched] = React.useState(!creating);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const onNameChange = (name: string) => {
    setValues((current) => ({
      ...current,
      name,
      slug: slugTouched ? current.slug : slugify(name),
    }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const position = Number.parseInt(values.position, 10);

    const result = (await onSave({
      ...(category ? { id: category.id } : {}),
      name: values.name,
      slug: values.slug,
      group: values.group,
      description: values.description,
      // NaN rather than 0 on a non-numeric entry, so zod reports it as invalid
      // instead of silently filing the category first in the navigation.
      position: Number.isNaN(position) ? Number.NaN : position,
      isActive: values.isActive,
    })) as { ok: boolean; fieldErrors?: Record<string, string> };

    setSaving(false);
    if (result.ok) onClose();
    else if (result.fieldErrors) setErrors(result.fieldErrors);
  };

  return (
    <Modal
      title={creating ? "New category" : "Edit category"}
      description={
        creating
          ? "Categories are the shop's navigation. Products file under exactly one."
          : "Changes go live on the storefront as soon as they are saved."
      }
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <ModalBody className="space-y-4">
          <Field label="Name" error={errors.name}>
            <input
              value={values.name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Outerwear"
              className={inputClass(Boolean(errors.name))}
            />
          </Field>

          <Field
            label="Slug"
            hint="The storefront URL: /shop?category=…"
            error={errors.slug}
          >
            <input
              value={values.slug}
              onChange={(event) => {
                setSlugTouched(true);
                set("slug", event.target.value);
              }}
              placeholder="outerwear"
              className={cn(inputClass(Boolean(errors.slug)), "admin-figure")}
            />
          </Field>

          {!creating && values.slug !== category.slug && (
            <p className="rounded-md border border-champagne/40 bg-champagne/10 px-3 py-2 text-[0.75rem] leading-relaxed text-champagne-dark">
              Changing the slug changes this category&rsquo;s storefront URL.
              Existing links to <span className="admin-figure">{category.slug}</span>{" "}
              will stop resolving.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Group"
              hint="Nav heading"
              error={errors.group}
            >
              <input
                value={values.group}
                onChange={(event) => set("group", event.target.value)}
                list="category-groups"
                placeholder="Women"
                className={inputClass(Boolean(errors.group))}
              />
              {/* A datalist rather than a select: the set is open — a new
                  grouping is a legitimate thing to create — but every existing
                  one should be one keystroke away, because "Women" and
                  "women's" rendering as two headings is the failure here. */}
              <datalist id="category-groups">
                {groups.map((group) => (
                  <option key={group} value={group} />
                ))}
              </datalist>
            </Field>

            <Field
              label="Position"
              hint="Lower sorts first"
              error={errors.position}
            >
              <input
                value={values.position}
                onChange={(event) => set("position", event.target.value)}
                inputMode="numeric"
                className={cn(inputClass(Boolean(errors.position)), "admin-figure")}
              />
            </Field>
          </div>

          <Field label="Description" error={errors.description}>
            <textarea
              value={values.description}
              onChange={(event) => set("description", event.target.value)}
              rows={3}
              placeholder="Shown on the category landing page."
              className={cn(
                inputClass(Boolean(errors.description)),
                "h-auto resize-y py-2 leading-relaxed"
              )}
            />
          </Field>

          <div className="rounded-lg border border-admin-line p-4">
            <Toggle
              checked={values.isActive}
              onChange={(value) => set("isActive", value)}
              label="Visible"
              hint="Shown in the storefront navigation and filters"
            />
          </div>
        </ModalBody>

        <ModalFooter>
          <AdminButton variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </AdminButton>
          <AdminButton type="submit" disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />}
            {saving ? "Saving…" : creating ? "Create category" : "Save changes"}
          </AdminButton>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/** Mirrors `categories_slug_format`: lowercase, hyphen-joined, no edges. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
