"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  createArticle,
  deleteArticle,
  duplicateArticle,
  setArticlePublished,
  updateArticle,
} from "@/app/actions/admin/articles";
import type { ArticleRow } from "@/lib/supabase/types";
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
 * Row actions for a journal article.
 *
 * Duplicate earns its place here in a way it would not on a category: the
 * journal's pieces share a house structure, and starting from the last one is
 * how most of them get written.
 */

type Busy = null | "publish" | "duplicate" | "delete" | "save";

export function ArticleActions({ article }: { article: ArticleRow }) {
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
      <RowMenu label={`Actions for ${article.title}`} busy={busy !== null}>
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
              href={`/journal/${article.slug}`}
              icon={ExternalLink}
              label="Open on storefront"
              external
            />

            <MenuSeparator />

            <MenuItem
              icon={article.is_published ? EyeOff : Eye}
              label={article.is_published ? "Move to drafts" : "Publish"}
              onClick={() => {
                close();
                void run("publish", () =>
                  setArticlePublished(article.id, !article.is_published)
                );
              }}
            />
            <MenuItem
              icon={Copy}
              label="Duplicate as draft"
              onClick={() => {
                close();
                void run("duplicate", () => duplicateArticle(article.id));
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
        <ArticleFormModal
          article={article}
          onClose={() => setEditing(false)}
          onSave={(values) => run("save", () => updateArticle(values))}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title="Delete article"
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            const result = await run("delete", () => deleteArticle(article.id));
            return result.ok;
          }}
        >
          This permanently removes <strong>{article.title}</strong> and its{" "}
          {article.body.length}{" "}
          {article.body.length === 1 ? "paragraph" : "paragraphs"} of copy. Any
          link to <span className="admin-figure">/journal/{article.slug}</span>{" "}
          will stop resolving. To take it off the storefront and keep the
          writing, move it to drafts instead.
        </ConfirmDialog>
      )}
    </>
  );
}

/* ------------------------------------------------------------ create button */

export function ArticleCreateButton({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <AdminButton onClick={() => setOpen(true)}>{children}</AdminButton>

      {open && (
        <ArticleFormModal
          onClose={() => setOpen(false)}
          onSave={async (values) => {
            const result = await createArticle(values);
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

/**
 * `datetime-local` wants `YYYY-MM-DDTHH:mm` in *local* time, while the column
 * is `timestamptz` and arrives as UTC ISO. Slicing the ISO string would show a
 * London editor the right time and a Nairobi one an hour out, so the offset is
 * subtracted explicitly.
 */
function toLocalDateTimeField(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function ArticleFormModal({
  article,
  onClose,
  onSave,
}: {
  /** Omitted when creating. */
  article?: ArticleRow;
  onClose: () => void;
  onSave: (values: Record<string, unknown>) => Promise<{ ok: boolean }>;
}) {
  const creating = article === undefined;

  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const [values, setValues] = React.useState({
    title: article?.title ?? "",
    slug: article?.slug ?? "",
    kicker: article?.kicker ?? "",
    excerpt: article?.excerpt ?? "",
    // `text[]` in, one blank line between paragraphs out — the inverse of the
    // action's `bodySchema`.
    body: (article?.body ?? []).join("\n\n"),
    imageUrl: article?.image_url ?? "",
    imageAlt: article?.image_alt ?? "",
    author: article?.author ?? "ZYLO",
    readingMinutes: String(article?.reading_minutes ?? 3),
    isPublished: article?.is_published ?? false,
    publishedAt: toLocalDateTimeField(
      article?.published_at ?? new Date().toISOString()
    ),
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

  /** Live estimate, at the ~200wpm the schema's default assumes. */
  const wordCount = values.body.trim() ? values.body.trim().split(/\s+/).length : 0;
  const estimatedMinutes = Math.max(1, Math.round(wordCount / 200));

  /**
   * "Now", captured once when the dialog opens.
   *
   * Read in a lazy `useState` initialiser rather than during render: the clock
   * is impure, and re-reading it on every keystroke would also mean the
   * scheduling banner could flicker off mid-edit as an almost-now date slid
   * into the past. A dialog session is short enough that one reading is right.
   */
  const [openedAt] = React.useState(() => Date.now());

  const scheduled =
    values.isPublished &&
    values.publishedAt !== "" &&
    Date.parse(values.publishedAt) > openedAt;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const readingMinutes = Number.parseInt(values.readingMinutes, 10);

    const result = (await onSave({
      ...(article ? { id: article.id } : {}),
      title: values.title,
      slug: values.slug,
      kicker: values.kicker,
      excerpt: values.excerpt,
      body: values.body,
      imageUrl: values.imageUrl,
      imageAlt: values.imageAlt,
      author: values.author,
      readingMinutes: Number.isNaN(readingMinutes) ? Number.NaN : readingMinutes,
      isPublished: values.isPublished,
      publishedAt: values.publishedAt,
    })) as { ok: boolean; fieldErrors?: Record<string, string> };

    setSaving(false);
    if (result.ok) onClose();
    else if (result.fieldErrors) setErrors(result.fieldErrors);
  };

  return (
    <Modal
      title={creating ? "New article" : "Edit article"}
      description={
        creating
          ? "Long-form editorial for the journal."
          : "Changes go live on the storefront as soon as they are saved."
      }
      size="lg"
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <ModalBody className="space-y-4">
          <Field label="Title" error={errors.title}>
            <input
              value={values.title}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="Cutting the first hide"
              className={inputClass(Boolean(errors.title))}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Slug" hint="/journal/…" error={errors.slug}>
              <input
                value={values.slug}
                onChange={(event) => {
                  setSlugTouched(true);
                  set("slug", event.target.value);
                }}
                className={cn(inputClass(Boolean(errors.slug)), "admin-figure")}
              />
            </Field>

            <Field label="Kicker" hint="Small line above the title" error={errors.kicker}>
              <input
                value={values.kicker}
                onChange={(event) => set("kicker", event.target.value)}
                placeholder="Atelier"
                className={inputClass(Boolean(errors.kicker))}
              />
            </Field>
          </div>

          {!creating && values.slug !== article.slug && (
            <p className="rounded-md border border-champagne/40 bg-champagne/10 px-3 py-2 text-[0.75rem] leading-relaxed text-champagne-dark">
              Changing the slug moves this article to a new URL. Links to{" "}
              <span className="admin-figure">/journal/{article.slug}</span> will
              stop resolving.
            </p>
          )}

          <Field
            label="Excerpt"
            hint="Shown on cards and in search"
            error={errors.excerpt}
          >
            <textarea
              value={values.excerpt}
              onChange={(event) => set("excerpt", event.target.value)}
              rows={2}
              className={cn(
                inputClass(Boolean(errors.excerpt)),
                "h-auto resize-y py-2 leading-relaxed"
              )}
            />
          </Field>

          <Field
            label="Body"
            hint={`${wordCount} words · about ${estimatedMinutes} min`}
            error={errors.body}
          >
            <textarea
              value={values.body}
              onChange={(event) => set("body", event.target.value)}
              rows={12}
              placeholder={"One paragraph per block.\n\nSeparate them with a blank line."}
              className={cn(
                inputClass(Boolean(errors.body)),
                "h-auto resize-y py-2 font-light leading-relaxed"
              )}
            />
            <span className="mt-1.5 block text-[0.6875rem] text-admin-faint">
              Blank lines separate paragraphs. A single newline inside a
              paragraph is joined, so you can wrap lines freely.
            </span>
          </Field>

          <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <Field label="Lead image" hint="Storage path or URL" error={errors.imageUrl}>
              <input
                value={values.imageUrl}
                onChange={(event) => set("imageUrl", event.target.value)}
                placeholder="editorial/first-hide.jpg"
                className={cn(inputClass(Boolean(errors.imageUrl)), "admin-figure")}
              />
            </Field>

            <Field
              label="Reading"
              hint="Minutes"
              error={errors.readingMinutes}
            >
              <input
                value={values.readingMinutes}
                onChange={(event) => set("readingMinutes", event.target.value)}
                inputMode="numeric"
                className={cn(
                  inputClass(Boolean(errors.readingMinutes)),
                  "admin-figure"
                )}
              />
            </Field>
          </div>

          <Field label="Image description" hint="Alt text" error={errors.imageAlt}>
            <input
              value={values.imageAlt}
              onChange={(event) => set("imageAlt", event.target.value)}
              className={inputClass(Boolean(errors.imageAlt))}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Author" error={errors.author}>
              <input
                value={values.author}
                onChange={(event) => set("author", event.target.value)}
                className={inputClass(Boolean(errors.author))}
              />
            </Field>

            <Field
              label="Publication date"
              hint="Sorts the journal"
              error={errors.publishedAt}
            >
              <input
                type="datetime-local"
                value={values.publishedAt}
                onChange={(event) => set("publishedAt", event.target.value)}
                className={cn(
                  inputClass(Boolean(errors.publishedAt)),
                  "admin-figure"
                )}
              />
            </Field>
          </div>

          <div className="rounded-lg border border-admin-line p-4">
            <Toggle
              checked={values.isPublished}
              onChange={(value) => set("isPublished", value)}
              label="Published"
              hint="Readable on the storefront"
            />
          </div>

          {scheduled && (
            <p className="rounded-md border border-champagne/40 bg-champagne/10 px-3 py-2 text-[0.75rem] leading-relaxed text-champagne-dark">
              This is dated in the future, so it will sit at the top of the
              journal from that moment. Note that publishing is not gated on the
              date — anyone with the URL can read it now.
            </p>
          )}
        </ModalBody>

        <ModalFooter>
          <AdminButton variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </AdminButton>
          <AdminButton type="submit" disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />}
            {saving ? "Saving…" : creating ? "Create article" : "Save changes"}
          </AdminButton>
        </ModalFooter>
      </form>
    </Modal>
  );
}
