import { Check, MapPin, X } from "lucide-react";

import { cn, formatDate } from "@/lib/utils";
import { getCountry } from "@/lib/countries";
import { ORDER_STATUS } from "@/lib/order-status";
import type { OrderStatusDb, TrackingSourceDb } from "@/lib/supabase/types";

/**
 * An order's journey, as a rail and a list of checkpoints.
 *
 * A Server Component — it renders facts, has nothing to hydrate, and is shared
 * by the signed-in account tab and the public `/track/…` page so a customer sees
 * the same thing whichever door they came through.
 *
 * ## Two views of the same journey, on purpose
 *
 * The **rail** answers "how far along is this" at a glance: five fixed stages,
 * the reached ones filled. It is the thing somebody checks in three seconds
 * without reading.
 *
 * The **checkpoints** answer "where is it and when was that": every recorded
 * event, newest first, with place and time. A rail alone cannot say "cleared
 * customs in Nairobi on Tuesday", and a list alone makes you count to work out
 * whether it is nearly there.
 *
 * ## Why the rail is not driven by the events
 *
 * A cross-border order can accumulate a dozen checkpoints between two stages —
 * departed, arrived, cleared, in transit again. Deriving stage positions from
 * however many rows happen to exist would make the rail jump around by the
 * amount of detail an operator typed, which is not information about the parcel.
 * The rail reads `status`; the list reads the events.
 */

export interface TimelineEvent {
  id: string;
  status: OrderStatusDb | null;
  label: string;
  location: string | null;
  countryCode: string | null;
  detail: string | null;
  occurredAt: string;
  source: TrackingSourceDb;
}

/** The stages the rail draws, in order. */
const STAGES: { status: OrderStatusDb; label: string; short: string }[] = [
  { status: "pending", label: "Order placed", short: "Placed" },
  { status: "confirmed", label: "Confirmed", short: "Confirmed" },
  { status: "in-atelier", label: "Being prepared", short: "Prepared" },
  { status: "shipped", label: "In transit", short: "In transit" },
  { status: "delivered", label: "Delivered", short: "Delivered" },
];

/**
 * How far along the rail a status sits.
 *
 * `cancelled` and `refunded` are off the rail entirely — they are not further
 * along, they are elsewhere — so those render the ended state instead.
 */
function stageIndex(status: OrderStatusDb): number {
  return STAGES.findIndex((stage) => stage.status === status);
}

const TIME = {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
} as const;

export function TrackingTimeline({
  status,
  events,
  cancelledAt,
  cancelReason,
  className,
}: {
  status: OrderStatusDb;
  /** Any order. Sorted here rather than trusted, so both callers agree. */
  events: TimelineEvent[];
  cancelledAt?: string | null;
  cancelReason?: string | null;
  className?: string;
}) {
  const ended = status === "cancelled" || status === "refunded";
  const reached = stageIndex(status);

  const ordered = [...events].sort(
    (a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)
  );

  return (
    <div className={className}>
      {ended ? (
        <EndedNotice
          status={status}
          cancelledAt={cancelledAt}
          cancelReason={cancelReason}
        />
      ) : (
        <StageRail reached={reached} />
      )}

      {ordered.length > 0 && (
        <ol className="mt-8 space-y-0">
          {ordered.map((event, index) => (
            <Checkpoint
              key={event.id}
              event={event}
              // The newest checkpoint is where the parcel is *now*, so it is the
              // one that reads as current. Everything below it is history.
              current={index === 0 && !ended}
              last={index === ordered.length - 1}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- rail */

function StageRail({ reached }: { reached: number }) {
  return (
    <ol className="flex items-start" aria-label="Order progress">
      {STAGES.map((stage, index) => {
        const done = index <= reached;
        const active = index === reached;
        const first = index === 0;

        return (
          <li
            key={stage.status}
            className="relative flex min-w-0 flex-1 flex-col items-center"
          >
            {/*
              The connector is drawn as a half-segment on each side of the dot
              rather than one line behind the row. A single background line has
              to be inset by half a dot at both ends to avoid poking out past
              the first and last points, which is a magic number that breaks the
              moment the dot size changes.
            */}
            {!first && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-0 right-1/2 top-[0.5625rem] h-px",
                  done ? "bg-champagne-dark" : "bg-hairline"
                )}
              />
            )}
            {index < STAGES.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute left-1/2 right-0 top-[0.5625rem] h-px",
                  index < reached ? "bg-champagne-dark" : "bg-hairline"
                )}
              />
            )}

            <span
              className={cn(
                "relative z-10 grid size-[1.125rem] place-items-center rounded-full border transition-colors duration-500",
                done
                  ? "border-champagne-dark bg-champagne-dark text-background"
                  : "border-hairline bg-background"
              )}
            >
              {done && <Check className="size-2.5" strokeWidth={3} />}
              {active && (
                // A quiet pulse on the current stage only. On every dot it
                // would be decoration; on one it says "this is where you are".
                <span className="absolute inset-0 animate-ping rounded-full bg-champagne-dark/30" />
              )}
            </span>

            <span
              className={cn(
                "mt-2.5 px-1 text-center text-[0.6875rem] leading-tight",
                done ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <span className="hidden sm:inline">{stage.label}</span>
              <span className="sm:hidden">{stage.short}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function EndedNotice({
  status,
  cancelledAt,
  cancelReason,
}: {
  status: OrderStatusDb;
  cancelledAt?: string | null;
  cancelReason?: string | null;
}) {
  return (
    <div className="flex items-start gap-3 border border-hairline bg-secondary/40 px-4 py-3.5">
      <span className="mt-0.5 grid size-[1.125rem] shrink-0 place-items-center rounded-full border border-muted-foreground/40">
        <X className="size-2.5 text-muted-foreground" strokeWidth={3} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-light text-foreground">
          {ORDER_STATUS[status].label}
          {cancelledAt
            ? ` on ${formatDate(cancelledAt, { day: "numeric", month: "long", year: "numeric" })}`
            : ""}
        </p>
        <p className="mt-1 text-xs font-light leading-relaxed text-muted-foreground">
          {cancelReason
            ? cancelReason
            : status === "refunded"
              ? "The refund is on its way back to your original payment method."
              : "Anything already charged goes back to your original payment method."}
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- checkpoint */

function Checkpoint({
  event,
  current,
  last,
}: {
  event: TimelineEvent;
  current: boolean;
  last: boolean;
}) {
  const country = event.countryCode ? getCountry(event.countryCode) : undefined;

  return (
    <li className="flex gap-4">
      {/* The rail column. The line is a sibling of the dot rather than a
          border on the list item, so the last checkpoint's line stops at its
          dot instead of running to the bottom of the row. */}
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "mt-1.5 size-2 shrink-0 rounded-full",
            current ? "bg-champagne-dark" : "bg-hairline"
          )}
        />
        {!last && <span className="w-px flex-1 bg-hairline" />}
      </div>

      <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-6")}>
        <p
          className={cn(
            "text-sm leading-snug",
            current ? "font-normal text-foreground" : "font-light text-muted-foreground"
          )}
        >
          {event.label}
        </p>

        <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-light text-muted-foreground">
          {event.location && (
            <span className="inline-flex items-center gap-1.5">
              {country ? (
                <span aria-hidden="true">{country.flag}</span>
              ) : (
                <MapPin className="size-3" strokeWidth={1.25} />
              )}
              {event.location}
            </span>
          )}
          <span className="tabular-nums">
            {formatDate(event.occurredAt, TIME)}
          </span>
        </p>

        {event.detail && (
          <p className="mt-1.5 text-xs font-light leading-relaxed text-muted-foreground">
            {event.detail}
          </p>
        )}
      </div>
    </li>
  );
}
