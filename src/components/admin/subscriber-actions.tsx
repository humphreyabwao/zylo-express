"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Download, Loader2, Mail, MailX, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  confirmSubscriber,
  deleteSubscriber,
  exportSubscribers,
  setSubscriptionState,
} from "@/app/actions/admin/subscribers";
import type { NewsletterSubscriberRow } from "@/lib/supabase/types";
import { AdminButton, Badge } from "@/components/admin/primitives";
import { MenuItem, MenuSeparator, RowMenu } from "@/components/admin/row-menu";
import { ConfirmDialog } from "@/components/admin/modal";

/**
 * Row actions for a mailing-list subscriber.
 *
 * Unsubscribe is the everyday operation and sets a timestamp; Delete is
 * separate, destructive, and says why it is usually the wrong one — a deleted
 * row is indistinguishable from someone who never subscribed, so the next
 * signup or import puts them straight back on a list they asked to leave.
 */

export function SubscriberStatusBadge({
  subscriber,
}: {
  subscriber: NewsletterSubscriberRow;
}) {
  if (subscriber.unsubscribed_at) return <Badge tone="warning">Unsubscribed</Badge>;
  if (!subscriber.is_confirmed) return <Badge tone="neutral">Unconfirmed</Badge>;
  return <Badge tone="positive">Subscribed</Badge>;
}

export function SubscriberActions({
  subscriber,
}: {
  subscriber: NewsletterSubscriberRow;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const subscribed = subscriber.unsubscribed_at === null;

  const run = async (work: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(true);
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
      setBusy(false);
    }
  };

  return (
    <>
      <RowMenu label={`Actions for ${subscriber.email}`} busy={busy}>
        {(close) => (
          <>
            <MenuItem
              as="link"
              href={`mailto:${encodeURIComponent(subscriber.email)}`}
              icon={Mail}
              label="Write to subscriber"
            />

            <MenuSeparator />

            <MenuItem
              icon={BadgeCheck}
              label="Mark confirmed"
              disabled={subscriber.is_confirmed}
              onClick={() => {
                close();
                void run(() => confirmSubscriber(subscriber.id));
              }}
            />
            <MenuItem
              icon={subscribed ? MailX : Mail}
              label={subscribed ? "Unsubscribe" : "Resubscribe"}
              onClick={() => {
                close();
                void run(() =>
                  setSubscriptionState({
                    id: subscriber.id,
                    subscribed: !subscribed,
                  })
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
                setDeleting(true);
              }}
            />
          </>
        )}
      </RowMenu>

      {deleting && (
        <ConfirmDialog
          title="Delete subscriber"
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            const result = await run(() => deleteSubscriber(subscriber.id));
            return result.ok;
          }}
        >
          This permanently removes{" "}
          <span className="admin-figure">{subscriber.email}</span>. A deleted
          row is indistinguishable from someone who never subscribed, so the
          next time they type their address into the footer they will be added
          back{subscribed ? "" : " — undoing the unsubscribe they asked for"}.
          Use Unsubscribe unless this is a typo or a spam signup.
        </ConfirmDialog>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ export */

/**
 * CSV export.
 *
 * The action returns text and this builds the download, because a Server
 * Action cannot set `Content-Disposition`. Doing it this way also keeps the
 * mailing list out of any URL — a route handler would have put it in one.
 */
export function SubscriberExportButton() {
  const [working, setWorking] = React.useState(false);

  const download = async () => {
    setWorking(true);
    try {
      const result = await exportSubscribers();

      if (!result.ok || !result.csv) {
        toast.error(result.message);
        return;
      }

      // BOM so Excel reads it as UTF-8 rather than the system codepage, which
      // is what turns an accented name into mojibake on open.
      const blob = new Blob([`﻿${result.csv}`], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename ?? "subscribers.csv";
      link.click();

      // Revoking immediately can cancel the download in some browsers; a tick
      // is enough for the click to have been taken.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success(result.message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <AdminButton variant="secondary" onClick={download} disabled={working}>
      {working ? (
        <Loader2 className="size-4 animate-spin" strokeWidth={2} />
      ) : (
        <Download className="size-4" strokeWidth={2.2} />
      )}
      {working ? "Preparing…" : "Export CSV"}
    </AdminButton>
  );
}
