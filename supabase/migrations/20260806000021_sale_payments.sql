-- ---------------------------------------------------------------------------
-- ZYLO Express — Paystack at the till
--
-- The counter could record that a customer paid by card or M-Pesa, but nothing
-- actually moved: `payment_method` was a label typed by the operator. Online
-- orders meanwhile go through Paystack properly. This lets the till use the
-- same pathway — an STK prompt to the customer's handset, or a hosted card
-- page they open on their own phone.
--
-- ## One payments ledger, two things it can belong to
--
-- `payments.order_id` becomes nullable and `sale_id` joins it, with a check
-- that exactly one is set. The alternative — a separate `sale_payments` table
-- — would mean two reconciliation surfaces, two webhook handlers keyed on the
-- same provider reference, and two places to look when a charge goes missing.
-- The provider does not know the difference and neither should the ledger.
--
-- ## How a till payment settles
--
-- The sale is written first, as `pending`, which holds its stock. Then the
-- charge starts. The two outcomes are already modelled:
--
--   paid      settle_payment marks the sale completed
--   failed    fail_payment cancels it, which returns the stock
--
-- This is what `pending` was for. Before this migration nothing created one,
-- because a cash sale is complete the moment the drawer shuts.
--
-- Both functions are SECURITY DEFINER and are reached from webhooks and the
-- verify path, where there is no operator session to run as. The stock
-- restore is inlined rather than delegated to `cancel_sale`, which is
-- SECURITY INVOKER and would run as nobody here.
-- ---------------------------------------------------------------------------

alter table public.payments
  alter column order_id drop not null;

alter table public.payments
  add column if not exists sale_id uuid references public.sales (id) on delete cascade;

-- Exactly one owner. `num_nonnulls` counts non-null arguments, so this reads
-- as "one of these two, never both, never neither".
alter table public.payments
  drop constraint if exists payments_belongs_to_one;

alter table public.payments
  add constraint payments_belongs_to_one
  check (num_nonnulls(order_id, sale_id) = 1);

create index if not exists payments_sale_idx on public.payments (sale_id);

comment on column public.payments.sale_id is
  'Set for a counter sale taken through the till. Mutually exclusive with '
  'order_id — see the payments_belongs_to_one constraint.';

-- ------------------------------------------------------------------ settle

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

  -- Online order: confirm it. No-ops for a till payment, where order_id is null.
  update public.orders
     set status = 'confirmed'
   where id = v_payment.order_id
     and status = 'pending';

  -- Counter sale: the money is in, so the sale counts as takings. Stock came
  -- off when the sale was written, so there is nothing to move here.
  update public.sales
     set status = 'completed'
   where id = v_payment.sale_id
     and status = 'pending';

  return true;
end;
$$;

-- -------------------------------------------------------------------- fail

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
  v_item    record;
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

  if v_payment.order_id is not null then
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
  end if;

  if v_payment.sale_id is not null then
    -- Guarded on `status = 'pending'` and done before the row is marked, so a
    -- webhook arriving after a manual cancellation cannot credit the stock a
    -- second time.
    if exists (
      select 1 from public.sales
       where id = v_payment.sale_id and status = 'pending'
    ) then
      for v_item in
        select variant_id, quantity
          from public.sale_items
         where sale_id = v_payment.sale_id
           and variant_id is not null
      loop
        update public.product_variants
           set inventory_quantity = inventory_quantity + v_item.quantity
         where id = v_item.variant_id;
      end loop;

      update public.sales
         set status        = 'cancelled',
             cancelled_at  = now(),
             cancel_reason = left(coalesce(p_reason, 'Payment failed'), 240)
       where id = v_payment.sale_id;
    end if;
  end if;

  return true;
end;
$$;
