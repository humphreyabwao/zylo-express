-- ---------------------------------------------------------------------------
-- ZYLO Express — Storage buckets and query RPCs
-- ---------------------------------------------------------------------------

-- =============================================================== storage ==

-- Product and editorial imagery. Public read: these are catalogue photos meant
-- to be CDN-cached and hotlinked by next/image. Writes are staff-only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', true, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do nothing;

-- Avatars and anything user-uploaded. Private; served via signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-content', 'user-content', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "media publicly readable" on storage.objects
  for select using (bucket_id = 'media');

create policy "media writable by staff" on storage.objects
  for all using (bucket_id = 'media' and public.is_admin())
  with check (bucket_id = 'media' and public.is_admin());

-- Each user is confined to a folder named for their uid. The first path
-- segment is compared against auth.uid(), so one user cannot read or write
-- another's objects even knowing the exact path.
create policy "user content owned" on storage.objects
  for all
  using (
    bucket_id = 'user-content'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'user-content'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- =================================================================== rpcs ==

-- Weighted product search. Ranking happens in Postgres against the stored
-- tsvector; pulling the catalogue into Node to score it does not scale and
-- would put the whole product list in the response.
create or replace function public.search_products(
  p_query text,
  p_limit integer default 20
)
returns setof public.products
language sql
stable
security invoker
set search_path = public
as $$
  select p.*
    from public.products p
   where p.is_active
     and (
       p.search_vector @@ websearch_to_tsquery('simple', p_query)
       or p.name ilike '%' || p_query || '%'
     )
   order by
     ts_rank(p.search_vector, websearch_to_tsquery('simple', p_query)) desc,
     similarity(p.name, p_query) desc,
     p.rating desc
   limit least(greatest(p_limit, 1), 100);
$$;

-- Facet counts for the refinement panel, computed in one round trip.
--
-- Counts come from the unfiltered scope so they stay stable while a shopper
-- toggles refinements — standard retail behaviour, and it means the panel does
-- not have to be re-fetched on every checkbox.
create or replace function public.catalog_facets(
  p_category_slug text default null,
  p_collection_slug text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with scope as (
    select p.*
      from public.products p
     where p.is_active
       and (p_category_slug is null or p.category_slug = p_category_slug)
       and (
         p_collection_slug is null
         or exists (
           select 1
             from public.product_collections pc
             join public.collections c on c.id = pc.collection_id
            where pc.product_id = p.id and c.slug = p_collection_slug
         )
       )
  )
  select jsonb_build_object(
    'categories', coalesce((
      select jsonb_agg(x order by x.count desc, x.label)
        from (
          select c.slug as value, c.name as label, count(*)::int as count
            from scope s
            join public.categories c on c.slug = s.category_slug
           group by c.slug, c.name
        ) x
    ), '[]'::jsonb),

    'countries', coalesce((
      select jsonb_agg(x order by x.count desc, x.label)
        from (
          select co.code as value,
                 co.name as label,
                 co.flag_emoji as flag,
                 co.lead_time_min_days as lead_min,
                 co.lead_time_max_days as lead_max,
                 count(*)::int as count
            from scope s
            join public.countries co on co.code = s.origin_country_code
           group by co.code, co.name, co.flag_emoji,
                    co.lead_time_min_days, co.lead_time_max_days
        ) x
    ), '[]'::jsonb),

    'collections', coalesce((
      select jsonb_agg(x order by x.count desc, x.label)
        from (
          select c.slug as value, c.name as label, count(*)::int as count
            from scope s
            join public.product_collections pc on pc.product_id = s.id
            join public.collections c on c.id = pc.collection_id
           group by c.slug, c.name
        ) x
    ), '[]'::jsonb),

    'colors', coalesce((
      select jsonb_agg(x order by x.count desc, x.label)
        from (
          select v.value, v.label, v.hex, count(distinct s.id)::int as count
            from scope s
            join public.product_options o
              on o.product_id = s.id and o.type = 'color'
            join public.product_option_values v on v.option_id = o.id
           group by v.value, v.label, v.hex
        ) x
    ), '[]'::jsonb),

    'sizes', coalesce((
      select jsonb_agg(x order by x.count desc, x.label)
        from (
          select v.value, v.label, count(distinct s.id)::int as count
            from scope s
            join public.product_options o
              on o.product_id = s.id and o.type = 'size'
            join public.product_option_values v on v.option_id = o.id
           group by v.value, v.label
        ) x
    ), '[]'::jsonb),

    'flags', coalesce((
      select jsonb_agg(x order by x.count desc, x.value)
        from (
          select f::text as value, count(*)::int as count
            from scope s, unnest(s.flags) f
           group by f
        ) x
    ), '[]'::jsonb),

    'priceRange', jsonb_build_object(
      'min', coalesce((select min(price) from scope), 0),
      'max', coalesce((select max(price) from scope), 0)
    )
  );
$$;

-- Atomically claim stock for a set of variants. Returns false and changes
-- nothing if any line is short, so a race between two checkouts cannot
-- oversell: the UPDATE ... WHERE inventory_quantity >= n is the lock.
create or replace function public.reserve_inventory(p_lines jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  line record;
  updated integer;
begin
  for line in
    select (value ->> 'variant_id')::uuid as variant_id,
           (value ->> 'quantity')::integer as quantity
      from jsonb_array_elements(p_lines)
     order by 1            -- consistent lock order across concurrent callers
  loop
    update public.product_variants
       set inventory_quantity = inventory_quantity - line.quantity
     where id = line.variant_id
       and inventory_quantity >= line.quantity;

    get diagnostics updated = row_count;

    if updated = 0 then
      raise exception 'insufficient_inventory:%', line.variant_id
        using errcode = 'check_violation';
    end if;
  end loop;

  return true;
end;
$$;

-- Bumps a promotion's redemption count. Separate from order creation so the
-- increment is atomic rather than a read-modify-write from the application.
create or replace function public.increment_promotion_usage(p_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.promotions
     set usage_count = usage_count + 1
   where code = upper(p_code);
$$;

-- Order references are shown to customers and used in support tickets, so
-- they avoid ambiguous glyphs (0/O, 1/I) rather than being raw base32.
create or replace function public.generate_order_reference()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  candidate text;
  i integer;
begin
  loop
    candidate := 'ZYL-';
    for i in 1..6 loop
      candidate := candidate ||
        substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (
      select 1 from public.orders where reference = candidate
    );
  end loop;
  return candidate;
end;
$$;
