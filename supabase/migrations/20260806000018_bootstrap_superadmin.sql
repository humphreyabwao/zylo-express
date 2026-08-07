-- ---------------------------------------------------------------------------
-- ZYLO Express — promote the owner to superadmin
--
-- The third and last of the permission migrations. 16 adds the enum value, 17
-- defines the helpers that name it, and this promotes the owner — each in its
-- own transaction, because Postgres refuses to use a new enum value in the
-- transaction that added it.
--
-- Run after 17.
--
-- Change the address below if the owner is someone else.
-- ---------------------------------------------------------------------------

update public.profiles
   set role = 'superadmin'
 where email = 'humphreyabwao@gmail.com';

-- Fail loudly rather than leaving a portal nobody can fully administer.
do $$
begin
  if not exists (select 1 from public.profiles where role = 'superadmin') then
    raise exception
      'No superadmin exists. Set the email in migration 18 to an account that '
      'has signed up, then re-run. Without one, nobody can grant module '
      'permissions to anybody.';
  end if;
end
$$;
