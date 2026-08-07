"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  createLibraryUpload,
  deleteLibraryAsset,
  deleteOrphanedAssets,
  finaliseLibraryUpload,
} from "@/app/actions/admin/media";
import type { MediaAsset } from "@/lib/admin/queries";
import { AdminButton, Badge, EmptyState } from "@/components/admin/primitives";
import { ConfirmDialog } from "@/components/admin/modal";

/**
 * The media library.
 *
 * A grid rather than a table, because the thing being chosen between is a
 * photograph and a filename is a poor proxy for one. Each tile carries the
 * three facts a decision needs — what it looks like, what uses it, how big it
 * is — and its actions on hover.
 *
 * ## Uploading without a Supabase key in the browser
 *
 * Same three-step handshake as `product-images.tsx`: ask the server for
 * permission to write one specific path, PUT the bytes to the signed URL it
 * returns, then tell the server the bytes landed. The file never passes through
 * a Next.js server, and the browser never holds a Supabase credential.
 *
 * Step three failing leaves an object in the bucket that the library will show
 * on its next load anyway — the finalise call only exists to refresh the view
 * sooner. That is the opposite of the product-image case, where a missed step
 * three means no row at all.
 */

/** Mirrors the bucket's `allowed_mime_types` — see migration 5. */
const ACCEPT = "image/jpeg,image/png,image/webp,image/avif";
const MAX_BYTES = 10 * 1024 * 1024;

const PREFIXES = [
  { value: "products", label: "Products" },
  { value: "collections", label: "Collections" },
  { value: "campaign", label: "Campaign" },
  { value: "editorial", label: "Editorial" },
] as const;

export function MediaLibrary({
  assets,
  publicBase,
}: {
  assets: MediaAsset[];
  /**
   * Absolute URL prefix for the bucket, resolved on the server.
   *
   * `storageUrl()` is server-only — it reads `env.supabaseUrl`, which is
   * deliberately not `NEXT_PUBLIC_`. Passing the resolved prefix down keeps
   * the Supabase URL out of the client bundle's source while still letting
   * Copy URL produce a real link.
   */
  publicBase: string;
}) {
  const router = useRouter();

  const [uploading, setUploading] = React.useState(false);
  const [prefix, setPrefix] = React.useState<string>("products");
  const [deleting, setDeleting] = React.useState<MediaAsset | null>(null);
  const [sweeping, setSweeping] = React.useState(false);
  const [copied, setCopied] = React.useState<string | null>(null);

  const inputRef = React.useRef<HTMLInputElement>(null);

  const orphans = React.useMemo(
    () => assets.filter((asset) => !asset.usage),
    [assets]
  );

  /* --------------------------------------------------------------- upload */

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;

    setUploading(true);
    let succeeded = 0;

    try {
      // Sequential, not `Promise.all`. Ten parallel PUTs to Storage from one
      // browser is how a bulk upload starts failing halfway with no useful
      // error, and the operator cannot tell which files landed.
      for (const file of Array.from(files)) {
        if (file.size > MAX_BYTES) {
          toast.error(`${file.name} is larger than 10MB.`);
          continue;
        }

        const ticket = await createLibraryUpload({
          prefix,
          filename: file.name,
          contentType: file.type,
          size: file.size,
        });

        if (!ticket.ok || !ticket.uploadUrl) {
          toast.error(ticket.message);
          continue;
        }

        const response = await fetch(ticket.uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type },
        });

        if (!response.ok) {
          toast.error(`${file.name} failed to upload.`);
          continue;
        }

        await finaliseLibraryUpload(ticket.path!);
        succeeded += 1;
      }
    } finally {
      setUploading(false);
      // Clearing lets the same file be re-picked; without it, selecting the
      // identical filename twice in a row fires no change event.
      if (inputRef.current) inputRef.current.value = "";
    }

    if (succeeded > 0) {
      toast.success(
        `Uploaded ${succeeded} ${succeeded === 1 ? "file" : "files"}.`
      );
      router.refresh();
    }
  };

  /* ---------------------------------------------------------------- copy */

  const copyUrl = async (path: string) => {
    const url = `${publicBase}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(path);
      window.setTimeout(() => setCopied((current) => (current === path ? null : current)), 1600);
    } catch {
      // Clipboard access is denied outside a secure context, and over plain
      // HTTP on a LAN address that is every time.
      toast.error("Could not copy. The URL is on the tile.");
    }
  };

  /* --------------------------------------------------------------- render */

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-admin-line px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <label className="text-[0.75rem] font-semibold text-admin-fg" htmlFor="media-prefix">
            Upload to
          </label>
          <select
            id="media-prefix"
            value={prefix}
            onChange={(event) => setPrefix(event.target.value)}
            className={cn(
              "h-9 rounded-md border border-admin-line bg-transparent px-3 text-[0.8125rem] font-medium text-admin-fg outline-none transition-colors duration-200 focus:border-champagne",
              "[&>option]:bg-admin-panel [&>option]:text-admin-fg"
            )}
          >
            {PREFIXES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          {orphans.length > 0 && (
            <AdminButton
              variant="secondary"
              size="sm"
              onClick={() => setSweeping(true)}
              disabled={uploading}
            >
              <Trash2 className="size-3.5" strokeWidth={2} />
              Sweep {orphans.length} unused
            </AdminButton>
          )}

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="sr-only"
            onChange={(event) => void upload(event.target.files)}
          />

          <AdminButton
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />
            ) : (
              <Upload className="size-3.5" strokeWidth={2} />
            )}
            {uploading ? "Uploading…" : "Upload"}
          </AdminButton>
        </div>
      </div>

      {assets.length === 0 ? (
        <EmptyState
          title="Nothing in the library"
          description="Upload catalogue photography."
          action={
            <AdminButton onClick={() => inputRef.current?.click()}>
              <Upload className="size-4" strokeWidth={2.2} />
              Upload images
            </AdminButton>
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {assets.map((asset) => (
            <MediaTile
              key={asset.path}
              asset={asset}
              publicBase={publicBase}
              copied={copied === asset.path}
              onCopy={() => void copyUrl(asset.path)}
              onDelete={() => setDeleting(asset)}
            />
          ))}
        </ul>
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete file"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            const result = await deleteLibraryAsset(deleting.path);
            if (result.ok) {
              toast.success(result.message);
              router.refresh();
            } else {
              toast.error(result.message);
            }
            return result.ok;
          }}
        >
          {deleting.usage ? (
            <>
              <span className="admin-figure">{deleting.name}</span> is in use by{" "}
              <strong>{deleting.usage.productName}</strong>. Deleting it would
              leave a broken image on that product&rsquo;s page, so this will be
              refused — remove it from the product first.
            </>
          ) : (
            <>
              This permanently removes{" "}
              <span className="admin-figure">{deleting.name}</span> from storage.
              Nothing references it, so no page will change. It cannot be undone.
            </>
          )}
        </ConfirmDialog>
      )}

      {sweeping && (
        <ConfirmDialog
          title="Delete unused files"
          confirmLabel={`Delete ${orphans.length}`}
          onClose={() => setSweeping(false)}
          onConfirm={async () => {
            const result = await deleteOrphanedAssets(
              orphans.map((asset) => asset.path)
            );
            if (result.ok) {
              toast.success(result.message);
              router.refresh();
            } else {
              toast.error(result.message);
            }
            return result.ok;
          }}
        >
          This permanently removes {orphans.length}{" "}
          {orphans.length === 1 ? "file" : "files"} that no product references —{" "}
          {formatBytes(orphans.reduce((sum, asset) => sum + asset.size, 0))} in
          total. Each one is re-checked against the catalogue before it goes, so
          anything attached in the meantime is skipped. It cannot be undone.
        </ConfirmDialog>
      )}
    </>
  );
}

/* -------------------------------------------------------------------- tile */

function MediaTile({
  asset,
  publicBase,
  copied,
  onCopy,
  onDelete,
}: {
  asset: MediaAsset;
  publicBase: string;
  copied: boolean;
  onCopy: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="group relative overflow-hidden rounded-lg border border-admin-line bg-admin-hover">
      <div className="relative aspect-square">
        <Image
          src={`${publicBase}${asset.path}`}
          alt={asset.usage?.alt || asset.name}
          fill
          sizes="(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
          className="object-cover"
        />

        {/* Actions ride on an overlay that only appears on hover or keyboard
            focus. `focus-within` is not optional here — without it the tile's
            buttons are reachable by Tab and invisible while focused. */}
        <div
          className={cn(
            "absolute inset-0 flex items-end justify-center gap-1.5 bg-obsidian/70 p-2 opacity-0 transition-opacity duration-200",
            "group-hover:opacity-100 group-focus-within:opacity-100"
          )}
        >
          <TileAction
            label={copied ? "Copied" : "Copy URL"}
            icon={copied ? Check : Copy}
            onClick={onCopy}
          />

          <TileAction
            as="link"
            href={`${publicBase}${asset.path}`}
            label="Open original"
            icon={ExternalLink}
          />

          {asset.usage && (
            <TileAction
              as="link"
              href={`/admin/products/${asset.usage.productId}`}
              label="Go to product"
              icon={Link2}
              external={false}
            />
          )}

          <TileAction label="Delete" icon={Trash2} tone="danger" onClick={onDelete} />
        </div>
      </div>

      <div className="space-y-1.5 p-2.5">
        <p className="admin-figure truncate text-[0.75rem] font-medium text-admin-fg" title={asset.path}>
          {asset.name}
        </p>

        <div className="flex items-center justify-between gap-2">
          {asset.usage ? (
            <Link
              href={`/admin/products/${asset.usage.productId}`}
              className="min-w-0 truncate text-[0.6875rem] text-admin-faint transition-colors hover:text-admin-fg"
              title={asset.usage.productName}
            >
              {asset.usage.productName}
            </Link>
          ) : (
            <Badge tone="warning">Unused</Badge>
          )}

          <span className="admin-figure shrink-0 text-[0.6875rem] text-admin-faint">
            {formatBytes(asset.size)}
          </span>
        </div>
      </div>
    </li>
  );
}

type TileActionProps = {
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  tone?: "default" | "danger";
} & (
  | { as: "link"; href: string; external?: boolean; onClick?: never }
  | { as?: undefined; href?: never; external?: never; onClick: () => void }
);

function TileAction({ label, icon: Icon, tone = "default", ...props }: TileActionProps) {
  const className = cn(
    "grid size-8 place-items-center rounded-md backdrop-blur-sm transition-colors duration-150",
    "outline-none focus-visible:ring-2 focus-visible:ring-champagne",
    tone === "danger"
      ? "bg-destructive/85 text-white hover:bg-destructive"
      : "bg-white/15 text-white hover:bg-white/30"
  );

  if (props.as === "link") {
    return (
      <Link
        href={props.href}
        aria-label={label}
        title={label}
        className={className}
        {...(props.external === false
          ? {}
          : { target: "_blank", rel: "noopener noreferrer" })}
      >
        <Icon className="size-3.5" strokeWidth={2} />
      </Link>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={props.onClick}
      className={className}
    >
      <Icon className="size-3.5" strokeWidth={2} />
    </button>
  );
}

/* ------------------------------------------------------------------ format */

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
