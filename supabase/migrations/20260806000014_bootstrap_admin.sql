-- ---------------------------------------------------------------------------
-- ZYLO Express — bootstrap the first administrator
--
-- The portal was reachable without signing in, through an `ADMIN_PREVIEW` flag
-- that returned a synthetic operator. That is now removed: `/admin` requires a
-- real session whose profile carries the `staff` or `admin` role.
--
-- Nothing in the database had either role, so without this the portal would be
-- unreachable by anyone. `profiles.role` defaults to `customer` and there is no
-- self-service way to change it — deliberately, since that would be a
-- privilege-escalation endpoint.
--
-- Change the address below before running this if the owner is someone else.
-- ---------------------------------------------------------------------------

update public.profiles
   set role = 'admin'
 where email = 'humphreyabwao@gmail.com'
   and role <> 'admin';

-- Fail loudly rather than leaving a locked-out portal to be discovered later.
do $$
begin
  if not exists (select 1 from public.profiles where role = 'admin') then
    raise exception
      'No administrator exists. Set the email in migration 14 to an account '
      'that has signed up, then re-run. The portal is unreachable until one '
      'profile has role = admin.';
  end if;
end
$$;
