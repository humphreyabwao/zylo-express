-- ---------------------------------------------------------------------------
-- ZYLO Express — order tracking timeline, public tracking links, and email
--
-- Migration 23 gave an order a carrier and a tracking number. That answers
-- "where do I go to look this up"; it does not answer "where is my parcel". For
-- a shop whose whole proposition is that pieces come from China, Vietnam, Korea
-- and Italy on different clocks, the second question is the one customers
-- actually ask, and until now the only answer was an email to the shop.
--
-- Three things here:
--
--   1. `order_tracking_events` — a checkpoint timeline. Each row is one thing
--      that happened somewhere at some time.
--   2. `orders.tracking_token` — an unguessable id for a public tracking page,
--      so the link in an email works without signing in. Guest checkout has no
--      account to sign into, so this is not a convenience.
--   3. `email_credentials` and `email_deliveries` — Resend's key, kept where a
--      payment key is kept, and a log that makes sending idempotent.
--
-- ## Where checkpoints come from
--
-- Two sources today, and a third left open:
--
--   - **Status changes.** `set_order_status` writes a checkpoint automatically,
--     so a timeline exists for every order without anybody typing anything.
--   - **Staff.** An operator adds "Departed Guangzhou" with a place and a time.
--   - **A carrier webhook**, later. Nothing here assumes a human author: the
--     `source` column exists so a DHL or Aramex integration can write into the
--     same table and the timeline simply gets better, with no schema change and
--     no second rendering path.
--
-- There is deliberately no carrier API integration in this migration. That needs
-- an account and credentials this shop does not have yet, and building the
-- timeline first means the integration has somewhere to land.
-- ---------------------------------------------------------------------------

-- ============================================================ tracking token

/**
 * The id in a public tracking URL.
 *
 * Distinct from `reference`. A reference is a support-desk identifier — quoted
 * in emails, read out on the phone, six characters from a 32-glyph alphabet,
 * which `order-access.ts` already notes is "plenty to avoid collisions and not
 * enough to resist enumeration". A URL that shows an address and a parcel's
 * whereabouts to whoever holds it needs the opposite property, so this is 32
 * characters from the same alphabet — about 160 bits.
 */
create or replace function public.generate_tracking_token()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := '23456789abcdefghijkmnpqrstuvwxyz';
  candidate text;
  i integer;
begin
  loop
    candidate := '';
    for i in 1..32 loop
      candidate := candidate ||
        substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (
      select 1 from public.orders where tracking_token = candidate
    );
  end loop;
  return candidate;
end;
$$;

alter table public.orders
  add column if not exists tracking_token text unique;

-- Every existing order gets one, so the tab works for history rather than only
-- for orders placed after this migration.
update public.orders
   set tracking_token = public.generate_tracking_token()
 where tracking_token is null;

-- New orders get one at insert. A trigger rather than a column default because
-- the uniqueness loop has to see the table, and a default cannot re-roll.
create or replace function public.set_tracking_token()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.tracking_token is null then
    new.tracking_token := public.generate_tracking_token();
  end if;
  return new;
end;
$$;

drop trigger if exists orders_tracking_token on public.orders;

create trigger orders_tracking_token
  before insert on public.orders
  for each row
  execute function public.set_tracking_token();

-- ======================================================== tracking events

create type public.tracking_source as enum ('system', 'staff', 'carrier');

create table if not exists public.order_tracking_events (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders (id) on delete cascade,

  /**
   * The status the order was in when this happened.
   *
   * Nullable, because not every checkpoint is a status change — "Cleared customs
   * in Nairobi" happens while an order sits at `shipped` for a week, and forcing
   * a status onto it would either invent transitions or throw the detail away.
   */
  status       public.order_status,

  /** One line, in the customer's words. "Departed Guangzhou". */
  label        text not null check (btrim(label) <> ''),
  /** Free-form place. "Guangzhou, China" — not a geocode; nothing routes on it. */
  location     text,
  /** ISO-3166 alpha-2, so the timeline can show the same flags the cards do. */
  country_code text references public.countries (code) on delete set null,
  /** Optional second line. "Held for customs inspection." */
  detail       text,

  /**
   * When it happened, which is not when it was recorded.
   *
   * A parcel scanned at 03:00 and typed in at 09:00 belongs at 03:00 on the
   * timeline, or the order of events is the order somebody got round to them.
   */
  occurred_at  timestamptz not null default now(),

  source       public.tracking_source not null default 'staff',

  /**
   * Whether the customer sees it.
   *
   * An internal note — "supplier says two more days, do not promise" — belongs
   * on the same timeline as the fact it explains, not in a separate system the
   * next operator will not think to check.
   */
  is_public    boolean not null default true,

  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

comment on table public.order_tracking_events is
  'Checkpoint timeline for an order. Written by set_order_status (source=system), '
  'by staff from the portal, and — when one exists — by a carrier webhook.';

create index if not exists order_tracking_events_order_idx
  on public.order_tracking_events (order_id, occurred_at desc);

alter table public.order_tracking_events enable row level security;

/**
 * The customer sees public checkpoints on their own orders; staff see all.
 *
 * Mirrors the `order_items` policy, including the guest case: an order with a
 * null `user_id` is reachable by nobody through this policy, which is correct —
 * a guest has no session, and reaches their timeline through the token function
 * below instead.
 */
create policy "tracking events readable by owner" on public.order_tracking_events
  for select using (
    exists (
      select 1 from public.orders o
       where o.id = order_id
         and (
           (o.user_id = auth.uid() and is_public)
           or public.is_admin()
         )
    )
  );

create policy "tracking events admin writes" on public.order_tracking_events
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------ add_tracking_event

/**
 * Record a checkpoint, optionally moving the order's status with it.
 *
 * One call rather than two, because "mark it shipped and say it left Guangzhou"
 * is one action to an operator, and doing it as two statements from a Server
 * Action leaves the timeline disagreeing with the order the moment either
 * fails. `set_order_status` is reused rather than reimplemented so the stock
 * rules stay in exactly one place.
 */
create or replace function public.add_tracking_event(
  p_order_id     uuid,
  p_label        text,
  p_location     text default null,
  p_country_code text default null,
  p_detail       text default null,
  p_status       public.order_status default null,
  p_occurred_at  timestamptz default null,
  p_is_public    boolean default true
)
returns public.order_tracking_events
language plpgsql
security definer
set search_path = public
as $$
declare
  created public.order_tracking_events;
  final_status public.order_status;
begin
  if not public.is_admin() then
    raise exception 'not_authorised' using errcode = 'insufficient_privilege';
  end if;

  if btrim(coalesce(p_label, '')) = '' then
    raise exception 'A checkpoint needs a description.'
      using errcode = 'check_violation';
  end if;

  -- Status first: if it is refused — reinstating against stock that has since
  -- sold — the checkpoint must not be written either.
  if p_status is not null then
    perform public.set_order_status(p_order_id, p_status, '');
  end if;

  select status into final_status from public.orders where id = p_order_id;

  if not found then
    raise exception 'Order not found.' using errcode = 'no_data_found';
  end if;

  insert into public.order_tracking_events (
    order_id, status, label, location, country_code, detail,
    occurred_at, source, is_public, created_by
  )
  values (
    p_order_id,
    final_status,
    btrim(p_label),
    nullif(btrim(coalesce(p_location, '')), ''),
    nullif(btrim(coalesce(p_country_code, '')), ''),
    nullif(btrim(coalesce(p_detail, '')), ''),
    coalesce(p_occurred_at, now()),
    'staff',
    coalesce(p_is_public, true),
    auth.uid()
  )
  returning * into created;

  return created;
end;
$$;

-- --------------------------------------------- a checkpoint on every status change

/**
 * Give every status change a timeline entry, without anybody typing one.
 *
 * A trigger rather than a line inside `set_order_status`, so that a status
 * changed by any other route — a payment settling, a future admin tool, a
 * one-off UPDATE in the SQL editor at 2am — still lands on the timeline. The
 * timeline being complete is the whole reason a customer would trust it.
 *
 * `source = 'system'` distinguishes these from what staff wrote, so the portal
 * can style them differently and a carrier feed can later supersede them.
 */
create or replace function public.log_order_status_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.order_tracking_events (
      order_id, status, label, detail, source, is_public
    )
    values (
      new.id,
      new.status,
      case new.status
        when 'pending'    then 'Order placed'
        when 'confirmed'  then 'Payment confirmed'
        when 'in-atelier' then 'Being prepared'
        when 'shipped'    then 'Dispatched'
        when 'delivered'  then 'Delivered'
        when 'cancelled'  then 'Cancelled'
        when 'refunded'   then 'Refunded'
      end,
      case
        when new.status = 'cancelled' then new.cancel_reason
        else null
      end,
      'system',
      true
    );
  end if;

  return new;
end;
$$;

drop trigger if exists orders_status_event on public.orders;

create trigger orders_status_event
  after update of status on public.orders
  for each row
  execute function public.log_order_status_event();

/**
 * The opening checkpoint.
 *
 * Without this an order's timeline starts empty until something changes, and
 * "we have your order" is the first thing a customer wants to see.
 */
create or replace function public.log_order_placed_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.order_tracking_events (
    order_id, status, label, occurred_at, source, is_public
  )
  values (new.id, new.status, 'Order placed', new.placed_at, 'system', true);
  return new;
end;
$$;

drop trigger if exists orders_placed_event on public.orders;

create trigger orders_placed_event
  after insert on public.orders
  for each row
  execute function public.log_order_placed_event();

-- Backfill, so existing orders have a timeline rather than a blank tab.
insert into public.order_tracking_events (
  order_id, status, label, occurred_at, source, is_public
)
select o.id, o.status, 'Order placed', o.placed_at, 'system', true
  from public.orders o
 where not exists (
   select 1 from public.order_tracking_events e where e.order_id = o.id
 );

-- ================================================== public tracking by token

/**
 * Everything the public tracking page shows, for one token.
 *
 * `security definer` and deliberately unauthenticated: the token *is* the
 * credential, and the page it serves has to work from an email link with no
 * session. Guest checkout means requiring one would lock out exactly the
 * customers with no other way to look.
 *
 * What it returns is chosen line by line. **No address, no email, no totals, no
 * line items.** Someone forwarding a tracking link to a courier, or a link
 * leaking through a referrer header, discloses that a parcel exists and where it
 * has been — not who bought what, for how much, or where they live.
 */
create or replace function public.tracking_by_token(p_token text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  target public.orders;
  events jsonb;
begin
  if btrim(coalesce(p_token, '')) = '' then
    return null;
  end if;

  select * into target
    from public.orders
   where tracking_token = btrim(p_token);

  if not found then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'status', e.status,
        'label', e.label,
        'location', e.location,
        'countryCode', e.country_code,
        'detail', e.detail,
        'occurredAt', e.occurred_at,
        'source', e.source
      )
      order by e.occurred_at asc, e.created_at asc
    ),
    '[]'::jsonb
  )
  into events
  from public.order_tracking_events e
 where e.order_id = target.id
   and e.is_public;

  return jsonb_build_object(
    'reference',       target.reference,
    'status',          target.status,
    'placedAt',        target.placed_at,
    'shippingMethod',  target.shipping_method,
    'trackingCarrier', target.tracking_carrier,
    'trackingNumber',  target.tracking_number,
    'trackingUrl',     target.tracking_url,
    'cancelledAt',     target.cancelled_at,
    'cancelReason',    target.cancel_reason,
    'events',          events
  );
end;
$$;

-- The one function here anon is meant to reach.
grant execute on function public.tracking_by_token(text) to anon, authenticated;

revoke all on function public.add_tracking_event(
  uuid, text, text, text, text, public.order_status, timestamptz, boolean
) from public, anon;

grant execute on function public.add_tracking_event(
  uuid, text, text, text, text, public.order_status, timestamptz, boolean
) to authenticated;

-- ========================================================= email credentials

/**
 * Resend's API key, kept exactly where a payment key is kept.
 *
 * RLS enabled, **no policies** — the same deny-all posture as
 * `payment_credentials`, and for the same reason: with RLS on and no policy,
 * Postgres denies every row to every role subject to it, and only the service
 * role (which exists solely on the server) bypasses. An API key that can send
 * mail as this shop's domain is a spoofing tool, and it does not belong in
 * `site_settings`, whose select policy is `using (true)`.
 *
 * Supabase does not offer a general transactional email API — its email is
 * Auth-only (confirmation, magic link, password reset) — so an external
 * provider is required for order mail rather than merely preferred.
 */
create table if not exists public.email_credentials (
  provider text primary key check (provider in ('resend')),

  api_key   text,

  /**
   * The From address. Resend will only send from a **verified domain**; until
   * one is verified the sandbox sender `onboarding@resend.dev` works but can
   * only deliver to the Resend account's own address. Configurable here so
   * moving from sandbox to a real domain is a form submission, not a deploy.
   */
  from_email text not null default 'onboarding@resend.dev',
  from_name  text not null default 'ZYLO Express',
  reply_to   text,

  enabled boolean not null default false,

  -- Which mail actually goes out. Off by default is wrong for a shop, but on by
  -- default is worse for one that has just pasted a key to try it.
  notify_on_status   boolean not null default true,
  notify_on_tracking boolean not null default true,

  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

comment on table public.email_credentials is
  'Resend API key and sender identity. NOT publicly readable — RLS is enabled '
  'with no policies, so only the service role reaches this.';

alter table public.email_credentials enable row level security;

insert into public.email_credentials (provider) values ('resend')
on conflict (provider) do nothing;

drop trigger if exists email_credentials_touch on public.email_credentials;

create trigger email_credentials_touch
  before update on public.email_credentials
  for each row
  execute function public.touch_payment_credentials();

-- =========================================================== delivery log

/**
 * One row per email we tried to send.
 *
 * Exists for idempotency before it exists for auditing. Every path that sends is
 * re-entrant — a webhook redelivers, an operator double-clicks, a Server Action
 * retries — and "your order has shipped" arriving four times is the kind of
 * mistake customers remember. `dedupe_key` is unique, so the insert *is* the
 * lock: whoever inserts first sends, and everyone else gets a duplicate-key
 * error and stops.
 */
create table if not exists public.email_deliveries (
  id         uuid primary key default gen_random_uuid(),

  kind       text not null,
  order_id   uuid references public.orders (id) on delete cascade,
  event_id   uuid references public.order_tracking_events (id) on delete set null,

  recipient  text not null,
  subject    text not null,

  /**
   * Claimed before the provider is called, updated after.
   *
   * `queued` on insert. If the process dies mid-send the row stays queued, which
   * reads as "we do not know" — the honest state, and distinguishable from a
   * failure we saw.
   */
  status     text not null default 'queued'
    check (status in ('queued', 'sent', 'failed', 'skipped')),

  provider_id text,
  error       text,

  /** What makes a send happen once. See above. */
  dedupe_key text not null unique,

  created_at timestamptz not null default now(),
  sent_at    timestamptz
);

create index if not exists email_deliveries_order_idx
  on public.email_deliveries (order_id, created_at desc);

/**
 * Staff may read the log; nobody else may touch it.
 *
 * Writes go through the service role, so no insert or update policy is needed —
 * and not having one means a compromised customer session cannot forge a
 * delivery record to suppress a real send by stealing its dedupe key.
 */
alter table public.email_deliveries enable row level security;

create policy "email deliveries readable by staff" on public.email_deliveries
  for select using (public.is_admin());
