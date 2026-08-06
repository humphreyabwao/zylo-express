"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { useRealtime } from "@/hooks/use-realtime";

/**
 * Keeps a server-rendered list current, without polling.
 *
 * The list itself stays a Server Component — rendering hundreds of rows on the
 * client to get live updates would be a poor trade. Instead this subscribes to
 * the SSE proxy and calls `router.refresh()`, which re-runs the page on the
 * server and streams a new RSC payload into the existing tree. Scroll position,
 * focus, open menus and form state all survive.
 *
 * The browser never touches Supabase: `/api/realtime` holds one server-side
 * subscription and fans out an entity type and an id. See that route for why.
 *
 * **This needs the table to be in the `supabase_realtime` publication.** It was
 * not, for anything, until migration 8 — the subscription succeeded and the
 * channel stayed silent, which is the quietest possible way for a feature to
 * not exist.
 */

/**
 * Changes arrive in bursts — a seed run, a bulk publish, an order decrementing
 * six variants at once. Refreshing per event would mean six server renders for
 * one logical change, so the window collects them into one.
 */
const COALESCE_MS = 400;

export function RealtimeRefresh({
  channel,
  label,
}: {
  channel: "products" | "inventory";
  /** What is being watched, e.g. "catalogue". Shown in the indicator's title. */
  label: string;
}) {
  const router = useRouter();
  const [pulse, setPulse] = React.useState(false);

  const timer = React.useRef<number | null>(null);
  const pulseTimer = React.useRef<number | null>(null);

  const { connected } = useRealtime(channel, () => {
    if (timer.current) window.clearTimeout(timer.current);

    timer.current = window.setTimeout(() => {
      router.refresh();

      // A brief flash on the indicator. Without it a row changing under the
      // operator's cursor looks like a rendering glitch rather than someone
      // else's edit arriving.
      setPulse(true);
      if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
      pulseTimer.current = window.setTimeout(() => setPulse(false), 1200);
    }, COALESCE_MS);
  });

  React.useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
      if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
    },
    []
  );

  return (
    <span
      title={
        connected
          ? `Live — ${label} updates as it changes`
          : `Reconnecting to live ${label} updates`
      }
      className="inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-admin-faint"
    >
      <span className="relative grid size-2 place-items-center" aria-hidden>
        <span
          className={cn(
            "size-2 rounded-full transition-colors duration-300",
            connected ? "bg-success" : "bg-admin-faint",
            pulse && "bg-champagne"
          )}
        />
        {connected && (
          <span className="absolute size-2 animate-ping rounded-full bg-success/60" />
        )}
      </span>

      {/* `aria-live` off: this is ambient status, and announcing "Live" every
          time the connection blips would be noise on top of a screen reader's
          own reading of the refreshed table. */}
      {connected ? "Live" : "Offline"}
    </span>
  );
}
