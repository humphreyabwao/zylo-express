-- ---------------------------------------------------------------------------
-- ZYLO Express — catalogue schema
--
-- Money is stored as integer minor units (cents). Never floats: 0.1 + 0.2 in
-- IEEE-754 is not 0.3, and that error compounds across an order.
--
-- Column names mirror src/lib/types.ts so rows map onto the domain types with
-- a snake_case → camelCase pass and no other translation.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";     -- gen_random_uuid()
create extension if not exists "pg_trgm";      -- fuzzy product search

-- ------------------------------------------------------------------ helpers

-- Keeps updated_at honest without the application having to remember.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- countries

-- ZYLO Express sources from many origins; shoppers filter on this and every
-- product card shows it, so it is a first-class table rather than free text.
create table public.countries (
  code                text primary key,          -- ISO 3166-1 alpha-2
  name                text not null,
  flag_emoji          text not null,
  -- Advertised handling window, shown as "Ships from China · 7–14 days".
  lead_time_min_days  smallint not null default 7,
  lead_time_max_days  smallint not null default 21,
  is_active           boolean not null default true,
  position            smallint not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint countries_code_format check (code ~ '^[A-Z]{2}$'),
  constraint countries_lead_time_order check (lead_time_max_days >= lead_time_min_days)
);

create index countries_active_idx on public.countries (is_active, position);

-- --------------------------------------------------------------- categories

create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  name         text not null,
  "group"      text not null,               -- nav grouping: Women, Men, Maison
  description  text not null default '',
  position     smallint not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint categories_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create index categories_active_idx on public.categories (is_active, position);

-- -------------------------------------------------------------- collections

create table public.collections (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  tagline       text not null default '',
  description   text not null default '',
  image_url     text,
  image_alt     text not null default '',
  image_width   integer not null default 1600,
  image_height  integer not null default 2000,
  position      smallint not null default 0,
  is_featured   boolean not null default false,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint collections_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create index collections_featured_idx on public.collections (is_active, is_featured, position);

-- ----------------------------------------------------------------- products

create type public.product_flag as enum (
  'new', 'exclusive', 'limited', 'made-to-order', 'final-sale', 'archive'
);

create type public.currency_code as enum ('USD', 'EUR', 'GBP');

create table public.products (
  id                   uuid primary key default gen_random_uuid(),
  slug                 text unique not null,
  name                 text not null,
  tagline              text not null default '',
  excerpt              text not null default '',
  description          text not null default '',
  story                text not null default '',
  details              text[] not null default '{}',
  care                 text[] not null default '{}',
  composition          text not null default '',

  -- Origin. `origin_label` is the human line ("Florence, Italy"); the country
  -- code is what the filter and the card badge actually key on.
  origin_label         text not null default '',
  origin_country_code  text references public.countries (code) on delete set null,
  origin_city          text,

  category_id          uuid references public.categories (id) on delete set null,
  -- Denormalised so the hot filter path avoids a join. Kept in sync by trigger.
  category_slug        text,

  price                integer not null,
  compare_at_price     integer,
  currency             public.currency_code not null default 'USD',

  rating               numeric(2,1) not null default 0,
  review_count         integer not null default 0,
  flags                public.product_flag[] not null default '{}',
  is_featured          boolean not null default false,
  available            boolean not null default true,
  is_active            boolean not null default true,
  published_at         timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint products_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint products_price_positive check (price >= 0),
  constraint products_compare_at_higher
    check (compare_at_price is null or compare_at_price > price),
  constraint products_rating_range check (rating >= 0 and rating <= 5),
  constraint products_review_count_positive check (review_count >= 0)
);

-- Full-text search, maintained by Postgres rather than the application so it
-- can never drift from the row it describes.
alter table public.products
  add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(tagline, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(excerpt, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(composition, '')), 'D') ||
    setweight(to_tsvector('simple', coalesce(origin_label, '')), 'D')
  ) stored;

create index products_search_idx      on public.products using gin (search_vector);
create index products_name_trgm_idx   on public.products using gin (name gin_trgm_ops);
create index products_category_idx    on public.products (category_slug) where is_active;
create index products_origin_idx      on public.products (origin_country_code) where is_active;
create index products_featured_idx    on public.products (is_featured, rating desc) where is_active;
create index products_published_idx   on public.products (published_at desc) where is_active;
create index products_price_idx       on public.products (price) where is_active;
create index products_flags_idx       on public.products using gin (flags);

-- Keeps products.category_slug consistent with the category it points at.
create or replace function public.sync_product_category_slug()
returns trigger
language plpgsql
as $$
begin
  if new.category_id is null then
    new.category_slug := null;
  else
    select slug into new.category_slug
    from public.categories where id = new.category_id;
  end if;
  return new;
end;
$$;

create trigger products_sync_category_slug
  before insert or update of category_id on public.products
  for each row execute function public.sync_product_category_slug();

-- A category slug rename must not orphan the denormalised copy.
create or replace function public.cascade_category_slug()
returns trigger
language plpgsql
as $$
begin
  if new.slug is distinct from old.slug then
    update public.products set category_slug = new.slug where category_id = new.id;
  end if;
  return new;
end;
$$;

create trigger categories_cascade_slug
  after update of slug on public.categories
  for each row execute function public.cascade_category_slug();

-- ------------------------------------------------------- product ↔ collection

create table public.product_collections (
  product_id     uuid not null references public.products (id) on delete cascade,
  collection_id  uuid not null references public.collections (id) on delete cascade,
  position       smallint not null default 0,
  primary key (product_id, collection_id)
);

create index product_collections_collection_idx
  on public.product_collections (collection_id, position);

-- ----------------------------------------------------------- product images

create table public.product_images (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  -- Storage object path, e.g. "products/aurelia-top-handle-1.jpg". Resolved to
  -- a public URL at read time so the bucket can move without a data migration.
  storage_path text not null,
  alt         text not null default '',
  width       integer not null default 1200,
  height      integer not null default 1500,
  position    smallint not null default 0,
  created_at  timestamptz not null default now()
);

create index product_images_product_idx on public.product_images (product_id, position);

-- ---------------------------------------------------------- product options

create type public.option_type as enum ('color', 'size', 'material', 'text');

create table public.product_options (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  name        text not null,                -- "Colour", "Size"
  type        public.option_type not null,
  position    smallint not null default 0,
  unique (product_id, name)
);

create table public.product_option_values (
  id         uuid primary key default gen_random_uuid(),
  option_id  uuid not null references public.product_options (id) on delete cascade,
  value      text not null,                 -- "onyx"
  label      text not null,                 -- "Onyx"
  hex        text,                          -- swatch fill for colour options
  available  boolean not null default true,
  position   smallint not null default 0,
  unique (option_id, value),
  constraint option_value_hex_format check (hex is null or hex ~ '^#[0-9a-fA-F]{6}$')
);

create index product_options_product_idx on public.product_options (product_id, position);
create index product_option_values_option_idx on public.product_option_values (option_id, position);

-- --------------------------------------------------------- product variants

create table public.product_variants (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references public.products (id) on delete cascade,
  sku                 text unique not null,
  title               text not null,
  -- { "Colour": "onyx", "Size": "38" }
  selected_options    jsonb not null default '{}'::jsonb,
  price               integer not null,
  compare_at_price    integer,
  inventory_quantity  integer not null default 0,
  available           boolean not null default true,
  image_id            uuid references public.product_images (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint variants_price_positive check (price >= 0),
  constraint variants_inventory_positive check (inventory_quantity >= 0)
);

create index product_variants_product_idx on public.product_variants (product_id);
create index product_variants_options_idx on public.product_variants using gin (selected_options);

-- Availability is derived from stock, not asserted independently — otherwise
-- the two disagree the moment inventory hits zero.
create or replace function public.sync_variant_availability()
returns trigger
language plpgsql
as $$
begin
  new.available := new.inventory_quantity > 0;
  return new;
end;
$$;

create trigger product_variants_sync_availability
  before insert or update of inventory_quantity on public.product_variants
  for each row execute function public.sync_variant_availability();

-- A product is purchasable when any of its variants is.
--
-- Row-level, because NEW/OLD are not populated in statement-level triggers.
-- TG_OP is branched on explicitly: PL/pgSQL leaves NEW unassigned on DELETE
-- (and OLD unassigned on INSERT), and touching an unassigned record raises.
create or replace function public.sync_product_availability()
returns trigger
language plpgsql
as $$
declare
  target uuid;
begin
  if tg_op = 'DELETE' then
    target := old.product_id;
  else
    target := new.product_id;
  end if;

  update public.products p
     set available = exists (
       select 1 from public.product_variants v
        where v.product_id = target and v.available
     )
   where p.id = target;

  return null;
end;
$$;

create trigger product_variants_sync_product_availability
  after insert or update of available or delete on public.product_variants
  for each row execute function public.sync_product_availability();

-- ------------------------------------------------------------ updated_at

create trigger countries_touch        before update on public.countries
  for each row execute function public.touch_updated_at();
create trigger categories_touch       before update on public.categories
  for each row execute function public.touch_updated_at();
create trigger collections_touch      before update on public.collections
  for each row execute function public.touch_updated_at();
create trigger products_touch         before update on public.products
  for each row execute function public.touch_updated_at();
create trigger product_variants_touch before update on public.product_variants
  for each row execute function public.touch_updated_at();
