-- ---------------------------------------------------------------------------
-- ZYLO Express — make checkpoints reach an open tab
--
-- Migration 24 gave orders a checkpoint timeline, and `/account/tracking`
-- subscribes to the `my-orders` realtime channel so it updates without a
-- reload. But that channel watches `public.orders`, and `add_tracking_event`
-- writes to `order_tracking_events` — touching `orders` only when the
-- checkpoint also moves the status.
--
-- So the common case is exactly the one that failed: an operator records
-- "Cleared customs in Nairobi", which changes no status, and the customer
-- watching the page sees nothing until they refresh. Which is the opposite of
-- the point.
--
-- ## Why a touch rather than a second channel
--
-- The alternative is putting `order_tracking_events` in the publication and
-- adding a `my-tracking` SSE channel beside `my-orders`. That means a second
-- subscription per viewer, a second row-level ownership filter — and the
-- events table has no `user_id`, so that filter would need a join the
-- projection cannot do.
--
-- Bumping `orders.updated_at` reuses the channel, the filter and the client
-- that already exist. It is also true: an order whose timeline changed *has*
-- changed.
-- ---------------------------------------------------------------------------

create or replace function public.touch_order_on_tracking_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  /*
   * Deliberately does not fire for a private note.
   *
   * An internal note is a message to the next member of staff. Waking the
   * customer's page for one would tell them something happened and then show
   * them nothing that changed — and on a slow week that reads as a glitch.
   */
  if new.is_public then
    update public.orders
       set updated_at = now()
     where id = new.order_id;
  end if;

  return new;
end;
$$;

drop trigger if exists tracking_event_touches_order on public.order_tracking_events;

/**
 * `after insert` only.
 *
 * Checkpoints are append-only in practice — a wrong one is corrected by adding
 * the right one, because a timeline that silently rewrites itself is not a
 * record. Firing on update as well would also recurse through
 * `log_order_status_event` on any future edit path.
 */
create trigger tracking_event_touches_order
  after insert on public.order_tracking_events
  for each row
  execute function public.touch_order_on_tracking_event();
