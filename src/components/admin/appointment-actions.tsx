"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CalendarCheck,
  CalendarX,
  CircleCheck,
  Loader2,
  Mail,
  RotateCcw,
  Trash2,
  Video,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  confirmAppointment,
  deleteAppointment,
  setAppointmentStatus,
  updateAppointmentNote,
} from "@/app/actions/admin/appointments";
import type { AppointmentRow } from "@/lib/supabase/types";
import { AdminButton, Badge } from "@/components/admin/primitives";
import { MenuItem, MenuSeparator, RowMenu } from "@/components/admin/row-menu";
import {
  ConfirmDialog,
  Field,
  Modal,
  ModalBody,
  ModalFooter,
  inputClass,
} from "@/components/admin/modal";

/**
 * Row actions for an appointment.
 *
 * The customer's request is never edited — `preferred_at` and `alternate_at`
 * stay as sent. What staff set is `confirmed_at`, so the agreed time and the
 * asked-for time remain separately visible.
 */

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function AppointmentStatusBadge({
  status,
  overdue,
}: {
  status: AppointmentRow["status"];
  /** Open, with the requested date already past. */
  overdue?: boolean;
}) {
  if (status === "requested") {
    return <Badge tone={overdue ? "critical" : "accent"}>
      {overdue ? "Overdue" : "Requested"}
    </Badge>;
  }
  if (status === "confirmed") {
    return <Badge tone={overdue ? "critical" : "positive"}>
      {overdue ? "Overdue" : "Confirmed"}
    </Badge>;
  }
  if (status === "completed") return <Badge tone="neutral">Completed</Badge>;
  return <Badge tone="warning">Cancelled</Badge>;
}

type Busy = null | "status" | "confirm" | "note" | "delete";

export function AppointmentActions({
  appointment,
}: {
  appointment: AppointmentRow;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<Busy>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [reading, setReading] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

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

  const open =
    appointment.status === "requested" || appointment.status === "confirmed";

  return (
    <>
      <RowMenu label={`Actions for ${appointment.reference}`} busy={busy !== null}>
        {(close) => (
          <>
            <MenuItem
              icon={CalendarCheck}
              label="Open request"
              onClick={() => {
                close();
                setReading(true);
              }}
            />
            <MenuItem
              as="link"
              href={buildMailto(appointment)}
              icon={Mail}
              label="Write to guest"
            />

            <MenuSeparator />

            <MenuItem
              icon={CalendarCheck}
              label={appointment.confirmed_at ? "Reschedule" : "Confirm a time"}
              disabled={appointment.status === "cancelled"}
              onClick={() => {
                close();
                setConfirming(true);
              }}
            />
            <MenuItem
              icon={CircleCheck}
              label="Mark completed"
              disabled={appointment.status === "completed"}
              onClick={() => {
                close();
                void run("status", () =>
                  setAppointmentStatus({ id: appointment.id, status: "completed" })
                );
              }}
            />
            <MenuItem
              icon={CalendarX}
              label="Cancel"
              disabled={appointment.status === "cancelled"}
              onClick={() => {
                close();
                void run("status", () =>
                  setAppointmentStatus({ id: appointment.id, status: "cancelled" })
                );
              }}
            />
            {!open && (
              <MenuItem
                icon={RotateCcw}
                label="Reopen as request"
                onClick={() => {
                  close();
                  void run("status", () =>
                    setAppointmentStatus({ id: appointment.id, status: "requested" })
                  );
                }}
              />
            )}

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

      {reading && (
        <AppointmentReader
          appointment={appointment}
          onClose={() => setReading(false)}
          onSaveNote={(staffNote) =>
            run("note", () =>
              updateAppointmentNote({ id: appointment.id, staffNote })
            )
          }
        />
      )}

      {confirming && (
        <ConfirmTimeModal
          appointment={appointment}
          onClose={() => setConfirming(false)}
          onSave={(values) => run("confirm", () => confirmAppointment(values))}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete appointment"
          onClose={() => setDeleting(false)}
          onConfirm={async () => {
            const result = await run("delete", () =>
              deleteAppointment(appointment.id)
            );
            return result.ok;
          }}
        >
          This permanently removes{" "}
          <span className="admin-figure">{appointment.reference}</span> and{" "}
          {appointment.name}&rsquo;s request. Cancelling keeps the record of
          someone who asked and was turned away, which is usually the thing
          worth having later — delete is for test rows and duplicates.
        </ConfirmDialog>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ reader */

function AppointmentReader({
  appointment,
  onClose,
  onSaveNote,
}: {
  appointment: AppointmentRow;
  onClose: () => void;
  onSaveNote: (staffNote: string) => Promise<{ ok: boolean }>;
}) {
  const [note, setNote] = React.useState(appointment.staff_note);
  const [saving, setSaving] = React.useState(false);

  return (
    <Modal
      title={appointment.reference}
      description={`${appointment.name} · requested ${DATE_TIME.format(new Date(appointment.created_at))}`}
      size="lg"
      onClose={onClose}
    >
      <ModalBody className="space-y-5">
        <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-[8rem_1fr]">
          <Term>Guest</Term>
          <Detail>
            {appointment.name}
            {appointment.party_size > 1 && (
              <span className="text-admin-faint">
                {" "}
                · {appointment.party_size} guests
              </span>
            )}
          </Detail>

          <Term>Email</Term>
          <Detail className="admin-figure break-words">{appointment.email}</Detail>

          {appointment.phone && (
            <>
              <Term>Telephone</Term>
              <Detail className="admin-figure">{appointment.phone}</Detail>
            </>
          )}

          <Term>Where</Term>
          <Detail>
            {appointment.mode === "video" ? (
              <span className="inline-flex items-center gap-1.5">
                <Video className="size-3.5" strokeWidth={1.8} />
                By video
              </span>
            ) : (
              appointment.boutique
            )}
          </Detail>

          <Term>Asked for</Term>
          <Detail className="admin-figure">
            {DATE_TIME.format(new Date(appointment.preferred_at))}
          </Detail>

          {appointment.alternate_at && (
            <>
              <Term>Or</Term>
              <Detail className="admin-figure text-admin-muted">
                {DATE_TIME.format(new Date(appointment.alternate_at))}
              </Detail>
            </>
          )}

          {appointment.confirmed_at && (
            <>
              <Term>Confirmed for</Term>
              <Detail className="admin-figure font-semibold text-success">
                {DATE_TIME.format(new Date(appointment.confirmed_at))}
              </Detail>
            </>
          )}

          {appointment.interest && (
            <>
              <Term>Interested in</Term>
              <Detail>{appointment.interest}</Detail>
            </>
          )}
        </dl>

        {appointment.notes && (
          <div>
            <p className="mb-2 text-[0.75rem] font-semibold text-admin-fg">
              From the guest
            </p>
            {/* Verbatim — reflowing what somebody wrote is a small edit to a
                record. React escapes it, so the markup is safe. */}
            <div className="rounded-lg border border-admin-line bg-admin-hover p-4">
              <p className="whitespace-pre-wrap text-[0.8125rem] leading-relaxed text-admin-fg">
                {appointment.notes}
              </p>
            </div>
          </div>
        )}

        <Field label="Internal note" hint="Never shown to the guest">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            className={cn(inputClass(false), "h-auto resize-y py-2 leading-relaxed")}
          />
        </Field>
      </ModalBody>

      <ModalFooter>
        <AdminButton variant="secondary" onClick={onClose} disabled={saving}>
          Close
        </AdminButton>
        <AdminButton href={buildMailto(appointment)} variant="secondary">
          <Mail className="size-3.5" strokeWidth={2} />
          Write to guest
        </AdminButton>
        <AdminButton
          disabled={saving || note === appointment.staff_note}
          onClick={async () => {
            setSaving(true);
            const result = await onSaveNote(note);
            setSaving(false);
            if (result.ok) onClose();
          }}
        >
          {saving && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />}
          Save note
        </AdminButton>
      </ModalFooter>
    </Modal>
  );
}

function Term({ children }: { children: React.ReactNode }) {
  return (
    <dt className="text-[0.75rem] font-semibold text-admin-fg">{children}</dt>
  );
}

function Detail({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <dd className={cn("min-w-0 text-[0.8125rem] text-admin-muted", className)}>
      {children}
    </dd>
  );
}

/* ------------------------------------------------------------ confirm time */

function toLocalField(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

/**
 * Agree a time.
 *
 * Offers the requested and alternate slots as one-click fills, but never
 * assumes one: about half of these are settled by telephone for a third time
 * entirely, and a confirm button that silently took the first choice would
 * record agreements nobody made.
 */
function ConfirmTimeModal({
  appointment,
  onClose,
  onSave,
}: {
  appointment: AppointmentRow;
  onClose: () => void;
  onSave: (values: Record<string, unknown>) => Promise<{ ok: boolean }>;
}) {
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const [confirmedAt, setConfirmedAt] = React.useState(
    toLocalField(appointment.confirmed_at ?? appointment.preferred_at)
  );
  const [staffNote, setStaffNote] = React.useState(appointment.staff_note);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const result = (await onSave({
      id: appointment.id,
      confirmedAt,
      staffNote,
    })) as { ok: boolean; fieldErrors?: Record<string, string> };

    setSaving(false);
    if (result.ok) onClose();
    else if (result.fieldErrors) setErrors(result.fieldErrors);
  };

  return (
    <Modal
      title={appointment.confirmed_at ? "Reschedule" : "Confirm a time"}
      description={`${appointment.reference} · ${appointment.name}`}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <ModalBody className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <AdminButton
              variant="secondary"
              size="sm"
              onClick={() => setConfirmedAt(toLocalField(appointment.preferred_at))}
            >
              Use requested
            </AdminButton>
            {appointment.alternate_at && (
              <AdminButton
                variant="secondary"
                size="sm"
                onClick={() =>
                  setConfirmedAt(toLocalField(appointment.alternate_at!))
                }
              >
                Use alternative
              </AdminButton>
            )}
          </div>

          <Field
            label="Confirmed time"
            hint="What you have agreed"
            error={errors.confirmedAt}
          >
            <input
              type="datetime-local"
              value={confirmedAt}
              onChange={(event) => setConfirmedAt(event.target.value)}
              className={cn(
                inputClass(Boolean(errors.confirmedAt)),
                "admin-figure"
              )}
            />
          </Field>

          <Field label="Internal note" hint="Never shown to the guest" error={errors.staffNote}>
            <textarea
              value={staffNote}
              onChange={(event) => setStaffNote(event.target.value)}
              rows={3}
              className={cn(
                inputClass(Boolean(errors.staffNote)),
                "h-auto resize-y py-2 leading-relaxed"
              )}
            />
          </Field>

          <p className="rounded-md border border-champagne/40 bg-champagne/10 px-3 py-2 text-[0.75rem] leading-relaxed text-champagne-dark">
            Confirming records the time here. It does not email the guest —
            there is no mail provider wired — so use “Write to guest” to tell
            them.
          </p>
        </ModalBody>

        <ModalFooter>
          <AdminButton variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </AdminButton>
          <AdminButton type="submit" disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" strokeWidth={2} />}
            {saving ? "Saving…" : "Confirm"}
          </AdminButton>
        </ModalFooter>
      </form>
    </Modal>
  );
}

/* ---------------------------------------------------------------- mailto */

/**
 * A pre-filled reply.
 *
 * Every part is `encodeURIComponent`'d — the guest's own name and interest are
 * attacker-controlled text from a public form, and an `&` in either would
 * truncate the body.
 */
function buildMailto(appointment: AppointmentRow): string {
  const where =
    appointment.mode === "video"
      ? "by video"
      : `at our ${appointment.boutique} boutique`;

  const when = appointment.confirmed_at
    ? DATE_TIME.format(new Date(appointment.confirmed_at))
    : DATE_TIME.format(new Date(appointment.preferred_at));

  const subject = `Your appointment ${where} — ${appointment.reference}`;
  const body = `Dear ${appointment.name},\n\nThank you for your request. We would be glad to see you ${where} on ${when}.\n\nYour reference is ${appointment.reference}.\n\nWith warm regards,\nZYLO Client Services`;

  return `mailto:${encodeURIComponent(appointment.email)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
}
