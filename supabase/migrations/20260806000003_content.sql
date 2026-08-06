-- ---------------------------------------------------------------------------
-- ZYLO Express — editorial and capture schema
-- ---------------------------------------------------------------------------

-- ----------------------------------------------------------------- articles

create table public.articles (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,
  title             text not null,
  kicker            text not null default '',
  excerpt           text not null default '',
  body              text[] not null default '{}',
  image_url         text,
  image_alt         text not null default '',
  image_width       integer not null default 1600,
  image_height      integer not null default 1000,
  reading_minutes   smallint not null default 3,
  author            text not null default 'ZYLO',
  is_published      boolean not null default true,
  published_at      timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint articles_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create index articles_published_idx
  on public.articles (is_published, published_at desc);

-- ------------------------------------------------------- content pages (CMS)

-- Backs /about, /services, /legal/[slug], /help/[slug]. Static today; this
-- table is what the admin dashboard will edit later.
create table public.content_pages (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  -- Namespaces the slug: 'legal', 'help', 'about', 'services'.
  section       text not null,
  title         text not null,
  subtitle      text not null default '',
  body          jsonb not null default '[]'::jsonb,
  seo_title     text,
  seo_description text,
  is_published  boolean not null default true,
  position      smallint not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index content_pages_section_idx
  on public.content_pages (section, position) where is_published;

-- ------------------------------------------------------------ site settings

-- Single-row-per-key store for values the admin dashboard will drive:
-- announcement bar copy, free-shipping threshold, featured collection, etc.
create table public.site_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- newsletter

create table public.newsletter_subscribers (
  id             uuid primary key default gen_random_uuid(),
  email          text unique not null,
  source         text not null default 'footer',
  is_confirmed   boolean not null default false,
  unsubscribed_at timestamptz,
  created_at     timestamptz not null default now(),
  constraint newsletter_email_format check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

-- ----------------------------------------------------------- contact inbox

create type public.message_status as enum ('new', 'in-progress', 'resolved');

create table public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  email       text not null,
  subject     text not null,
  message     text not null,
  order_reference text,
  status      public.message_status not null default 'new',
  created_at  timestamptz not null default now(),
  constraint contact_email_format check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create index contact_messages_status_idx
  on public.contact_messages (status, created_at desc);

-- ------------------------------------------------------------ updated_at

create trigger articles_touch      before update on public.articles
  for each row execute function public.touch_updated_at();
create trigger content_pages_touch before update on public.content_pages
  for each row execute function public.touch_updated_at();
create trigger site_settings_touch before update on public.site_settings
  for each row execute function public.touch_updated_at();
