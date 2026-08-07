-- ---------------------------------------------------------------------------
-- ZYLO Express — record_sale learns about status
--
-- A cash sale is complete when the drawer shuts, and that is still the default.
-- A sale paid by card or M-Pesa is not: the charge takes seconds to a minute
-- to authorise on the customer's handset, and until it does the shop has
-- goods on the counter and no money.
--
-- So the till writes those as `pending`. The stock still comes off in the same
-- transaction — the goods are spoken for either way, and the alternative is
-- selling the last unit twice while a prompt is outstanding. `settle_payment`
-- promotes it to completed, `fail_payment` cancels it and returns the stock.
--
-- Dropped and recreated rather than overloaded: adding a defaulted parameter
-- to `create or replace` makes a second function with a different signature
-- rather than replacing the first, and two candidates that differ only by a
-- trailing default is exactly the ambiguity that produces a confusing
-- "function is not unique" at the call site.
-- ---------------------------------------------------------------------------

drop function if exists public.record_sale(
  text, text, text, public.sale_payment_method, integer, integer, text, jsonb
);

create function public.record_sale(
  p_operator_name  text,
  p_customer_name  text,
  p_customer_email text,
  p_payment_method public.sale_payment_method,
  p_discount       integer,
  p_tendered       integer,
  p_note           text,
  p_items          jsonb,
  p_status         public.sale_status default 'completed'
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

  -- A sale may not be written already cancelled: cancelling has to return the
  -- stock, and this function has just taken it off.
  if p_status = 'cancelled' then
    raise exception 'A sale cannot be recorded as cancelled.';
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
    subtotal, discount, total, payment_method, tendered, note, status
  )
  values (
    auth.uid(), coalesce(p_operator_name, ''),
    nullif(trim(coalesce(p_customer_name, '')), ''),
    nullif(trim(coalesce(p_customer_email, '')), ''),
    v_subtotal, p_discount, v_subtotal - p_discount,
    p_payment_method, p_tendered, coalesce(p_note, ''), p_status
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
  text, text, text, public.sale_payment_method, integer, integer, text, jsonb,
  public.sale_status
) from public, anon;

grant execute on function public.record_sale(
  text, text, text, public.sale_payment_method, integer, integer, text, jsonb,
  public.sale_status
) to authenticated;
