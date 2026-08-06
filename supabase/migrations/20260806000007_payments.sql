-- ---------------------------------------------------------------------------
-- ZYLO Express — payments
--
-- An order is written `pending` and holds stock; money is collected against a
-- `payments` row; only a verified provider confirmation promotes the order to
-- `confirmed`. Nothing in this file trusts a browser: every amount here is the
-- one the server computed, and every status transition is driven by a payload
-- whose signature we checked.
--
-- Two currencies are recorded per payment on purpose. `amount`/`currency` are
-- the store's books (USD minor units, matching orders.total). `charge_amount`/
-- `charge_currency` are what the provider actually moved — Paystack Kenya
-- settles KES, PayPal settles USD — plus the rate used. Reconciliation needs
-- both, and a rate that drifted later must not rewrite what someone paid.
-- ---------------------------------------------------------------------------

create type public.payment_provider as enum ('paystack', 'paypal');

-- The customer-facing instrument, not the provider's internal channel name.
-- 'mpesa' is Paystack's mobile_money channel narrowed to the one provider we
-- offer; widening it later is an enum addition, not a schema change.
create type public.payment_method as enum ('card', 'mpesa', 'paypal');

create type public.payment_status as enum (
  'pending',     -- created, customer has not acted yet
  'processing',  -- provider has it: STK push sent, or redirect in flight
  'succeeded',
  'failed',
  'abandoned',   -- customer walked away, or we expired it
  'refunded'
);

create table public.payments (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references public.orders (id) on delete cascade,

  provider           public.payment_provider not null,
  method             public.payment_method not null,
  status             public.payment_status not null default 'pending',

  -- Our idempotency key, generated before the provider is called and sent as
  -- their `reference`. Unique, so a retried submit cannot double-charge.
  reference          text unique not null,
  -- Their id for the same transaction, learned from the response or webhook.
  provider_reference text,

  -- Store books. Must equal orders.total for the linked order.
  amount             integer not null,
  currency           public.currency_code not null default 'USD',

  -- Presentment. What the provider was actually asked to move.
  charge_amount      integer not null,
  charge_currency    text not null,
  -- charge_amount / amount, recorded so a total can be re-derived exactly.
  exchange_rate      numeric(18, 8) not null default 1,

  -- Paystack/PayPal hosted page for card and PayPal flows. Null for M-Pesa,
  -- which never leaves the site.
  authorization_url  text,
  -- E.164 msisdn the STK push went to. Null for every other method.
  phone              text,

  failure_reason     text,
  paid_at            timestamptz,
  -- Past this, a pending payment is abandoned and its stock released.
  expires_at         timestamptz not null default now() + interval '30 minutes',

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint payments_amount_positive check (amount > 0 and charge_amount > 0),
  constraint payments_rate_positive check (exchange_rate > 0),
  -- Money having moved must be recorded, and unsettled states must not claim
  -- a time. `refunded` is on the paid side of this: a refund is something that
  -- happens to a payment that succeeded, and clearing `paid_at` on refund
  -- would erase when the sale actually occurred.
  constraint payments_paid_at_matches_status check (
    (status in ('succeeded', 'refunded')) = (paid_at is not null)
  )
);

create index payments_order_idx    on public.payments (order_id, created_at desc);
create index payments_status_idx   on public.payments (status, created_at desc);
create index payments_provider_ref on public.payments (provider, provider_reference);
-- Drives the sweep below; only pending work is ever scanned.
create index payments_expiry_idx on public.payments (expires_at)
  where status in ('pending', 'processing');

-- --------------------------------------------------------------- webhooks

-- Providers retry webhooks, and both of ours deliver at-least-once. The unique
-- constraint is the idempotency guard: a replayed delivery loses the insert
-- race and is dropped before it can re-run any side effect.
create table public.payment_events (
  id          uuid primary key default gen_random_uuid(),
  provider    public.payment_provider not null,
  -- The provider's own event id, or a hash of the payload when they send none.
  event_id    text not null,
  event_type  text not null,
  payment_id  uuid references public.payments (id) on delete set null,
  payload     jsonb not null,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);

create index payment_events_payment_idx on public.payment_events (payment_id, received_at desc);

-- ------------------------------------------------------------------- rpcs

-- Return stock claimed by `reserve_inventory`. Written as its own function
-- rather than reserve_inventory with negative quantities: that trick works,
-- but it reads as a bug at every call site and skips the >= guard silently.
create or replace function public.release_inventory(p_lines jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  line record;
begin
  for line in
    select (value ->> 'variant_id')::uuid as variant_id,
           (value ->> 'quantity')::integer as quantity
      from jsonb_array_elements(p_lines)
     order by 1
  loop
    update public.product_variants
       set inventory_quantity = inventory_quantity + line.quantity
     where id = line.variant_id;
  end loop;
end;
$$;

-- Promote an order once its payment is verified.
--
-- Runs as one statement pair inside an implicit transaction, and is guarded on
-- the payment still being unsettled. Paystack's webhook and our own redirect
-- verification routinely arrive within milliseconds of each other; whichever
-- loses updates zero rows and returns false, so the promotion, the promotion
-- counter, and any confirmation email fire exactly once.
create or replace function public.settle_payment(
  p_reference          text,
  p_provider_reference text,
  p_charge_amount      integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments;
begin
  update public.payments
     set status             = 'succeeded',
         paid_at            = now(),
         provider_reference = coalesce(p_provider_reference, provider_reference),
         charge_amount      = coalesce(p_charge_amount, charge_amount),
         failure_reason     = null
   where reference = p_reference
     and status in ('pending', 'processing')
  returning * into v_payment;

  if v_payment.id is null then
    return false;
  end if;

  update public.orders
     set status = 'confirmed'
   where id = v_payment.order_id
     and status = 'pending';

  return true;
end;
$$;

-- Fail a payment and hand its stock back.
--
-- Also guarded on the unsettled states, so a late failure webhook arriving
-- after a successful capture cannot cancel a paid order or double-release
-- inventory.
create or replace function public.fail_payment(
  p_reference text,
  p_reason    text,
  p_status    public.payment_status default 'failed'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments;
  v_lines   jsonb;
begin
  update public.payments
     set status         = p_status,
         failure_reason = left(coalesce(p_reason, ''), 500)
   where reference = p_reference
     and status in ('pending', 'processing')
  returning * into v_payment;

  if v_payment.id is null then
    return false;
  end if;

  select coalesce(
           jsonb_agg(jsonb_build_object(
             'variant_id', oi.variant_id,
             'quantity',   oi.quantity
           )),
           '[]'::jsonb
         )
    into v_lines
    from public.order_items oi
   where oi.order_id = v_payment.order_id
     and oi.variant_id is not null;

  perform public.release_inventory(v_lines);

  update public.orders
     set status = 'cancelled'
   where id = v_payment.order_id
     and status = 'pending';

  return true;
end;
$$;

-- Sweep abandoned checkouts.
--
-- Without this, every closed tab on a redirect flow strands its stock forever:
-- the order stays `pending`, the units stay claimed, and the last piece of a
-- limited run becomes unbuyable. Schedule it (pg_cron, or a Vercel cron
-- hitting a route that calls it) every few minutes.
create or replace function public.expire_pending_payments()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reference text;
  v_count integer := 0;
begin
  for v_reference in
    select reference
      from public.payments
     where status in ('pending', 'processing')
       and expires_at < now()
  loop
    if public.fail_payment(v_reference, 'Checkout expired.', 'abandoned') then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

-- -------------------------------------------------------------------- rls

alter table public.payments       enable row level security;
alter table public.payment_events enable row level security;

-- A customer may see the payment attached to an order they own — enough to
-- render "paid with M-Pesa ending 4821" in order history. Writes are
-- service_role only: every status transition in this file happens behind a
-- verified provider signature, never from a session.
create policy "payments readable by order owner" on public.payments
  for select using (
    exists (
      select 1 from public.orders o
       where o.id = order_id and o.user_id = auth.uid()
    )
  );

create policy "payments admin writes" on public.payments
  for all using (public.is_admin()) with check (public.is_admin());

-- Raw provider payloads are operational data, and can carry customer contact
-- details. Staff only, no customer-facing path at all.
create policy "payment events admin only" on public.payment_events
  for all using (public.is_admin()) with check (public.is_admin());

create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();
