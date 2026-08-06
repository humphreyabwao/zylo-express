-- ---------------------------------------------------------------------------
-- ZYLO Express — OAuth-aware profile provisioning
--
-- `handle_new_user` originally read only `first_name` and `last_name`, which
-- is what our own sign-up form writes into `raw_user_meta_data`. An OAuth
-- provider writes a different shape: Google sends `given_name`/`family_name`
-- plus a pre-joined `full_name` (and `name`), and never sends our two keys. A
-- customer arriving through "Continue with Google" therefore landed with a
-- profile row whose names were both null, and the account header fell back to
-- the local-part of their email address.
--
-- This replaces the trigger with one that understands both shapes, and
-- backfills the rows that were created before it existed.
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------------ name parsing

-- Splits a display name into given/family. Deliberately simple: everything
-- before the first space is the given name, the remainder is the family name.
-- That is wrong for some names and right for most, and it only ever runs when
-- the provider gave us no structured fields to use instead.
create or replace function public.split_display_name(display_name text)
returns table (given text, family text)
language sql
immutable
as $$
  select
    nullif(split_part(trim(display_name), ' ', 1), ''),
    nullif(
      trim(substr(trim(display_name), strpos(trim(display_name), ' ') + 1)),
      ''
    )
  where trim(coalesce(display_name, '')) <> ''
    and strpos(trim(display_name), ' ') > 0

  union all

  -- A single word is a given name with no family name, not a null pair.
  select nullif(trim(display_name), ''), null
  where trim(coalesce(display_name, '')) <> ''
    and strpos(trim(display_name), ' ') = 0;
$$;

-- Resolves the best available first/last name from any provider's metadata.
-- Order of preference:
--   1. our own sign-up form's `first_name` / `last_name`
--   2. the provider's structured `given_name` / `family_name` (Google, GitHub)
--   3. a split of `full_name`, then `name`
create or replace function public.names_from_metadata(meta jsonb)
returns table (first_name text, last_name text)
language plpgsql
immutable
as $$
declare
  display text;
  parts   record;
begin
  first_name := nullif(meta ->> 'first_name', '');
  last_name  := nullif(meta ->> 'last_name', '');

  if first_name is null then
    first_name := nullif(meta ->> 'given_name', '');
  end if;
  if last_name is null then
    last_name := nullif(meta ->> 'family_name', '');
  end if;

  if first_name is null then
    display := coalesce(
      nullif(meta ->> 'full_name', ''),
      nullif(meta ->> 'name', '')
    );

    if display is not null then
      select * into parts from public.split_display_name(display);
      first_name := coalesce(first_name, parts.given);
      last_name  := coalesce(last_name, parts.family);
    end if;
  end if;

  return next;
end;
$$;

-- --------------------------------------------------------------- the trigger

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved record;
begin
  select * into resolved from public.names_from_metadata(new.raw_user_meta_data);

  insert into public.profiles (id, email, first_name, last_name, marketing_opt_in)
  values (
    new.id,
    new.email,
    resolved.first_name,
    resolved.last_name,
    -- Absent for OAuth sign-ups: consent has to be asked for, never assumed
    -- from a provider that was not asked about marketing at all.
    coalesce((new.raw_user_meta_data ->> 'marketing_opt_in')::boolean, false)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- The trigger itself is unchanged, but recreate it so a database that somehow
-- lost it during an earlier partial run ends up consistent either way.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------ backfill

-- Rows created by the previous trigger from OAuth metadata have null names
-- even though auth.users held them all along. Only touches rows where both
-- are null, so a customer who has since edited their profile is left alone.
update public.profiles p
set first_name = resolved.first_name,
    last_name  = resolved.last_name,
    updated_at = now()
from auth.users u,
     lateral public.names_from_metadata(u.raw_user_meta_data) as resolved
where p.id = u.id
  and p.first_name is null
  and p.last_name is null
  and (resolved.first_name is not null or resolved.last_name is not null);

-- An OAuth user may also predate any profile row at all, if they signed in
-- while the trigger was missing. Provision those now.
insert into public.profiles (id, email, first_name, last_name)
select u.id, u.email, resolved.first_name, resolved.last_name
from auth.users u,
     lateral public.names_from_metadata(u.raw_user_meta_data) as resolved
where not exists (select 1 from public.profiles p where p.id = u.id)
  and u.email is not null
on conflict (id) do nothing;
