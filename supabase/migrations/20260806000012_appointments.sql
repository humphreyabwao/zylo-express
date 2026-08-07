-- ---------------------------------------------------------------------------
-- ZYLO Express — appointments, and realtime for the two capture tables
--
-- The storefront has advertised private appointments since it was written:
-- /services#appointments, "Book in {city}" on every boutique, and "Arrange a
-- video appointment" on /boutiques. Every one of those buttons linked to
-- /help/contact, so a booking arrived as free-form prose in the contact inbox
-- with no date, no boutique and no way to tell it from a sizing question.
--
-- This table is what those buttons should always have pointed at.
-- ---------------------------------------------------------------------------

-- --------------------------------------------------------------- enums

-- 'requested' is the state a customer can create. Everything past it is a
-- decision made by staff, which is why the storefront's insert policy below
-- pins the column rather than trusting the payload.
create type public.appointment_status as enum (
  'requested', 'confirmed', 'completed', 'cancelled'
);

create type public.appointment_mode as enum ('in-person', 'video');

-- ---------------------------------------------------------- appointments

create table public.appointments (
  id             uuid primary key default gen_random_uuid(),

  -- Quoted back to the customer in the confirmation and searched on by staff.
  -- Generated rather than supplied: a client-chosen reference is a client-
  -- chosen primary key by another name.
  reference      text unique not null,

  name           text not null,
  email          text not null,
  phone          text,

  mode           public.appointment_mode not null default 'in-person',
  -- Null for a video appointment — there is no room to be in. Checked below.
  boutique       text,

  -- What the customer asked for, not what was agreed. `confirmed_at` is the
  -- one staff set, so a reschedule never overwrites the original request and
  -- the two can be compared.
  preferred_at   timestamptz not null,
  alternate_at   timestamptz,
  confirmed_at   timestamptz,

  party_size     smallint not null default 1,
  interest       text not null default '',
  notes          text not null default '',

  status         public.appointment_status not null default 'requested',
  -- Free-text, staff-only. Never shown to the customer, which is why it is
  -- separate from `notes` — that one is theirs.
  staff_note     text not null default '',

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint appointments_email_format
    check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint appointments_party_size
    check (party_size between 1 and 8),
  -- An in-person appointment needs a boutique; a video one must not carry a
  -- stale city from a half-changed form.
  constraint appointments_boutique_matches_mode check (
    (mode = 'in-person' and boutique is not null and boutique <> '') or
    (mode = 'video' and boutique is null)
  ),
  constraint appointments_alternate_after_preferred
    check (alternate_at is null or alternate_at <> preferred_at)
);

-- The admin list is "what is coming up", filtered by status.
create index appointments_upcoming_idx
  on public.appointments (status, preferred_at);
create index appointments_recent_idx
  on public.appointments (created_at desc);
create index appointments_email_idx on public.appointments (email);

create trigger appointments_touch before update on public.appointments
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------- reference

-- ZY-APT-XXXXXX, from a sequence rather than a random string.
--
-- Random would collide eventually and the retry loop is the kind of code
-- nobody tests. A sequence also means the reference sorts chronologically,
-- which is quietly useful when two staff are reading the same list.
create sequence if not exists public.appointment_reference_seq start 1000;

create or replace function public.set_appointment_reference()
returns trigger
language plpgsql
as $$
begin
  if new.reference is null or new.reference = '' then
    new.reference := 'ZY-APT-' || lpad(
      nextval('public.appointment_reference_seq')::text, 6, '0'
    );
  end if;
  return new;
end;
$$;

create trigger appointments_set_reference
  before insert on public.appointments
  for each row execute function public.set_appointment_reference();

-- ------------------------------------------------------------------ RLS

alter table public.appointments enable row level security;

-- Write-only from the public's side, exactly like `contact_messages`: anyone
-- may request an appointment, nobody may read the diary back. A readable
-- appointments table would leak who is visiting which boutique and when.
--
-- The `with check` pins `status` to 'requested'. Without it a crafted request
-- could insert itself as 'confirmed' and appear in the diary as an agreed
-- booking that no member of staff ever agreed to.
create policy "appointments requestable" on public.appointments
  for insert with check (status = 'requested');

create policy "appointments admin reads" on public.appointments
  for all using (public.is_admin()) with check (public.is_admin());

comment on policy "appointments requestable" on public.appointments is
  'Public write-only, and only in the requested state. Do not request a '
  'representation back (no .select() after insert): the select policy is '
  'admin-only, so RETURNING is refused even though the insert succeeds. '
  'See src/app/actions/appointments.ts.';

-- ------------------------------------------------- newsletter subscribers

-- Same trap, same note. The insert policy from migration 4 already allows an
-- anonymous subscribe; the select policy is admin-only.
comment on policy "newsletter insertable" on public.newsletter_subscribers is
  'Public write-only. Do not request a representation back (no .select() after '
  'insert): the select policy is admin-only, so RETURNING is refused even '
  'though the insert succeeds. See src/app/actions/newsletter.ts.';

-- No extra unique index here, deliberately.
--
-- `email text unique` in migration 3 already creates one, and Postgres names
-- it `newsletter_subscribers_email_key` — so a hand-written
-- `create unique index if not exists newsletter_subscribers_email_key
-- on (lower(email))` would match that name, do nothing, and read for ever
-- afterwards as though case-insensitive uniqueness were enforced. It would
-- not be.
--
-- Case folding happens in the application instead: `subscribeToNewsletter`
-- lowercases before writing, so `Ada@example.com` and `ada@example.com` are
-- one row. That is the conflict target `upsert({ onConflict: "email" })` uses.

-- The admin list sorts newest-first and filters on subscription state.
create index if not exists newsletter_subscribers_recent_idx
  on public.newsletter_subscribers (created_at desc);

-- ------------------------------------------------------- subscribe RPC

-- A signup has to be idempotent, and an anonymous UPSERT cannot be.
--
-- `newsletter insertable` grants INSERT and nothing else, but PostgREST's
-- upsert is `INSERT ... ON CONFLICT DO UPDATE`, which also requires UPDATE.
-- Anonymous callers do not have it, so the upsert is refused with a 401 —
-- verified against this database before writing this function.
--
-- The alternatives are worse. A plain insert 23505s on a second signup, which
-- is a failure reported to somebody who did the right thing, and it cannot
-- reactivate an address that unsubscribed. An anonymous UPDATE policy would
-- let anyone flip `unsubscribed_at` on any address they can guess.
--
-- So the operation is exposed as one narrow SECURITY DEFINER function instead:
-- it runs as its owner, does insert-or-reactivate atomically, and returns
-- nothing — so it also cannot be used to probe whether an address is already
-- on the list.
--
-- `set search_path` is not optional on a SECURITY DEFINER function: without
-- it, a caller who can create objects in an earlier schema on the path can
-- shadow `newsletter_subscribers` and have this run against their own table.
--
-- Known limitation, and the reason `is_confirmed` stays false: like any signup
-- form without double opt-in, this lets somebody enter an address that is not
-- theirs, including one that previously unsubscribed. Wiring a confirmation
-- email is what closes that, and `is_confirmed` is the column it will set.
create or replace function public.subscribe_to_newsletter(
  p_email  text,
  p_source text default 'footer'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.newsletter_subscribers (email, source, unsubscribed_at)
  values (
    lower(trim(p_email)),
    coalesce(nullif(trim(p_source), ''), 'footer'),
    null
  )
  on conflict (email) do update
     set unsubscribed_at = null,
         source          = excluded.source;
end;
$$;

-- Least privilege: revoke the default grant to PUBLIC, then hand execute to
-- exactly the two roles that need it.
revoke all on function public.subscribe_to_newsletter(text, text) from public;
grant execute on function public.subscribe_to_newsletter(text, text)
  to anon, authenticated;

-- --------------------------------------------------------------- realtime

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
    'appointments',           -- a new request → the diary, live
    'newsletter_subscribers'  -- a signup → the audience count
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

-- Both carry personal data, so what the SSE proxy is allowed to project is
-- deliberately narrow — see `CHANNELS` in src/app/api/realtime/route.ts. The
-- replica identity is still `full` because a delete otherwise carries only the
-- primary key, and the projection reads `status` off an appointment.
--
-- Affordable: both are low-write tables written by hand, not on any hot path.
alter table public.appointments           replica identity full;
alter table public.newsletter_subscribers replica identity full;
