"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Star,
  StarOff,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  createCollection,
  deleteCollection,
  setCollectionFeatured,
  setCollectionPublished,
  updateCollection,
} from "@/app/actions/admin/collections";
import type { CollectionListRow } from "@/lib/admin/queries";
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
import { slugify } from "@/components/admin/category-actions";

/**
 * Row actions for a collection.
 *
 * Carries one operation categories do not have: Feature. A collection is
 * editorial, and whether the homepage leads with it is a different decision
 * from whether it exists for shoppers at all — so they are two menu items,
 * not one status.
 */

type Busy = null | "publish" | "feature" | "delete" | "save";

export function CollectionActions({
  collection,
}: {
  collection: CollectionListRow;
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
      <RowMenu label={`Actions for ${collection.name}`} busy={busy !== null}>
        {(close) => (
          <>
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
              href={`/collections/${collection.slug}`}
              icon={ExternalLink}
              label="Open on storefront"
              external
            />

            <MenuSeparator />

            <MenuItem
              icon={collection.is_active ? EyeOff : Eye}
              label={collection.is_active ? "Hide" : "Show"}
              onClick={() => {
                close();
                void run("publish", () =>
                  setCollectionPublished(collection.id, !collection.is_active)
                );
              }}
            />
            <MenuItem
              icon={collection.is_featured ? StarOff : Star}
              label={collection.is_featured ? "Unfeature" : "Feature"}
              onClick={() => {
                close();
                void run("feature", () =>
                  setCollectionFeatured(collection.id, !collection.is_featured)
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
        <CollectionFormModal
          collection={collection}
          onClose={() => setEditing(false)}
          onSave={(values) => run("save", () => updateCollection(values))}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title="Delete collection"
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            const result = await run("delete", () =>
              deleteCollection(collection.id)
            );
            return result.ok;
          }}
        >
          This permanently removes <strong>{collection.name}</strong>
          {collection.product_count > 0 ? (
            <>
              {" "}
              and unfiles the {collection.product_count}{" "}
              {collection.product_count === 1 ? "product" : "products"} in it.
              The products themselves are not deleted — they simply stop being
              part of this edit.
            </>
          ) : (
            <>. Nothing is filed under it.</>
          )}{" "}
          To take it off the storefront and keep it, hide it instead.
        </ConfirmDialog>
      )}
    </>
  );
}

/* ------------------------------------------------------------ create button */

export function CollectionCreateButton({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <AdminButton onClick={() => setOpen(true)}>{children}</AdminButton>

      {open && (
        <CollectionFormModal
          onClose={() => setOpen(false)}
          onSave={async (values) => {
            const result = await createCollection(values);
            if (result.ok) {
              toast.success(result.message);
              router.refresh();
            } else if (!result.fieldErrors) {
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

export function CollectionFormModal({
  collection,
  onClose,
  onSave,
}: {
  /** Omitted when creating. */
  collection?: CollectionListRow;
  onClose: () => void;
  onSave: (values: Record<string, unknown>) => Promise<{ ok: boolean }>;
}) {
  const creating = collection === undefined;

  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const [values, setValues] = React.useState({
    name: collection?.name ?? "",
    slug: collection?.slug ?? "",
    tagline: collection?.tagline ?? "",
    description: collection?.description ?? "",
    imageUrl: collection?.image_url ?? "",
    imageAlt: collection?.image_alt ?? "",
    position: String(collection?.position ?? 0),
    isFeatured: collection?.is_featured ?? false,
    isActive: collection?.is_active ?? true,
  });

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
      ...(collection ? { id: collection.id } : {}),
      name: values.name,
      slug: values.slug,
      tagline: values.tagline,
      description: values.description,
      imageUrl: values.imageUrl,
      imageAlt: values.imageAlt,
      position: Number.isNaN(position) ? Number.NaN : position,
      isFeatured: values.isFeatured,
      isActive: values.isActive,
    })) as { ok: boolean; fieldErrors?: Record<string, string> };

    setSaving(false);
    if (result.ok) onClose();
    else if (result.fieldErrors) setErrors(result.fieldErrors);
  };

  return (
    <Modal
      title={creating ? "New collection" : "Edit collection"}
      description={
        creating
          ? "A collection is an editorial grouping. A product can sit in several."
          : "Changes go live on the storefront as soon as they are saved."
      }
      size="lg"
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <ModalBody className="space-y-4">
          <Field label="Name" error={errors.name}>
            <input
              value={values.name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="The Winter Edit"
              className={inputClass(Boolean(errors.name))}
            />
          </Field>

          <Field
            label="Slug"
            hint="The storefront URL: /collections/…"
            error={errors.slug}
          >
            <input
              value={values.slug}
              onChange={(event) => {
                setSlugTouched(true);
                set("slug", event.target.value);
              }}
              placeholder="the-winter-edit"
              className={cn(inputClass(Boolean(errors.slug)), "admin-figure")}
            />
          </Field>

          {!creating && values.slug !== collection.slug && (
            <p className="rounded-md border border-champagne/40 bg-champagne/10 px-3 py-2 text-[0.75rem] leading-relaxed text-champagne-dark">
              Changing the slug moves this collection to a new URL. Links to{" "}
              <span className="admin-figure">/collections/{collection.slug}</span>{" "}
              will stop resolving.
            </p>
          )}

          <Field label="Tagline" hint="One line, shown under the name" error={errors.tagline}>
            <input
              value={values.tagline}
              onChange={(event) => set("tagline", event.target.value)}
              placeholder="Cashmere, shearling and the long coat."
              className={inputClass(Boolean(errors.tagline))}
            />
          </Field>

          <Field label="Description" error={errors.description}>
            <textarea
              value={values.description}
              onChange={(event) => set("description", event.target.value)}
              rows={3}
              className={cn(
                inputClass(Boolean(errors.description)),
                "h-auto resize-y py-2 leading-relaxed"
              )}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <Field
              label="Cover image"
              hint="Storage path or URL"
              error={errors.imageUrl}
            >
              <input
                value={values.imageUrl}
                onChange={(event) => set("imageUrl", event.target.value)}
                placeholder="collections/winter-edit.jpg"
                className={cn(inputClass(Boolean(errors.imageUrl)), "admin-figure")}
              />
            </Field>

            <Field label="Position" hint="Lower first" error={errors.position}>
              <input
                value={values.position}
                onChange={(event) => set("position", event.target.value)}
                inputMode="numeric"
                className={cn(inputClass(Boolean(errors.position)), "admin-figure")}
              />
            </Field>
          </div>

          <Field
            label="Cover description"
            hint="Alt text"
            error={errors.imageAlt}
          >
            <input
              value={values.imageAlt}
              onChange={(event) => set("imageAlt", event.target.value)}
              placeholder="A shearling coat photographed against stone."
              className={inputClass(Boolean(errors.imageAlt))}
            />
          </Field>

          <div className="space-y-2.5 rounded-lg border border-admin-line p-4">
            <Toggle
              checked={values.isActive}
              onChange={(value) =>
                setValues((current) => ({
                  ...current,
                  isActive: value,
                  // Hiding a featured collection clears the flag rather than
                  // leaving it set behind a disabled control — otherwise the
                  // form saves `featured: true` on something unreachable, and
                  // showing it again silently returns it to the homepage.
                  isFeatured: value ? current.isFeatured : false,
                }))
              }
              label="Visible"
              hint="Reachable on the storefront"
            />
            <Toggle
              checked={values.isFeatured}
              onChange={(value) => set("isFeatured", value)}
              label="Featured"
              hint="Eligible for the homepage edits"
              // Featuring something nobody can reach is not a state worth
              // being able to save; the toggle explains itself by going dead.
              disabled={!values.isActive}
            />
          </div>

          {!creating && (
            <p className="text-[0.6875rem] leading-relaxed text-admin-faint">
              Which products sit in this collection is managed from each
              product&rsquo;s own page — a collection holds{" "}
              {collection.product_count}{" "}
              {collection.product_count === 1 ? "product" : "products"} today.
            </p>
          )}
        </ModalBody>

        <ModalFooter>
          <AdminButton variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </AdminButton>
          <AdminButton type="submit" disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />}
            {saving ? "Saving…" : creating ? "Create collection" : "Save changes"}
          </AdminButton>
        </ModalFooter>
      </form>
    </Modal>
  );
}
