-- ---------------------------------------------------------------------------
-- ZYLO Express — order actions
--
-- Until now `orders` was a table the portal could only read. Checkout wrote a
-- row, a verified payment promoted it to `confirmed`, and from there nothing in
-- the application could ever touch it again: no way to mark a parcel shipped,
-- record a tracking number, cancel an order a customer rang up about, or remove
-- a test row. The one screen that listed orders linked each reference to
-- `/admin/orders/{id}`, a route that does not exist.
--
-- This adds the state transitions, and the columns they need to be honest about
-- what happened.
--
-- ## Why these are functions rather than updates from a Server Action
--
-- Cancelling moves stock as well as status, exactly as `cancel_sale` does for
-- the till. Two statements from a Server Action — update the row, then put the
-- lines back — leaves a cancelled order whose stock never returned the moment
-- anything fails between them. A function is one transaction or none of it.
--
-- ## What counts as holding stock
--
-- `reserve_inventory` takes the units when the order is written, before payment,
-- so every status except the two below is holding them:
--
--   cancelled   the goods never went out. Stock returns.
--   refunded    the money went back. Stock does NOT return automatically.
--
-- The asymmetry is deliberate. A cancellation happens before dispatch, so the
-- units are still on the shelf and restocking them is simply true. A refund
-- routinely happens *after* delivery — for a fault, or a gesture — and the goods
-- may be in a customer's wardrobe, in the post, or written off. Restocking on
-- refund would invent inventory that nobody can pick, which is worse than making
-- someone record a return deliberately from the Inventory screen.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------- columns

alter table public.orders
  -- When and why, kept on the row rather than only in `notes`, so the customer's
  -- account page can explain a cancellation without an operator writing prose.
  add column if not exists cancelled_at      timestamptz,
  add column if not exists cancel_reason     text,
  -- Makes the release idempotent. Cancelling twice — two operators, a double
  -- click, a retried action — must not credit the shelf twice.
  add column if not exists stock_released_at timestamptz,
  -- `tracking_url` already existed and the storefront already renders it as a
  -- "Track" link. These two let the account page show *who* is carrying the
  -- parcel and under what number, which is what a customer actually reads out
  -- to a courier when a link 404s.
  add column if not exists tracking_carrier  text,
  add column if not exists tracking_number   text;

comment on column public.orders.stock_released_at is
  'Set when a cancellation returned this order''s lines to stock. Guards against double-crediting; cleared when an order is reinstated.';

-- Orders are listed newest-first and filtered by status on every load of the
-- portal screen. Without this that is a sequential scan the moment the table is
-- larger than the page it renders.
create index if not exists orders_status_placed_at_idx
  on public.orders (status, placed_at desc);

-- The customer's realtime channel filters on `user_id`, and the account page
-- reads by it on every visit.
create index if not exists orders_user_placed_at_idx
  on public.orders (user_id, placed_at desc)
  where user_id is not null;

-- ------------------------------------------------------------ replication

/**
 * Carry the whole row on DELETE, not just the primary key.
 *
 * The customer's realtime channel (`/api/realtime?channel=my-orders`) decides
 * whether an event belongs to the signed-in customer by comparing the row's
 * `user_id`. Under the default replica identity a DELETE publishes only the key,
 * so `user_id` is absent, the filter fails closed, and a customer watching their
 * account never learns that an order vanished — it sits on their screen until
 * they reload.
 *
 * The cost is WAL volume: every delete now logs the full old row. For a table
 * that grows by one row per checkout that is nothing, and it is the only way the
 * per-customer filter can be both correct and closed by default.
 */
alter table public.orders replica identity full;

-- ------------------------------------------------------------------- helpers

/**
 * This order's lines, shaped for reserve_inventory/release_inventory.
 *
 * Lines whose variant has since been deleted are skipped rather than failing
 * the whole transition: `order_items.variant_id` is `on delete set null`
 * precisely so that removing a product does not destroy order history, and a
 * cancellation must not be blocked by a variant that no longer exists to credit.
 */
create or replace function public.order_stock_lines(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('variant_id', variant_id, 'quantity', quantity)),
    '[]'::jsonb
  )
    from public.order_items
   where order_id = p_order_id
     and variant_id is not null;
$$;

/**
 * Whether an order in this status is still expected to go out of the door.
 *
 * The two dead statuses are `cancelled` and `refunded`. Note this is *not* the
 * same question as "is it holding stock" — see `set_order_status`, where
 * entering the two differs and leaving them differs again.
 */
create or replace function public.order_status_is_live(p_status public.order_status)
returns boolean
language sql
immutable
as $$
  select p_status not in ('cancelled', 'refunded');
$$;

-- -------------------------------------------------------------- set_order_status

/**
 * Move an order to a new status, moving stock with it where that is implied.
 *
 * Refuses to reinstate an order whose units have since been sold to somebody
 * else — `reserve_inventory` raises `insufficient_inventory`, which surfaces to
 * the operator as a readable refusal rather than as an order that claims to be
 * confirmed against stock that is not there.
 */
create or replace function public.set_order_status(
  p_order_id uuid,
  p_status   public.order_status,
  p_reason   text default ''
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  target     public.orders;
  was_out    boolean;
  releasing  boolean;
  reserving  boolean;
begin
  if not public.is_admin() then
    raise exception 'not_authorised' using errcode = 'insufficient_privilege';
  end if;

  -- Locked for the duration: two operators changing the same order at once must
  -- not both read `stock_released_at` as null and both credit the shelf.
  select * into target
    from public.orders
   where id = p_order_id
     for update;

  if not found then
    raise exception 'Order not found.' using errcode = 'no_data_found';
  end if;

  if target.status = p_status then
    return target;
  end if;

  was_out := target.stock_released_at is not null;

  /*
   * Three cases, and the middle one is why this is not a single boolean.
   *
   *   → cancelled          release. The goods never left; the shelf gets them
   *                        back. Skipped if a previous cancellation already did.
   *   → refunded           touch nothing. A refund routinely follows delivery,
   *                        so the units may be with the customer. If the order
   *                        was cancelled first, the stock is already back and
   *                        must not be taken off again — which an "is it live"
   *                        test alone would do.
   *   → any live status    re-reserve, but only if a cancellation had released
   *                        it. Refuses when the units have since sold.
   */
  releasing := p_status = 'cancelled' and not was_out;
  reserving := was_out and public.order_status_is_live(p_status);

  if releasing then
    perform public.release_inventory(public.order_stock_lines(p_order_id));
  elsif reserving then
    -- Raises `insufficient_inventory:<variant>` if the units have gone.
    perform public.reserve_inventory(public.order_stock_lines(p_order_id));
  end if;

  update public.orders
     set status            = p_status,
         stock_released_at = case
                               when releasing then now()
                               when reserving then null
                               else stock_released_at
                             end,
         cancelled_at      = case
                               when p_status = 'cancelled' then now()
                               when target.status = 'cancelled' then null
                               else cancelled_at
                             end,
         cancel_reason     = case
                               when p_status = 'cancelled'
                                 then nullif(btrim(coalesce(p_reason, '')), '')
                               when target.status = 'cancelled' then null
                               else cancel_reason
                             end,
         updated_at        = now()
   where id = p_order_id
   returning * into target;

  return target;
end;
$$;

-- ------------------------------------------------------------ set_order_tracking

/**
 * Record how a parcel can be followed.
 *
 * Blank strings are stored as null rather than as empty text, so the storefront
 * can test the column for presence instead of every reader having to know that
 * '' means absent.
 *
 * Deliberately does not change the status. Adding a tracking number usually
 * accompanies dispatch, but not always — a label can be bought a day early —
 * and an action that silently advanced the customer-visible status would make
 * "shipped" mean "somebody typed something".
 */
create or replace function public.set_order_tracking(
  p_order_id uuid,
  p_carrier  text default null,
  p_number   text default null,
  p_url      text default null
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.orders;
begin
  if not public.is_admin() then
    raise exception 'not_authorised' using errcode = 'insufficient_privilege';
  end if;

  update public.orders
     set tracking_carrier = nullif(btrim(coalesce(p_carrier, '')), ''),
         tracking_number  = nullif(btrim(coalesce(p_number, '')), ''),
         tracking_url     = nullif(btrim(coalesce(p_url, '')), ''),
         updated_at       = now()
   where id = p_order_id
   returning * into target;

  if not found then
    raise exception 'Order not found.' using errcode = 'no_data_found';
  end if;

  return target;
end;
$$;

-- ----------------------------------------------------------------- delete_order

/**
 * Remove an order permanently.
 *
 * Guarded rather than freely available, for two reasons that are not the same:
 *
 *   1. **Money.** An order with a succeeded or refunded payment is the store's
 *      record that a customer was charged. Deleting it destroys the only
 *      first-party evidence of a transaction the provider will still happily
 *      confirm, and a shop that cannot reconcile against its own books has a
 *      problem no undo button solves. Those are refused outright — cancel them,
 *      which keeps the row and the audit trail.
 *
 *   2. **Stock.** Anything still holding units must give them back on the way
 *      out, or deleting a pending order quietly destroys inventory.
 *
 * What is left is what deletion is actually for: test rows, duplicates, and
 * abandoned attempts that never took a payment.
 *
 * `order_items` and `payments` are both `on delete cascade`, so the row and its
 * lines go together.
 */
create or replace function public.delete_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.orders;
  paid   integer;
begin
  if not public.is_admin() then
    raise exception 'not_authorised' using errcode = 'insufficient_privilege';
  end if;

  select * into target
    from public.orders
   where id = p_order_id
     for update;

  if not found then
    raise exception 'Order not found.' using errcode = 'no_data_found';
  end if;

  select count(*) into paid
    from public.payments
   where order_id = p_order_id
     and status in ('succeeded', 'refunded');

  if paid > 0 then
    raise exception
      'This order has a settled payment and cannot be deleted. Cancel it instead, which keeps the record.'
      using errcode = 'check_violation';
  end if;

  if target.stock_released_at is null then
    perform public.release_inventory(public.order_stock_lines(p_order_id));
  end if;

  delete from public.orders where id = p_order_id;
end;
$$;

-- --------------------------------------------------------------------- grants

-- `authenticated` only: every one of these re-checks `is_admin()` internally, so
-- the grant is not the boundary, but there is no reason for `anon` to hold it.
revoke all on function public.set_order_status(uuid, public.order_status, text) from public, anon;
revoke all on function public.set_order_tracking(uuid, text, text, text)        from public, anon;
revoke all on function public.delete_order(uuid)                                from public, anon;
revoke all on function public.order_stock_lines(uuid)                           from public, anon;

grant execute on function public.set_order_status(uuid, public.order_status, text) to authenticated;
grant execute on function public.set_order_tracking(uuid, text, text, text)        to authenticated;
grant execute on function public.delete_order(uuid)                                to authenticated;
