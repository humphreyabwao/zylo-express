-- ---------------------------------------------------------------------------
-- ZYLO Express — realtime for the catalogue structure tables
--
-- Migration 8 put `products`, `product_variants` and `orders` into the
-- `supabase_realtime` publication. The admin portal now has Categories,
-- Collections and Media modules whose lists want the same treatment, and none
-- of those three tables is a member — so their `RealtimeRefresh` indicators
-- would sit on "Live" and never receive an event.
--
-- Same reasoning as migration 8 about what is *not* here: nothing carrying
-- personal or financial data joins the publication. These three are catalogue
-- structure — the shape of the shop, not anybody's information.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;
end
$$;

do $$
declare
  target text;
begin
  foreach target in array array[
    'categories',      -- rename, reorder, publish → admin list + storefront nav
    'collections',     -- feature/unfeature, reorder → homepage edits
    'product_images'   -- uploads and deletes → media library
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

-- DELETE events need the pre-image to be useful.
--
-- Under the default replica identity Postgres puts only the primary key in the
-- WAL for a delete, so the SSE proxy's projection — which reads `slug` off a
-- category and `storage_path` off an image — would broadcast nulls and the
-- subscriber would learn that something went without learning what.
--
-- Affordable on all three: categories and collections are small and rarely
-- written, and `product_images` is written when an operator uploads, not on
-- the checkout path. This is the same trade migration 8 made for `products`
-- and declined for `product_variants`.
alter table public.categories     replica identity full;
alter table public.collections    replica identity full;
alter table public.product_images replica identity full;

-- ---------------------------------------------------------------------------
-- Deleting a category must not delete its products.
--
-- `products.category_id` is already `on delete set null`, so the row survives.
-- But `category_slug` is a denormalised copy maintained by
-- `sync_product_category_slug()`, which is a BEFORE INSERT OR UPDATE OF
-- category_id trigger — and a foreign key's `set null` fires as an internal
-- update that does not run that trigger's `of category_id` clause reliably
-- across versions. The result is a product whose `category_id` is null while
-- `category_slug` still names the category that was deleted, which the
-- storefront filter reads as a live category with phantom members.
--
-- This is a statement-level cleanup rather than a trigger on `products`,
-- because it only ever needs to run when a category actually goes.
-- ---------------------------------------------------------------------------

create or replace function public.clear_orphaned_category_slugs()
returns trigger
language plpgsql
as $$
begin
  update public.products
     set category_slug = null
   where category_id is null
     and category_slug is not null;
  return null;
end;
$$;

drop trigger if exists categories_clear_orphaned_slugs on public.categories;

create trigger categories_clear_orphaned_slugs
  after delete on public.categories
  for each statement execute function public.clear_orphaned_category_slugs();
