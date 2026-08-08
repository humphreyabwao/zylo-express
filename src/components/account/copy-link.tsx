"use client";

import * as React from "react";
import { Check, Link2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Copy a tracking link to the clipboard.
 *
 * The one interactive thing on the tracking card, so it is the only part that
 * ships as a Client Component.
 *
 * Takes a **path** and resolves the origin in the browser rather than being
 * handed a full URL from the server. `resolveSiteUrl()` is what the *emails*
 * must use — an email has no origin — but a page already knows which host the
 * customer is on, and a link copied from a preview deployment that points at the
 * production domain is a link to somebody else's session.
 */
export function CopyLink({
  path,
  label,
}: {
  path: string;
  /** The order reference, for the accessible name and the toast. */
  label: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    []
  );

  const copy = async () => {
    const url = `${window.location.origin}${path}`;

    try {
      // `navigator.clipboard` needs a secure context. On plain http — a phone
      // testing against a dev server over the LAN — it is undefined rather than
      // rejecting, so this must be a guard, not a catch.
      if (!navigator.clipboard) throw new Error("no clipboard");

      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Tracking link copied.");

      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Better than a silent failure: the customer can still select and copy.
      toast.error(url, {
        description: "Copy this link manually — the clipboard was blocked.",
        duration: 12_000,
      });
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy the tracking link for ${label}`}
      className="inline-flex items-center gap-2 eyebrow-sm transition-opacity duration-500 hover:opacity-60"
    >
      {copied ? (
        <Check className="size-3.5 text-champagne-dark" strokeWidth={1.5} />
      ) : (
        <Link2 className="size-3.5" strokeWidth={1.25} />
      )}
      {copied ? "Copied" : "Copy link"}
    </button>
  );
}
