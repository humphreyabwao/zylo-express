"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Eye, EyeOff, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  createContentPage,
  deleteContentPage,
  setPagePublished,
  updateContentPage,
} from "@/app/actions/admin/pages";
import { PAGE_SECTIONS, serialiseBody } from "@/lib/admin/content-body";
import type { ContentPageRow } from "@/lib/supabase/types";
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
 * Row actions for a CMS page.
 *
 * No Duplicate: there are a fixed handful of these, each backing one known
 * storefront URL, and a second copy of "Returns" is never what was wanted.
 */

type Busy = null | "publish" | "delete" | "save";

export function PageActions({ page }: { page: ContentPageRow }) {
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
      <RowMenu label={`Actions for ${page.title}`} busy={busy !== null}>
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
              href={`/${page.section}/${page.slug}`}
              icon={ExternalLink}
              label="Open on storefront"
              external
            />

            <MenuSeparator />

            <MenuItem
              icon={page.is_published ? EyeOff : Eye}
              label={page.is_published ? "Unpublish" : "Publish"}
              onClick={() => {
                close();
                void run("publish", () =>
                  setPagePublished(page.id, !page.is_published)
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
        <PageFormModal
          page={page}
          onClose={() => setEditing(false)}
          onSave={(values) => run("save", () => updateContentPage(values))}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title="Delete page"
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            const result = await run("delete", () => deleteContentPage(page.id));
            return result.ok;
          }}
        >
          This permanently removes <strong>{page.title}</strong> and the{" "}
          {page.body.length}{" "}
          {page.body.length === 1 ? "section" : "sections"} of copy in it.{" "}
          <span className="admin-figure">
            /{page.section}/{page.slug}
          </span>{" "}
          will stop resolving. To take it off the storefront and keep the copy,
          unpublish instead.
        </ConfirmDialog>
      )}
    </>
  );
}

/* ------------------------------------------------------------ create button */

export function PageCreateButton({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <AdminButton onClick={() => setOpen(true)}>{children}</AdminButton>

      {open && (
        <PageFormModal
          onClose={() => setOpen(false)}
          onSave={async (values) => {
            const result = await createContentPage(values);
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

export function PageFormModal({
  page,
  onClose,
  onSave,
}: {
  /** Omitted when creating. */
  page?: ContentPageRow;
  onClose: () => void;
  onSave: (values: Record<string, unknown>) => Promise<{ ok: boolean }>;
}) {
  const creating = page === undefined;

  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const [values, setValues] = React.useState({
    title: page?.title ?? "",
    slug: page?.slug ?? "",
    section: page?.section ?? "help",
    eyebrow: page?.eyebrow ?? "",
    subtitle: page?.subtitle ?? "",
    // Structured jsonb → the text format `parseBody` reads back.
    body: page ? serialiseBody(page.body) : "",
    seoTitle: page?.seo_title ?? "",
    seoDescription: page?.seo_description ?? "",
    position: String(page?.position ?? 0),
    isPublished: page?.is_published ?? true,
  });

  const [slugTouched, setSlugTouched] = React.useState(!creating);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const onTitleChange = (title: string) => {
    setValues((current) => ({
      ...current,
      title,
      slug: slugTouched ? current.slug : slugify(title),
    }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const position = Number.parseInt(values.position, 10);

    const result = (await onSave({
      ...(page ? { id: page.id } : {}),
      title: values.title,
      slug: values.slug,
      section: values.section,
      eyebrow: values.eyebrow,
      subtitle: values.subtitle,
      body: values.body,
      seoTitle: values.seoTitle,
      seoDescription: values.seoDescription,
      position: Number.isNaN(position) ? Number.NaN : position,
      isPublished: values.isPublished,
    })) as { ok: boolean; fieldErrors?: Record<string, string> };

    setSaving(false);
    if (result.ok) onClose();
    else if (result.fieldErrors) setErrors(result.fieldErrors);
  };

  return (
    <Modal
      title={creating ? "New page" : "Edit page"}
      description={`Lives at /${values.section}/${values.slug || "…"} on the storefront.`}
      size="lg"
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <ModalBody className="space-y-4">
          <Field label="Title" error={errors.title}>
            <input
              value={values.title}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="Shipping & Delivery"
              className={inputClass(Boolean(errors.title))}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <Field label="Section" hint="Route" error={errors.section}>
              <select
                value={values.section}
                onChange={(event) => set("section", event.target.value)}
                className={cn(
                  "h-9 w-full rounded-md border bg-transparent px-3 text-[0.8125rem] text-admin-fg outline-none transition-colors duration-200",
                  "[&>option]:bg-admin-panel [&>option]:text-admin-fg",
                  errors.section
                    ? "border-destructive"
                    : "border-admin-line focus:border-champagne"
                )}
              >
                {PAGE_SECTIONS.map((section) => (
                  <option key={section} value={section}>
                    /{section}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Slug" error={errors.slug}>
              <input
                value={values.slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  set("slug", event.target.value);
                }}
                placeholder="shipping"
                className={cn(inputClass(Boolean(errors.slug)), "admin-figure")}
              />
            </Field>
          </div>

          {!creating &&
            (values.slug !== page.slug || values.section !== page.section) && (
              <p className="rounded-md border border-champagne/40 bg-champagne/10 px-3 py-2 text-[0.75rem] leading-relaxed text-champagne-dark">
                This moves the page to a new URL. Links to{" "}
                <span className="admin-figure">
                  /{page.section}/{page.slug}
                </span>{" "}
                will stop resolving.
              </p>
            )}

          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <Field label="Eyebrow" hint="Line above the title" error={errors.eyebrow}>
              <input
                value={values.eyebrow}
                onChange={(event) => set("eyebrow", event.target.value)}
                placeholder="Client services"
                className={inputClass(Boolean(errors.eyebrow))}
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

          <Field label="Summary" hint="Shown under the title" error={errors.subtitle}>
            <textarea
              value={values.subtitle}
              onChange={(event) => set("subtitle", event.target.value)}
              rows={2}
              className={cn(
                inputClass(Boolean(errors.subtitle)),
                "h-auto resize-y py-2 leading-relaxed"
              )}
            />
          </Field>

          <Field label="Body" error={errors.body}>
            <textarea
              value={values.body}
              onChange={(event) => set("body", event.target.value)}
              rows={14}
              placeholder={
                "## Services and timing\n\nOrders placed before 12:00 are dispatched the same day.\n\n- Complimentary Delivery: 3–5 business days, free above $500\n- Express: 1–2 business days, $35"
              }
              className={cn(
                inputClass(Boolean(errors.body)),
                "h-auto resize-y py-2 font-light leading-relaxed"
              )}
            />
            <span className="mt-1.5 block text-[0.6875rem] leading-relaxed text-admin-faint">
              <span className="admin-figure">## Heading</span> starts a section.
              Blank lines separate paragraphs. A block whose every line reads{" "}
              <span className="admin-figure">- Term: detail</span> becomes that
              section&rsquo;s facts list.
            </span>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="SEO title" hint="Optional" error={errors.seoTitle}>
              <input
                value={values.seoTitle}
                onChange={(event) => set("seoTitle", event.target.value)}
                placeholder={values.title || "Defaults to the title"}
                className={inputClass(Boolean(errors.seoTitle))}
              />
            </Field>

            <Field
              label="SEO description"
              hint="Optional"
              error={errors.seoDescription}
            >
              <input
                value={values.seoDescription}
                onChange={(event) => set("seoDescription", event.target.value)}
                placeholder="Defaults to the summary"
                className={inputClass(Boolean(errors.seoDescription))}
              />
            </Field>
          </div>

          <div className="rounded-lg border border-admin-line p-4">
            <Toggle
              checked={values.isPublished}
              onChange={(value) => set("isPublished", value)}
              label="Published"
              hint="Reachable on the storefront"
            />
          </div>
        </ModalBody>

        <ModalFooter>
          <AdminButton variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </AdminButton>
          <AdminButton type="submit" disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />}
            {saving ? "Saving…" : creating ? "Create page" : "Save changes"}
          </AdminButton>
        </ModalFooter>
      </form>
    </Modal>
  );
}
