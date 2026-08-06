-- ---------------------------------------------------------------------------
-- ZYLO Express — commerce schema
--
-- Orders snapshot their line data (name, price, image) at purchase time. A
-- catalogue edit six months later must not rewrite what someone was charged,
-- so these are copies, not joins.
-- ---------------------------------------------------------------------------

-- ----------------------------------------------------------------- profiles

create type public.user_role as enum ('customer', 'staff', 'admin');

-- Mirrors auth.users. Supabase owns the auth schema; app-level fields live
-- here so they are queryable and RLS-able like any other table.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  first_name   text,
  last_name    text,
  phone        text,
  role         public.user_role not null default 'customer',
  marketing_opt_in boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role) where role <> 'customer';

-- Provision a profile whenever Supabase Auth creates a user. Doing this in the
-- database rather than the app means a signup can never half-succeed.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, first_name, last_name, marketing_opt_in)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    coalesce((new.raw_user_meta_data ->> 'marketing_opt_in')::boolean, false)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Convenience predicate used throughout the RLS policies.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role in ('admin', 'staff')
  );
$$;

-- ---------------------------------------------------------------- addresses

create table public.addresses (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  label        text,
  first_name   text not null,
  last_name    text not null,
  company      text,
  line1        text not null,
  line2        text,
  city         text not null,
  region       text not null,
  postal_code  text not null,
  country      text not null,
  phone        text not null,
  is_default   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index addresses_user_idx on public.addresses (user_id);

-- At most one default per user, enforced by the database rather than by
-- hoping every write path remembers to clear the previous one.
create unique index addresses_one_default_per_user
  on public.addresses (user_id) where is_default;

-- ------------------------------------------------------------------- orders

create type public.order_status as enum (
  'pending', 'confirmed', 'in-atelier', 'shipped', 'delivered',
  'cancelled', 'refunded'
);

create type public.shipping_speed as enum ('standard', 'express', 'same-day');

create table public.orders (
  id                uuid primary key default gen_random_uuid(),
  -- Human-facing, e.g. "ZYL-8F2K4M". Unique and stable.
  reference         text unique not null,
  user_id           uuid references auth.users (id) on delete set null,
  -- Guest checkout keeps an email even with no account attached.
  email             text not null,
  status            public.order_status not null default 'pending',

  subtotal          integer not null,
  discount          integer not null default 0,
  shipping          integer not null default 0,
  tax               integer not null default 0,
  total             integer not null,
  currency          public.currency_code not null default 'USD',

  promotion_code    text,
  shipping_address  jsonb not null,
  billing_address   jsonb,
  shipping_method   public.shipping_speed not null default 'standard',
  tracking_url      text,
  notes             text,

  placed_at         timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint orders_totals_positive check (
    subtotal >= 0 and discount >= 0 and shipping >= 0 and tax >= 0 and total >= 0
  )
);

create index orders_user_idx   on public.orders (user_id, placed_at desc);
create index orders_status_idx on public.orders (status, placed_at desc);
create index orders_email_idx  on public.orders (lower(email));

create table public.order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references public.orders (id) on delete cascade,
  -- Nulled rather than cascaded: deleting a product must not delete history.
  product_id     uuid references public.products (id) on delete set null,
  variant_id     uuid references public.product_variants (id) on delete set null,

  -- Snapshot at purchase time.
  product_slug   text not null,
  product_name   text not null,
  variant_title  text not null,
  sku            text not null,
  image_url      text,
  origin_country_code text,
  unit_price     integer not null,
  quantity       integer not null,
  line_total     integer not null,

  created_at     timestamptz not null default now(),
  constraint order_items_quantity_positive check (quantity > 0),
  constraint order_items_price_positive check (unit_price >= 0)
);

create index order_items_order_idx on public.order_items (order_id);

-- ---------------------------------------------------------------- wishlists

create table public.wishlist_items (
  user_id     uuid not null references auth.users (id) on delete cascade,
  product_id  uuid not null references public.products (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index wishlist_items_user_idx on public.wishlist_items (user_id, created_at desc);

-- --------------------------------------------------------------- promotions

create type public.promotion_kind as enum ('percentage', 'fixed', 'free-shipping');

create table public.promotions (
  id                uuid primary key default gen_random_uuid(),
  code              text unique not null,
  label             text not null,
  kind              public.promotion_kind not null,
  value             integer not null default 0,
  minimum_subtotal  integer not null default 0,
  usage_limit       integer,
  usage_count       integer not null default 0,
  starts_at         timestamptz,
  ends_at           timestamptz,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint promotions_code_upper check (code = upper(code)),
  constraint promotions_window check (ends_at is null or starts_at is null or ends_at > starts_at)
);

-- ------------------------------------------------------------------ reviews

create table public.reviews (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references public.products (id) on delete cascade,
  user_id      uuid references auth.users (id) on delete set null,
  author_name  text not null,
  rating       smallint not null,
  title        text,
  body         text not null default '',
  is_approved  boolean not null default false,
  created_at   timestamptz not null default now(),
  constraint reviews_rating_range check (rating between 1 and 5)
);

create index reviews_product_idx on public.reviews (product_id, is_approved, created_at desc);

-- Denormalised rating on products is a cache; recompute it from the source.
create or replace function public.refresh_product_rating()
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
     set rating = coalesce((
           select round(avg(r.rating)::numeric, 1)
             from public.reviews r
            where r.product_id = target and r.is_approved
         ), 0),
         review_count = (
           select count(*) from public.reviews r
            where r.product_id = target and r.is_approved
         )
   where p.id = target;

  return null;
end;
$$;

create trigger reviews_refresh_product_rating
  after insert or update or delete on public.reviews
  for each row execute function public.refresh_product_rating();

-- ------------------------------------------------------------ updated_at

create trigger profiles_touch   before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger addresses_touch  before update on public.addresses
  for each row execute function public.touch_updated_at();
create trigger orders_touch     before update on public.orders
  for each row execute function public.touch_updated_at();
create trigger promotions_touch before update on public.promotions
  for each row execute function public.touch_updated_at();
