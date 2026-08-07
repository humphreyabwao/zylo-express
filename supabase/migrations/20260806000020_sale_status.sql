-- ---------------------------------------------------------------------------
-- ZYLO Express — sale status, approval and cancellation
--
-- A till sale was final the moment it was rung up: the row was written, stock
-- came off, and there was no way back short of editing the table by hand. A
-- counter needs to void a mis-keyed sale, and a shop with junior staff needs
-- to look at one before it counts.
--
-- Three states:
--
--   pending     recorded, stock already held, not yet counted as takings
--   completed   confirmed. The default, because money changed hands at the
--               counter and pretending otherwise would make every figure on
--               the dashboard wrong until somebody clicked a button
--   cancelled   voided. Stock goes back
--
-- ## Why cancelling restores stock and re-approving takes it again
--
-- `record_sale` decrements inventory as part of writing the sale. So the
-- inverse has to increment it, or a voided sale silently loses the shop a unit
-- of stock every time. The pair below are the only supported way to move
-- between states precisely so that the stock movement cannot be forgotten:
-- there is no plain `update sales set status = …` path in the application.
--
-- Both are SECURITY INVOKER, like record_sale. RLS still decides whether the
-- caller may touch these tables at all; this adds a state machine on top, not
-- a way around the policies.
-- ---------------------------------------------------------------------------

create type public.sale_status as enum ('pending', 'completed', 'cancelled');

alter table public.sales
  add column if not exists status public.sale_status not null default 'completed';

comment on column public.sales.status is
  'pending → completed via approve_sale; either → cancelled via cancel_sale, '
  'which returns the stock. Never update this column directly: the RPCs exist '
  'so the inventory movement cannot be skipped.';

-- Who voided it and why, kept for the audit trail rather than as free text on
-- the sale note — a cancellation reason is a different thing from a counter
-- note and should not overwrite one.
alter table public.sales
  add column if not exists cancelled_at timestamptz;

alter table public.sales
  add column if not exists cancelled_by uuid references auth.users (id) on delete set null;

alter table public.sales
  add column if not exists cancel_reason text not null default '';

-- The list filters on status constantly, and sorts by date within it.
create index if not exists sales_status_created_idx
  on public.sales (status, created_at desc);

-- ------------------------------------------------------------------ cancel

create or replace function public.cancel_sale(
  p_sale_id uuid,
  p_reason  text default ''
)
returns public.sales
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sale public.sales;
  v_item record;
begin
  -- Lock the row first. Two operators voiding the same sale from two tills
  -- would otherwise both pass the status check and both return the stock.
  select * into v_sale
    from public.sales
   where id = p_sale_id
     for update;

  if not found then
    raise exception 'Sale not found.' using errcode = 'no_data_found';
  end if;

  if v_sale.status = 'cancelled' then
    raise exception 'That sale is already cancelled.' using errcode = 'invalid_parameter_value';
  end if;

  -- Put every line back. `variant_id` is null when the product has since been
  -- deleted; there is nothing to credit in that case and the sale still voids.
  for v_item in
    select variant_id, quantity
      from public.sale_items
     where sale_id = p_sale_id
       and variant_id is not null
  loop
    update public.product_variants
       set inventory_quantity = inventory_quantity + v_item.quantity
     where id = v_item.variant_id;
  end loop;

  update public.sales
     set status        = 'cancelled',
         cancelled_at  = now(),
         cancelled_by  = auth.uid(),
         cancel_reason = coalesce(nullif(trim(p_reason), ''), '')
   where id = p_sale_id
  returning * into v_sale;

  return v_sale;
end;
$$;

comment on function public.cancel_sale(uuid, text) is
  'Voids a sale and returns its stock. Refuses a sale that is already '
  'cancelled, so the stock cannot be credited twice.';

-- ----------------------------------------------------------------- approve

create or replace function public.approve_sale(p_sale_id uuid)
returns public.sales
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sale public.sales;
  v_item record;
  v_short text;
begin
  select * into v_sale
    from public.sales
   where id = p_sale_id
     for update;

  if not found then
    raise exception 'Sale not found.' using errcode = 'no_data_found';
  end if;

  if v_sale.status = 'completed' then
    raise exception 'That sale is already completed.' using errcode = 'invalid_parameter_value';
  end if;

  -- Reinstating a cancelled sale has to take the stock back off, and it can
  -- fail: the units went back on the shelf and may have sold since. Checked
  -- before anything is written so the sale is not left half-approved.
  if v_sale.status = 'cancelled' then
    select string_agg(si.product_name, ', ')
      into v_short
      from public.sale_items si
      join public.product_variants pv on pv.id = si.variant_id
     where si.sale_id = p_sale_id
       and pv.inventory_quantity < si.quantity;

    if v_short is not null then
      raise exception 'Not enough stock to reinstate this sale: %', v_short
        using errcode = 'check_violation';
    end if;

    for v_item in
      select variant_id, quantity
        from public.sale_items
       where sale_id = p_sale_id
         and variant_id is not null
    loop
      update public.product_variants
         set inventory_quantity = inventory_quantity - v_item.quantity
       where id = v_item.variant_id;
    end loop;
  end if;

  update public.sales
     set status        = 'completed',
         cancelled_at  = null,
         cancelled_by  = null,
         cancel_reason = ''
   where id = p_sale_id
  returning * into v_sale;

  return v_sale;
end;
$$;

comment on function public.approve_sale(uuid) is
  'Marks a sale completed. Reinstating a cancelled sale takes its stock back '
  'off and fails if it is no longer available.';

revoke all on function public.cancel_sale(uuid, text) from public, anon;
revoke all on function public.approve_sale(uuid) from public, anon;
grant execute on function public.cancel_sale(uuid, text) to authenticated;
grant execute on function public.approve_sale(uuid) to authenticated;
