"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CircleCheck,
  CircleDot,
  Clock,
  Mail,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  deleteMessage,
  setMessageStatus,
} from "@/app/actions/admin/messages";
import type { ContactMessageRow } from "@/lib/supabase/types";
import { AdminButton, Badge } from "@/components/admin/primitives";
import { MenuItem, MenuSeparator, RowMenu } from "@/components/admin/row-menu";
import { ConfirmDialog, Modal, ModalFooter } from "@/components/admin/modal";

/**
 * The inbox row: a reader, a status control, and a way out to email.
 *
 * A contact message is not an editable record — altering what somebody wrote
 * would falsify it — so there is no edit form here. The operations are: read
 * it, move it through the workflow, reply by mail, delete it.
 */

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function MessageStatusBadge({ status }: { status: ContactMessageRow["status"] }) {
  if (status === "new") return <Badge tone="accent">New</Badge>;
  if (status === "in-progress") return <Badge tone="warning">In progress</Badge>;
  return <Badge tone="positive">Resolved</Badge>;
}

export function MessageActions({ message }: { message: ContactMessageRow }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [reading, setReading] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

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

  const mailto = buildMailto(message);

  return (
    <>
      <RowMenu label={`Actions for ${message.subject}`} busy={busy}>
        {(close) => (
          <>
            <MenuItem
              icon={Mail}
              label="Read message"
              onClick={() => {
                close();
                setReading(true);
              }}
            />
            <MenuItem as="link" href={mailto} icon={Mail} label="Reply by email" />

            <MenuSeparator />

            <MenuItem
              icon={CircleDot}
              label="Mark unread"
              disabled={message.status === "new"}
              onClick={() => {
                close();
                void run(() => setMessageStatus({ id: message.id, status: "new" }));
              }}
            />
            <MenuItem
              icon={Clock}
              label="Mark in progress"
              disabled={message.status === "in-progress"}
              onClick={() => {
                close();
                void run(() =>
                  setMessageStatus({ id: message.id, status: "in-progress" })
                );
              }}
            />
            <MenuItem
              icon={CircleCheck}
              label="Mark resolved"
              disabled={message.status === "resolved"}
              onClick={() => {
                close();
                void run(() =>
                  setMessageStatus({ id: message.id, status: "resolved" })
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

      {reading && (
        <MessageReader
          message={message}
          onClose={() => setReading(false)}
          onStatus={(status) =>
            run(() => setMessageStatus({ id: message.id, status }))
          }
        />
      )}

      {confirming && (
        <ConfirmDialog
          title="Delete message"
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            const result = await run(() => deleteMessage(message.id));
            return result.ok;
          }}
        >
          This permanently removes the enquiry from{" "}
          <strong>{message.name}</strong>. It is the only copy — nothing was
          mirrored to an email inbox — so whatever they were asking about goes
          with it. Mark it resolved instead if you only want it out of the way.
        </ConfirmDialog>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ reader */

function MessageReader({
  message,
  onClose,
  onStatus,
}: {
  message: ContactMessageRow;
  onClose: () => void;
  onStatus: (status: ContactMessageRow["status"]) => Promise<{ ok: boolean }>;
}) {
  return (
    <Modal
      title={message.subject}
      description={`${message.name} · ${DATE_TIME.format(new Date(message.created_at))}`}
      size="lg"
      onClose={onClose}
    >
      <div className="max-h-[60vh] space-y-4 overflow-y-auto px-6 py-5">
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[7rem_1fr]">
          <dt className="text-[0.75rem] font-semibold text-admin-fg">From</dt>
          <dd className="admin-figure min-w-0 break-words text-[0.8125rem] text-admin-muted">
            {message.email}
          </dd>

          {message.order_reference && (
            <>
              <dt className="text-[0.75rem] font-semibold text-admin-fg">Order</dt>
              <dd className="admin-figure text-[0.8125rem] text-admin-muted">
                {message.order_reference}
              </dd>
            </>
          )}

          <dt className="text-[0.75rem] font-semibold text-admin-fg">Status</dt>
          <dd>
            <MessageStatusBadge status={message.status} />
          </dd>
        </dl>

        {/* `whitespace-pre-wrap` rather than splitting on newlines: this is a
            verbatim record of what somebody typed, and reflowing it is a small
            edit to evidence. React escapes it, so the markup is safe. */}
        <div className="rounded-lg border border-admin-line bg-admin-hover p-4">
          <p className="whitespace-pre-wrap text-[0.8125rem] leading-relaxed text-admin-fg">
            {message.message}
          </p>
        </div>
      </div>

      <ModalFooter>
        <AdminButton variant="secondary" onClick={onClose}>
          Close
        </AdminButton>

        {message.status !== "resolved" && (
          <AdminButton
            variant="secondary"
            onClick={async () => {
              const result = await onStatus("resolved");
              if (result.ok) onClose();
            }}
          >
            <CircleCheck className="size-3.5" strokeWidth={2} />
            Resolve
          </AdminButton>
        )}

        <AdminButton href={buildMailto(message)}>
          <Mail className="size-3.5" strokeWidth={2} />
          Reply by email
        </AdminButton>
      </ModalFooter>
    </Modal>
  );
}

/**
 * A `mailto:` link, quoting the original.
 *
 * This app has no mail provider, so a "Send reply" button would have to lie.
 * Handing the operator's own client a pre-filled draft is the honest version
 * and is what they would do anyway.
 *
 * Every part is `encodeURIComponent`'d: a subject containing `&` would
 * otherwise truncate the body, and the subject is attacker-controlled text
 * from a public form.
 */
function buildMailto(message: ContactMessageRow): string {
  const subject = `Re: ${message.subject}`;
  const quoted = message.message
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

  const body = `\n\n---\nOn ${DATE_TIME.format(new Date(message.created_at))}, ${message.name} wrote:\n${quoted}`;

  return `mailto:${encodeURIComponent(message.email)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
}

/* ---------------------------------------------------------------- bulk bar */

/**
 * Bulk resolve.
 *
 * Rendered above the table and only when something is selected, so it does not
 * occupy a row of chrome on an inbox nobody is triaging.
 */
export function MessageBulkBar({
  selected,
  onClear,
  onResolve,
}: {
  selected: string[];
  onClear: () => void;
  onResolve: () => Promise<void>;
}) {
  const [working, setWorking] = React.useState(false);

  if (selected.length === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-admin-line bg-admin-hover px-5 py-2.5"
      )}
    >
      <p className="text-[0.8125rem] font-medium text-admin-fg">
        {selected.length} selected
      </p>

      <div className="flex items-center gap-2">
        <AdminButton variant="ghost" size="sm" onClick={onClear} disabled={working}>
          Clear
        </AdminButton>
        <AdminButton
          size="sm"
          disabled={working}
          onClick={async () => {
            setWorking(true);
            await onResolve();
            setWorking(false);
          }}
        >
          <CircleCheck className="size-3.5" strokeWidth={2} />
          Resolve {selected.length}
        </AdminButton>
      </div>
    </div>
  );
}
