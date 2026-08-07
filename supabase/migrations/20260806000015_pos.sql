-- ---------------------------------------------------------------------------
-- ZYLO Express — point of sale
--
-- Counter sales, kept separate from `orders`.
--
-- The temptation is to reuse `orders` with a channel flag. They are not the
-- same shape: an order has a customer account, a shipping address, a delivery
-- method, a payment reference and a fulfilment lifecycle that runs for days. A
-- counter sale has a person standing in front of you, no address, no shipping,
-- and is finished the moment it is rung up. Folding one into the other means
-- every order query grows an `and channel = 'online'`, and the first one that
-- forgets it reports counter takings as unfulfilled orders.
--
-- Money is stored in base-currency minor units, exactly like everything else.
-- ---------------------------------------------------------------------------

create type public.sale_payment_method as enum ('cash', 'card', 'mpesa', 'other');

-- ----------------------------------------------------------------- sales

create table public.sales (
  id             uuid primary key default gen_random_uuid(),

  -- Quoted on the receipt and searched on at the counter. Assigned by trigger,
  -- never supplied.
  reference      text unique not null,

  -- Who rang it up. `set null` rather than cascade: a sale is a financial
  -- record and must survive the staff account that made it.
  operator_id    uuid references auth.users (id) on delete set null,
  -- Denormalised so a receipt still names the operator after the account goes.
  operator_name  text not null default '',

  -- Optional. Most counter sales are anonymous.
  customer_name  text,
  customer_email text,

  subtotal       integer not null,
  discount       integer not null default 0,
  total          integer not null,
  currency       public.currency_code not null default 'USD',

  payment_method public.sale_payment_method not null default 'cash',
  -- Cash tendered, so the drawer can show change. Null for every other method.
  tendered       integer,

  note           text not null default '',
  created_at     timestamptz not null default now(),

  constraint sales_amounts_positive
    check (subtotal >= 0 and discount >= 0 and total >= 0),
  constraint sales_total_consistent
    check (total = subtotal - discount),
  -- Taking less than the total is not a sale, it is a debt.
  constraint sales_tendered_covers_total
    check (tendered is null or tendered >= total)
);

create index sales_recent_idx   on public.sales (created_at desc);
create index sales_operator_idx on public.sales (operator_id, created_at desc);

-- ------------------------------------------------------------ sale items

create table public.sale_items (
  id            uuid primary key default gen_random_uuid(),
  sale_id       uuid not null references public.sales (id) on delete cascade,

  -- `set null`, not cascade. Deleting a product must not rewrite last month's
  -- takings — which is why the name, sku and price are copied below.
  variant_id    uuid references public.product_variants (id) on delete set null,
  product_name  text not null,
  variant_title text not null default '',
  sku           text not null default '',

  -- What it sold for, not what it costs today.
  unit_price    integer not null,
  quantity      integer not null,
  line_total    integer not null,

  constraint sale_items_quantity_positive check (quantity > 0),
  constraint sale_items_line_total_consistent
    check (line_total = unit_price * quantity)
);

create index sale_items_sale_idx on public.sale_items (sale_id);

-- ------------------------------------------------------------- reference

create sequence if not exists public.sale_reference_seq start 1000;

create or replace function public.set_sale_reference()
returns trigger
language plpgsql
as $$
begin
  if new.reference is null or new.reference = '' then
    new.reference := 'ZY-POS-' || lpad(
      nextval('public.sale_reference_seq')::text, 6, '0'
    );
  end if;
  return new;
end;
$$;

create trigger sales_set_reference
  before insert on public.sales
  for each row execute function public.set_sale_reference();

-- ------------------------------------------------------------------- RLS

alter table public.sales      enable row level security;
alter table public.sale_items enable row level security;

-- Staff only, both ways. A counter sale has no customer-facing surface at all:
-- nothing on the storefront reads these, and the takings are not a shopper's
-- business.
create policy "sales staff access" on public.sales
  for all using (public.is_admin()) with check (public.is_admin());

create policy "sale items staff access" on public.sale_items
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------ record_sale

-- One transaction: write the sale, write its lines, decrement the stock.
--
-- Doing this as separate statements from the application is how a POS ends up
-- with a sale whose stock never moved, or stock that moved for a sale that was
-- never written. Neither is recoverable from the till.
--
-- Stock is decremented with a guarded UPDATE rather than a read-then-write, so
-- two tills selling the last unit cannot both succeed: the second one matches
-- zero rows and the whole transaction raises.
--
-- SECURITY INVOKER on purpose. It runs as the calling operator, so the RLS
-- policies above are what authorise it — an anonymous caller reaching this
-- function still cannot write a sale.
create or replace function public.record_sale(
  p_operator_name  text,
  p_customer_name  text,
  p_customer_email text,
  p_payment_method public.sale_payment_method,
  p_discount       integer,
  p_tendered       integer,
  p_note           text,
  p_items          jsonb
)
returns public.sales
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sale     public.sales;
  v_item     jsonb;
  v_variant  public.product_variants;
  v_qty      integer;
  v_subtotal integer := 0;
  v_updated  integer;
begin
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
    raise exception 'A sale needs at least one line.';
  end if;

  -- Price from the database, never from the payload. A till that trusts a
  -- client-sent price is a till that can be told to charge nothing.
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Every line needs a positive quantity.';
    end if;

    select * into v_variant
      from public.product_variants
     where id = (v_item->>'variantId')::uuid
     for update;

    if not found then
      raise exception 'That item is no longer in the catalogue.';
    end if;

    v_subtotal := v_subtotal + (v_variant.price * v_qty);
  end loop;

  if p_discount < 0 or p_discount > v_subtotal then
    raise exception 'That discount is not valid for this sale.';
  end if;

  insert into public.sales (
    operator_id, operator_name, customer_name, customer_email,
    subtotal, discount, total, payment_method, tendered, note
  )
  values (
    auth.uid(), coalesce(p_operator_name, ''),
    nullif(trim(coalesce(p_customer_name, '')), ''),
    nullif(trim(coalesce(p_customer_email, '')), ''),
    v_subtotal, p_discount, v_subtotal - p_discount,
    p_payment_method, p_tendered, coalesce(p_note, '')
  )
  returning * into v_sale;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'quantity')::integer;

    select v.*, p.name as product_name into v_variant
      from public.product_variants v
      join public.products p on p.id = v.product_id
     where v.id = (v_item->>'variantId')::uuid;

    -- Guarded: the `>=` is what makes overselling impossible under concurrency.
    update public.product_variants
       set inventory_quantity = inventory_quantity - v_qty
     where id = v_variant.id
       and inventory_quantity >= v_qty;

    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      raise exception 'Not enough stock for %.', v_variant.sku;
    end if;

    insert into public.sale_items (
      sale_id, variant_id, product_name, variant_title, sku,
      unit_price, quantity, line_total
    )
    select
      v_sale.id, v_variant.id, p.name, v_variant.title, v_variant.sku,
      v_variant.price, v_qty, v_variant.price * v_qty
      from public.products p
     where p.id = v_variant.product_id;
  end loop;

  return v_sale;
end;
$$;

revoke all on function public.record_sale(
  text, text, text, public.sale_payment_method, integer, integer, text, jsonb
) from public;
grant execute on function public.record_sale(
  text, text, text, public.sale_payment_method, integer, integer, text, jsonb
) to authenticated;

-- --------------------------------------------------------------- realtime

do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public' and tablename = 'sales'
  ) then
    alter publication supabase_realtime add table public.sales;
  end if;
end
$$;

alter table public.sales replica identity full;
