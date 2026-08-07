-- ---------------------------------------------------------------------------
-- ZYLO Express — permission helper functions
--
-- Separate from migration 16 because every function below names the
-- 'superadmin' enum value, and Postgres refuses to resolve a new enum value in
-- the transaction that added it (SQLSTATE 55P04). A `language sql` body is
-- parsed at CREATE time, so this is not something the function could defer.
--
-- Run after 16.
-- ---------------------------------------------------------------------------

-- `is_admin()` gains the new tier. Every existing policy calls this, so the
-- superadmin inherits the whole surface without any policy being rewritten.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and role in ('superadmin', 'admin', 'staff')
  );
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'superadmin'
  );
$$;

/**
 * Whether the caller may reach a module.
 *
 * Available to RLS for the day a particular table is worth guarding at the
 * database rather than at the action. Superadmin short-circuits, which is what
 * keeps the tier meaningful.
 */
create or replace function public.has_module(p_segment text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and (
         role = 'superadmin'
         or (role in ('admin', 'staff') and p_segment = any(permissions))
       )
  );
$$;

-- -------------------------------------------------------- self-service RLS

-- A member of staff may read their own permissions — the portal needs them on
-- every render — but must never write them, or the whole model is decorative.
--
-- The existing `profiles` policies already cover reads; this comment records
-- the invariant that `permissions` and `role` are only ever written by the
-- staff actions, which require an elevated identity.
comment on table public.profiles is
  'Role and permissions are written only by src/app/actions/admin/staff.ts, '
  'which requires an elevated (admin or superadmin) caller. There is no '
  'self-service path to either, deliberately — that would be a '
  'privilege-escalation endpoint.';
