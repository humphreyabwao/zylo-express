"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  AdminAuthorizationError,
  createOperatorClient,
  requireAdminAction,
} from "@/lib/admin/guard";
import { refusalMessage } from "@/lib/admin/errors";

/**
 * Appointment diary mutations.
 *
 * The customer's request is a record and is never edited here: `preferred_at`
 * and `alternate_at` stay as sent. What staff set is `confirmed_at` — the time
 * actually agreed — so the two can be compared, and a reschedule cannot quietly
 * rewrite what was originally asked for.
 *
 * There is no "send confirmation" action. This app has no mail provider, so a
 * button claiming to email the customer would be the same lie the contact form
 * used to tell. The UI opens a `mailto:` with the reference and the agreed time
 * already filled in, which actually reaches them.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
}

const idSchema = z.string().uuid("That is not a valid appointment id.");

function revalidateDiary() {
  revalidatePath("/admin/appointments");
  revalidatePath("/admin");
}

async function authorise(): Promise<ActionResult | null> {
  try {
    await requireAdminAction();
    return null;
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

/* ---------------------------------------------------------------- confirm */

const confirmSchema = z.object({
  id: idSchema,
  /** The time actually agreed. Defaults to what was asked for. */
  confirmedAt: z
    .string()
    .trim()
    .min(1, "Choose the time you are confirming.")
    .refine((v) => !Number.isNaN(Date.parse(v)), "That date is not valid."),
  staffNote: z.string().trim().max(2000, "Keep the note under 2000 characters."),
});

/**
 * Agree a time.
 *
 * Deliberately requires an explicit `confirmedAt` rather than promoting
 * `preferred_at` silently. Half of these will be confirmed for the alternate
 * slot or a time agreed by telephone, and a one-click "confirm" that always
 * took the first choice would record agreements that never happened.
 */
export async function confirmAppointment(input: unknown): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { ok: false, message: "Check the highlighted fields.", fieldErrors };
  }

  const supabase = await createOperatorClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({
      status: "confirmed",
      confirmed_at: new Date(parsed.data.confirmedAt).toISOString(),
      staff_note: parsed.data.staffNote,
    })
    .eq("id", parsed.data.id)
    .select("reference")
    .maybeSingle();

  if (error) {
    console.error("[admin] appointment confirm failed:", error);
    return { ok: false, message: refusalMessage(error, "Could not confirm that.") };
  }
  if (!data) return { ok: false, message: "That appointment no longer exists." };

  revalidateDiary();
  return { ok: true, message: `${data.reference} confirmed.` };
}

/* ----------------------------------------------------------------- status */

const STATUSES = ["requested", "confirmed", "completed", "cancelled"] as const;

const statusSchema = z.object({
  id: idSchema,
  status: z.enum(STATUSES, {
    errorMap: () => ({ message: "That is not a valid status." }),
  }),
});

/**
 * Move an appointment through the diary.
 *
 * Cancelling clears `confirmed_at`: leaving an agreed time on a cancelled
 * booking is how a slot stays mentally reserved for an appointment nobody is
 * coming to.
 */
export async function setAppointmentStatus(input: unknown): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]!.message };
  }

  const supabase = await createOperatorClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({
      status: parsed.data.status,
      ...(parsed.data.status === "cancelled" ? { confirmed_at: null } : {}),
    })
    .eq("id", parsed.data.id)
    .select("reference")
    .maybeSingle();

  if (error) {
    console.error("[admin] appointment status failed:", error);
    return {
      ok: false,
      message: refusalMessage(error, "Could not update that appointment."),
    };
  }
  if (!data) return { ok: false, message: "That appointment no longer exists." };

  revalidateDiary();

  const label: Record<(typeof STATUSES)[number], string> = {
    requested: "Reopened as a request.",
    confirmed: "Marked confirmed.",
    completed: "Marked completed.",
    cancelled: "Cancelled.",
  };
  return { ok: true, message: `${data.reference}: ${label[parsed.data.status]}` };
}

/* ------------------------------------------------------------- staff note */

const noteSchema = z.object({
  id: idSchema,
  staffNote: z.string().trim().max(2000, "Keep the note under 2000 characters."),
});

/** Internal note. Never shown to the customer — see the column comment. */
export async function updateAppointmentNote(input: unknown): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]!.message };
  }

  const supabase = await createOperatorClient();
  const { data, error } = await supabase
    .from("appointments")
    .update({ staff_note: parsed.data.staffNote })
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[admin] appointment note failed:", error);
    return { ok: false, message: refusalMessage(error, "Could not save that note.") };
  }
  if (!data) return { ok: false, message: "That appointment no longer exists." };

  revalidateDiary();
  return { ok: true, message: "Note saved." };
}

/* ----------------------------------------------------------------- delete */

/**
 * Delete an appointment.
 *
 * Destructive and rarely right: cancelling keeps the record of a customer who
 * asked and was turned away, which is the thing worth knowing later. Deleting
 * is for test rows and duplicates.
 */
export async function deleteAppointment(appointmentId: string): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = idSchema.safeParse(appointmentId);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };

  const supabase = await createOperatorClient();

  const { data: appointment } = await supabase
    .from("appointments")
    .select("reference")
    .eq("id", parsed.data)
    .maybeSingle();

  if (!appointment) {
    return { ok: false, message: "That appointment no longer exists." };
  }

  const { error } = await supabase
    .from("appointments")
    .delete()
    .eq("id", parsed.data);

  if (error) {
    console.error("[admin] appointment delete failed:", error);
    return { ok: false, message: refusalMessage(error, "The database refused that delete.") };
  }

  revalidateDiary();
  return { ok: true, message: `${appointment.reference} deleted.` };
}
