-- ---------------------------------------------------------------------------
-- ZYLO Express — enable realtime
--
-- `src/app/api/realtime/route.ts` has been subscribing to `postgres_changes`
-- since it was written, and receiving nothing: Supabase Realtime only forwards
-- changes for tables that belong to the `supabase_realtime` publication, and
-- no migration ever added one. The subscription succeeded, the channel stayed
-- silent, and nothing in the app failed loudly enough to notice.
--
-- Membership is the switch. Nothing else about the tables changes.
--
-- What is *not* enabled matters as much. `profiles`, `addresses` and
-- `payments` carry personal and financial data, and Realtime's authorisation
-- is coarser than a query's — keeping them out means a broadcast can never be
-- the thing that leaks them, regardless of what RLS would have said.
-- ---------------------------------------------------------------------------

do $$
begin
  -- Supabase provisions this publication on every project, but a local
  -- `supabase start` or a hand-rolled Postgres will not have it.
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;
end
$$;

-- `add table` errors if the table is already a member, so each is guarded
-- rather than wrapped in one statement that fails as a unit on re-run.
do $$
declare
  target text;
begin
  foreach target in array array[
    'products',          -- publish/unpublish, price edits → admin list
    'product_variants',  -- stock movement → storefront badges, admin inventory
    'orders'             -- new checkouts → admin dashboard
  ]
  loop
    if not exists (
      select 1
        from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = target
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I', target
      );
    end if;
  end loop;
end
$$;

-- Make DELETE events useful.
--
-- Postgres sends only the primary key in a delete's `old` record under the
-- default replica identity, so a subscriber learns that *something* went but
-- not what — and the SSE proxy's projection, which reads slug and price off
-- the row, would broadcast nulls. `full` puts the whole pre-image in the WAL.
--
-- It costs WAL volume on every update, which is why it is set on `products`
-- (small, rarely written) and not on `product_variants` (written on every
-- single checkout, and whose deletes nothing subscribes to).
alter table public.products replica identity full;
