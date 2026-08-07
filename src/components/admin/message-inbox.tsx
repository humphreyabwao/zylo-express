"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { resolveMessages } from "@/app/actions/admin/messages";
import type { ContactMessageRow } from "@/lib/supabase/types";
import { Table, Td, Th, Tr } from "@/components/admin/primitives";
import {
  MessageActions,
  MessageBulkBar,
  MessageStatusBadge,
} from "@/components/admin/message-actions";

/**
 * The inbox table.
 *
 * A Client Component, unlike every other list in this portal — selection is
 * client state, and there is no way to hold it in a Server Component. The
 * trade is deliberate and bounded: an inbox page is twenty rows, not the
 * hundreds a catalogue table renders, so shipping them to the browser costs
 * little. Everything else here stays server-rendered.
 */

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function MessageInbox({ messages }: { messages: ContactMessageRow[] }) {
  const router = useRouter();
  const [rawSelected, setSelected] = React.useState<string[]>([]);

  const unresolved = messages.filter((m) => m.status !== "resolved");

  /**
   * The selection, narrowed to what is actually on screen and still open.
   *
   * Derived rather than cleared in an effect. Realtime refreshes this list
   * under the operator, and an effect that reset the selection would fire
   * *after* a render in which the stale ids were still live — so "Resolve 3"
   * could act on a message somebody else had already dealt with, or one that
   * paging had moved off screen. Filtering at the point of use has no such
   * window, and needs no effect at all.
   */
  const open = new Set(unresolved.map((m) => m.id));
  const selected = rawSelected.filter((id) => open.has(id));

  const allSelected =
    unresolved.length > 0 && selected.length === unresolved.length;

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id]
    );

  const toggleAll = () =>
    setSelected(allSelected ? [] : unresolved.map((m) => m.id));

  const resolve = async () => {
    const result = await resolveMessages(selected);
    if (result.ok) {
      toast.success(result.message);
      setSelected([]);
      router.refresh();
    } else {
      toast.error(result.message);
    }
  };

  return (
    <>
      <MessageBulkBar
        selected={selected}
        onClear={() => setSelected([])}
        onResolve={resolve}
      />

      <Table>
        <thead>
          <tr>
            <Th className="w-10">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                disabled={unresolved.length === 0}
                aria-label="Select all unresolved messages"
                className="size-3.5 accent-champagne disabled:opacity-40"
              />
            </Th>
            <Th className="w-[34%]">Subject</Th>
            <Th>From</Th>
            <Th>Status</Th>
            <Th align="right">Order</Th>
            <Th align="right">Received</Th>
            <Th align="right" className="w-16">
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>

        <tbody>
          {messages.map((message) => {
            const unread = message.status === "new";

            return (
              <Tr
                key={message.id}
                className={cn(selected.includes(message.id) && "bg-admin-hover")}
              >
                <Td>
                  <input
                    type="checkbox"
                    checked={selected.includes(message.id)}
                    onChange={() => toggle(message.id)}
                    disabled={message.status === "resolved"}
                    aria-label={`Select message from ${message.name}`}
                    className="size-3.5 accent-champagne disabled:opacity-40"
                  />
                </Td>

                <Td>
                  {/* Unread carries weight rather than a second badge — the
                      status column already says "New", and two markers for one
                      fact is how a table stops being scannable. */}
                  <span
                    className={cn(
                      "block truncate",
                      unread ? "font-semibold text-admin-fg" : "font-medium"
                    )}
                  >
                    {message.subject}
                  </span>
                  <span className="block truncate text-[0.75rem] text-admin-faint">
                    {message.message.slice(0, 90)}
                    {message.message.length > 90 && "…"}
                  </span>
                </Td>

                <Td>
                  <span className="block truncate text-admin-fg">{message.name}</span>
                  <span className="admin-figure block truncate text-[0.75rem] text-admin-faint">
                    {message.email}
                  </span>
                </Td>

                <Td>
                  <MessageStatusBadge status={message.status} />
                </Td>

                <Td align="right" className="admin-figure text-admin-muted">
                  {message.order_reference || "—"}
                </Td>

                <Td align="right" className="admin-figure text-admin-muted">
                  {DATE_TIME.format(new Date(message.created_at))}
                </Td>

                <Td align="right">
                  <MessageActions message={message} />
                </Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
    </>
  );
}
