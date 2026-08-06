-- ---------------------------------------------------------------------------
-- ZYLO Express — inventory operations
--
-- Two functions the admin portal's inventory module needs, both of which have
-- to live in the database rather than in application code.
-- ---------------------------------------------------------------------------

-- Apply a relative change to a variant's stock.
--
-- The obvious application-side version — read the quantity, add the delta,
-- write it back — is a lost-update race, and this is the one table in the
-- schema where that race is guaranteed to happen: `reserve_inventory`
-- decrements the same rows on every checkout. An operator receiving three
-- units while two sell would write `old + 3`, silently restoring the two that
-- were just bought.
--
-- `set inventory_quantity = inventory_quantity + delta` is evaluated by
-- Postgres against the row it has locked, so concurrent callers serialise
-- instead of overwriting one another.
--
-- Clamped at zero rather than raising. A negative delta larger than the stock
-- on hand is a stock count finding fewer units than the system believed, which
-- is a normal thing to record — refusing it would leave the operator with no
-- way to enter the truth. The `variants_inventory_positive` check constraint
-- would reject the write anyway; this turns that into the intended outcome.
create or replace function public.adjust_variant_stock(
  p_variant_id uuid,
  p_delta      integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quantity integer;
begin
  update public.product_variants
     set inventory_quantity = greatest(0, inventory_quantity + p_delta)
   where id = p_variant_id
  returning inventory_quantity into v_quantity;

  if v_quantity is null then
    raise exception 'variant_not_found:%', p_variant_id
      using errcode = 'no_data_found';
  end if;

  -- `available` is maintained by the sync_variant_availability trigger on
  -- update of inventory_quantity, so it is already correct by this point.
  return v_quantity;
end;
$$;

-- Inventory totals, computed in one round trip.
--
-- Pulling every variant into Node to sum `price * quantity` works at 100 rows
-- and stops working well before the catalogue is interesting. Postgres is
-- where aggregates belong, and this mirrors how `catalog_facets` already
-- answers the refinement panel.
--
-- `retail_value` is stock at asking price, not cost — the schema has no cost
-- price, so this is the revenue the shelf represents rather than the money
-- tied up in it. Named accordingly so nobody reports it as the latter.
create or replace function public.inventory_summary(
  p_low_threshold integer default 3
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'variant_count',   count(*)::int,
    'unit_count',      coalesce(sum(v.inventory_quantity), 0)::int,
    'out_of_stock',    count(*) filter (where v.inventory_quantity <= 0)::int,
    'low_stock',       count(*) filter (
                         where v.inventory_quantity > 0
                           and v.inventory_quantity <= p_low_threshold
                       )::int,
    'retail_value',    coalesce(sum(v.price * v.inventory_quantity), 0)::bigint,
    -- Restricted to published products: a draft being out of stock is not
    -- something anyone needs to act on, and counting it makes the figure
    -- disagree with what a shopper can see.
    'live_out_of_stock', count(*) filter (
                           where v.inventory_quantity <= 0 and p.is_active
                         )::int
  )
  from public.product_variants v
  join public.products p on p.id = v.product_id;
$$;
