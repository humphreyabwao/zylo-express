"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  ImagePlus,
  Loader2,
  Star,
  Trash2,
  Type,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type { ProductImageRow } from "@/lib/supabase/types";
import {
  attachProductImage,
  createProductImageUpload,
  deleteProductImage,
  reorderProductImages,
  updateImageAlt,
} from "@/app/actions/admin/media";
import { AdminButton } from "@/components/admin/primitives";
import {
  Field,
  Modal,
  ModalBody,
  ModalFooter,
  inputClass,
} from "@/components/admin/modal";

/**
 * Imagery management.
 *
 * Upload, reorder, describe, remove. Used both on the product detail page and
 * inside the product edit dialog, from one component — a second implementation
 * for the modal would be a second place for the upload handshake to be got
 * subtly wrong.
 *
 * The first image is the primary one: it is what appears on every product
 * card, in the bag, and on the order confirmation. That is marked rather than
 * merely implied, because "position 0" is invisible in a grid.
 */

/**
 * A row plus its resolved public URL.
 *
 * `storageUrl` is server-only — it reads `env.supabaseUrl` — so the page maps
 * it before passing the rows down. Importing it here would drag the server env
 * module into the client bundle, which `import "server-only"` turns into a
 * build error precisely so this is caught rather than shipped.
 */
export type AdminProductImage = ProductImageRow & { url: string };

interface PendingUpload {
  id: string;
  name: string;
  /** An object URL, so the operator sees their file before the round trip. */
  preview: string;
  progress: "measuring" | "uploading" | "saving" | "failed";
  error?: string;
}

export function ProductImageManager({
  productId,
  images,
  /** `compact` drops the panel chrome for use inside a dialog. */
  compact = false,
}: {
  productId: string;
  images: AdminProductImage[];
  compact?: boolean;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [pending, setPending] = React.useState<PendingUpload[]>([]);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [editingAlt, setEditingAlt] = React.useState<AdminProductImage | null>(null);
  const [dragOver, setDragOver] = React.useState(false);

  const ordered = React.useMemo(
    () => [...images].sort((a, b) => a.position - b.position),
    [images]
  );

  /**
   * Read a file's real pixel dimensions before uploading it.
   *
   * `next/image` needs width and height to reserve space, and guessing them
   * produces a layout that jumps when the real image loads. `createImageBitmap`
   * decodes off the main thread; the object URL is revoked either way, since a
   * leaked one pins the whole decoded file in memory.
   */
  const measure = async (file: File) => {
    const url = URL.createObjectURL(file);
    try {
      const bitmap = await createImageBitmap(file);
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return { url, size };
    } catch {
      URL.revokeObjectURL(url);
      return null;
    }
  };

  const upload = async (files: File[]) => {
    for (const file of files) {
      const localId = `${file.name}-${Date.now()}-${Math.random()}`;

      const measured = await measure(file);
      if (!measured) {
        toast.error(`${file.name} could not be read as an image.`);
        continue;
      }

      setPending((current) => [
        ...current,
        {
          id: localId,
          name: file.name,
          preview: measured.url,
          progress: "uploading",
        },
      ]);

      const fail = (message: string) => {
        toast.error(message);
        setPending((current) =>
          current.map((item) =>
            item.id === localId
              ? { ...item, progress: "failed" as const, error: message }
              : item
          )
        );
      };

      try {
        // 1 — ask the server for permission to write one specific path.
        const ticket = await createProductImageUpload({
          productId,
          contentType: file.type,
          size: file.size,
        });

        if (!ticket.ok || !ticket.uploadUrl) {
          fail(ticket.message);
          continue;
        }

        // 2 — the bytes go straight to Storage. This is the only request in
        // the app that leaves our origin, and it carries a signed URL scoped
        // to that one path rather than any credential. The token is already
        // in the URL's query string, so there is no header to add.
        //
        // A raw body with a content-type is the binary upload path — the same
        // one `storage-js` takes for anything that is not a Blob. `cache-control`
        // is set here because Storage applies its own short default otherwise,
        // and catalogue imagery is content-addressed by its random filename,
        // so it can be cached indefinitely. Matches `uploadMedia` in
        // `@/lib/storage`, which is the server-side equivalent.
        const response = await fetch(ticket.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type,
            "cache-control": "max-age=31536000",
          },
          body: file,
        });

        if (!response.ok) {
          fail(`${file.name} failed to upload.`);
          continue;
        }

        // 3 — record the row.
        setPending((current) =>
          current.map((item) =>
            item.id === localId ? { ...item, progress: "saving" as const } : item
          )
        );

        const attached = await attachProductImage({
          productId,
          path: ticket.path,
          // Deliberately blank rather than the filename. "IMG_4821.jpg" read
          // aloud by a screen reader is worse than nothing, and an empty
          // string is what the "Needs description" prompt keys off.
          alt: "",
          width: measured.size.width,
          height: measured.size.height,
        });

        if (!attached.ok) {
          fail(attached.message);
          continue;
        }

        setPending((current) => current.filter((item) => item.id !== localId));
        URL.revokeObjectURL(measured.url);
        router.refresh();
      } catch (error) {
        console.error("[admin] upload failed:", error);
        fail(`${file.name} failed to upload.`);
      }
    }
  };

  const pick = (list: FileList | null) => {
    if (!list?.length) return;
    void upload(Array.from(list));
    // Reset so re-choosing the same file fires `change` again.
    if (inputRef.current) inputRef.current.value = "";
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= ordered.length) return;

    const next = [...ordered];
    [next[index], next[target]] = [next[target]!, next[index]!];

    setBusyId(ordered[index]!.id);
    const result = await reorderProductImages({
      productId,
      orderedIds: next.map((image) => image.id),
    });
    setBusyId(null);

    if (result.ok) router.refresh();
    else toast.error(result.message);
  };

  const remove = async (image: AdminProductImage) => {
    setBusyId(image.id);
    const result = await deleteProductImage(image.id);
    setBusyId(null);

    if (result.ok) {
      toast.success(result.message);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  };

  const missingAlt = ordered.filter((image) => !image.alt.trim()).length;

  const grid = (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        pick(event.dataTransfer.files);
      }}
      className={cn(
        "rounded-lg border border-dashed p-3 transition-colors duration-200",
        dragOver ? "border-champagne bg-champagne/5" : "border-admin-line"
      )}
    >
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {ordered.map((image, index) => (
          <figure
            key={image.id}
            className="group relative aspect-3/4 overflow-hidden rounded-lg border border-admin-line bg-admin-hover"
          >
            <Image
              src={image.url}
              alt={image.alt || ""}
              fill
              sizes="140px"
              className="object-cover"
            />

            {index === 0 && (
              <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-obsidian/75 px-1.5 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-wider text-ivory">
                <Star className="size-2.5 fill-champagne text-champagne" strokeWidth={0} />
                Primary
              </span>
            )}

            {!image.alt.trim() && (
              <span
                title="No description — add one for screen readers"
                className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded bg-champagne text-[0.5625rem] font-bold text-obsidian"
              >
                !
              </span>
            )}

            {/* Controls sit under a scrim rather than beside the image: at this
                size a row of buttons per tile would be taller than the tile. */}
            <figcaption
              className={cn(
                "absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-obsidian/80 py-1 backdrop-blur-sm",
                "opacity-0 transition-opacity duration-200",
                "group-hover:opacity-100 group-focus-within:opacity-100"
              )}
            >
              {busyId === image.id ? (
                <Loader2 className="size-3.5 animate-spin text-ivory" strokeWidth={2} />
              ) : (
                <>
                  <TileButton
                    label="Move earlier"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowLeft className="size-3.5" strokeWidth={2} />
                  </TileButton>
                  <TileButton
                    label="Edit description"
                    onClick={() => setEditingAlt(image)}
                  >
                    <Type className="size-3.5" strokeWidth={2} />
                  </TileButton>
                  <TileButton
                    label="Remove image"
                    tone="danger"
                    onClick={() => remove(image)}
                  >
                    <Trash2 className="size-3.5" strokeWidth={2} />
                  </TileButton>
                  <TileButton
                    label="Move later"
                    disabled={index === ordered.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowRight className="size-3.5" strokeWidth={2} />
                  </TileButton>
                </>
              )}
            </figcaption>
          </figure>
        ))}

        {pending.map((item) => (
          <div
            key={item.id}
            className="relative aspect-3/4 overflow-hidden rounded-lg border border-admin-line bg-admin-hover"
          >
            {/* Not next/image: an object URL has no loader and no remote
                pattern to match. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.preview}
              alt=""
              className="size-full object-cover opacity-40"
            />
            <div className="absolute inset-0 grid place-items-center">
              {item.progress === "failed" ? (
                <span className="px-2 text-center text-[0.625rem] font-semibold text-destructive">
                  Failed
                </span>
              ) : (
                <Loader2
                  className="size-4 animate-spin text-admin-fg"
                  strokeWidth={2}
                />
              )}
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="grid aspect-3/4 place-items-center rounded-lg border border-dashed border-admin-line text-admin-faint transition-colors duration-200 hover:border-champagne hover:text-admin-fg"
        >
          <span className="flex flex-col items-center gap-1.5">
            <ImagePlus className="size-5" strokeWidth={1.5} />
            <span className="text-[0.625rem] font-semibold uppercase tracking-wider">
              Add
            </span>
          </span>
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple
        onChange={(event) => pick(event.target.files)}
        className="sr-only"
      />

      <p className="mt-3 text-[0.6875rem] leading-relaxed text-admin-faint">
        Drag files here or use Add. JPEG, PNG, WebP or AVIF, up to 10MB each.
        The first image is used on product cards and in the bag.
        {missingAlt > 0 && (
          <>
            {" "}
            <span className="font-semibold text-champagne-dark">
              {missingAlt} image{missingAlt === 1 ? "" : "s"} need
              {missingAlt === 1 ? "s" : ""} a description.
            </span>
          </>
        )}
      </p>
    </div>
  );

  return (
    <>
      {compact ? grid : <div className="p-4">{grid}</div>}

      {editingAlt && (
        <AltTextModal
          image={editingAlt}
          onClose={() => setEditingAlt(null)}
          onSaved={() => {
            setEditingAlt(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function TileButton({
  label,
  tone = "default",
  disabled,
  onClick,
  children,
}: {
  label: string;
  tone?: "default" | "danger";
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
      className={cn(
        "grid size-6 place-items-center rounded transition-colors duration-150",
        "disabled:pointer-events-none disabled:opacity-30",
        tone === "danger"
          ? "text-ivory hover:bg-destructive hover:text-white"
          : "text-ivory hover:bg-ivory/20"
      )}
    >
      {children}
    </button>
  );
}

function AltTextModal({
  image,
  onClose,
  onSaved,
}: {
  image: AdminProductImage;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [alt, setAlt] = React.useState(image.alt);
  const [saving, setSaving] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    const result = await updateImageAlt({ imageId: image.id, alt });
    setSaving(false);

    if (result.ok) {
      toast.success(result.message);
      onSaved();
    } else {
      toast.error(result.message);
    }
  };

  return (
    <Modal
      title="Image description"
      description="Read aloud by screen readers and shown if the image fails to load. Describe the piece, not the photograph."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <ModalBody>
          <Field
            label="Alt text"
            hint={`${alt.length}/200`}
          >
            <textarea
              value={alt}
              onChange={(event) => setAlt(event.target.value.slice(0, 200))}
              rows={3}
              placeholder="Onyx leather top-handle bag, photographed against stone."
              className={cn(inputClass(), "h-auto resize-none py-2 leading-relaxed")}
            />
          </Field>
        </ModalBody>

        <ModalFooter>
          <AdminButton variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </AdminButton>
          <AdminButton type="submit" disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />}
            {saving ? "Saving…" : "Save description"}
          </AdminButton>
        </ModalFooter>
      </form>
    </Modal>
  );
}

