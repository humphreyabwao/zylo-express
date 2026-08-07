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
 * Contact inbox mutations.
 *
 * Short by design. A message is a record of something a customer sent — it is
 * not editable, because editing it would falsify the record. The only things
 * an operator does to one are move it through the workflow and, eventually,
 * remove it.
 *
 * There is no reply action. Replying means sending mail, this app has no mail
 * provider wired, and a "Reply" button that silently does nothing is worse
 * than no button — so the UI opens the operator's own mail client with a
 * `mailto:` link instead, which actually works.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
}

const idSchema = z.string().uuid("That is not a valid message id.");

const STATUSES = ["new", "in-progress", "resolved"] as const;

async function authorise(): Promise<ActionResult | null> {
  try {
    await requireAdminAction({ module: "messages" });
    return null;
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}

/**
 * No cache tags here.
 *
 * Nothing on the storefront reads `contact_messages` — the table is write-only
 * to the public — so there is no cached view of it to invalidate. The admin
 * paths are the whole surface.
 */
function revalidateInbox() {
  revalidatePath("/admin/messages");
  // The dashboard counts unanswered enquiries in its notification tray.
  revalidatePath("/admin");
}

/* ----------------------------------------------------------------- status */

const statusSchema = z.object({
  id: idSchema,
  status: z.enum(STATUSES, {
    errorMap: () => ({ message: "That is not a valid status." }),
  }),
});

export async function setMessageStatus(input: unknown): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]!.message };
  }

  const supabase = await createOperatorClient();
  const { data, error } = await supabase
    .from("contact_messages")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[admin] message status failed:", error);
    return { ok: false, message: refusalMessage(error, "Could not update that message.") };
  }

  if (!data) return { ok: false, message: "That message no longer exists." };

  revalidateInbox();

  const label: Record<(typeof STATUSES)[number], string> = {
    new: "Marked unread.",
    "in-progress": "Marked in progress.",
    resolved: "Marked resolved.",
  };
  return { ok: true, message: label[parsed.data.status] };
}

/**
 * Resolve several at once.
 *
 * An inbox that can only be cleared one row at a time stops being cleared. The
 * ids are validated individually rather than trusted as a batch, so a single
 * malformed entry fails the call instead of being silently skipped.
 */
export async function resolveMessages(ids: string[]): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = z.array(idSchema).min(1).max(100).safeParse(ids);
  if (!parsed.success) return { ok: false, message: "That selection was not valid." };

  const supabase = await createOperatorClient();
  const { data, error } = await supabase
    .from("contact_messages")
    .update({ status: "resolved" })
    .in("id", parsed.data)
    .select("id");

  if (error) {
    console.error("[admin] bulk resolve failed:", error);
    return { ok: false, message: refusalMessage(error, "Could not update those messages.") };
  }

  revalidateInbox();
  const count = data?.length ?? 0;
  return {
    ok: true,
    message: `Resolved ${count} ${count === 1 ? "message" : "messages"}.`,
  };
}

/* ----------------------------------------------------------------- delete */

/**
 * Delete a message.
 *
 * Genuinely destructive: this is the only copy. The enquiry was never mirrored
 * to an inbox anywhere — there is no mail provider — so a deleted message is
 * gone, along with whatever the customer was asking about. Resolving is the
 * reversible operation and is what the UI leads with.
 */
export async function deleteMessage(messageId: string): Promise<ActionResult> {
  const denied = await authorise();
  if (denied) return denied;

  const parsed = idSchema.safeParse(messageId);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]!.message };

  const supabase = await createOperatorClient();

  const { data: message } = await supabase
    .from("contact_messages")
    .select("subject")
    .eq("id", parsed.data)
    .maybeSingle();

  if (!message) return { ok: false, message: "That message no longer exists." };

  const { error } = await supabase
    .from("contact_messages")
    .delete()
    .eq("id", parsed.data);

  if (error) {
    console.error("[admin] message delete failed:", error);
    return { ok: false, message: refusalMessage(error, "The database refused that delete.") };
  }

  revalidateInbox();
  return { ok: true, message: "Message deleted." };
}
