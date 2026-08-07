-- ---------------------------------------------------------------------------
-- ZYLO Express — per-module permissions
--
-- Until now the portal had two states: staff (everything except role changes
-- and settings) or admin (everything). A stockroom assistant who needed the
-- inventory screen was handed the customer list, the takings and the mailing
-- list along with it.
--
-- This adds a third tier above both, and a per-account list of the modules an
-- account may reach.
--
--   superadmin   every module, always. Cannot be restricted.
--   admin        the modules listed in `permissions`, plus elevated actions
--                within them.
--   staff        the modules listed in `permissions`.
--   customer     no portal access.
--
-- Split across three migrations, because the enum value cannot be used in the
-- transaction that creates it:
--
--   16  the enum value and the `permissions` column
--   17  is_admin(), is_superadmin(), has_module()
--   18  promote the owner to superadmin
--
-- ## Where this is enforced
--
-- Module permissions are enforced in the Server Actions and page guards, not
-- in RLS. That is a deliberate choice and worth being precise about:
--
--   * RLS still decides *whether an account may write at all* — `is_admin()`
--     backs every policy and a customer is refused by Postgres.
--   * Which modules a staff member may use is a narrower question, and the
--     only write path into this application is a Server Action on our own
--     origin. The browser holds no database credential and there is no REST
--     surface to reach around them, so the action guard is the real gate
--     rather than a convenience.
--
-- Expressing module permissions in RLS would mean rewriting every policy in
-- migration 4 to consult an array, for a boundary that already has no way
-- around it. `has_module()` below exists so that a future policy *can* do so
-- where it is worth the cost — payouts, say — without another migration.
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------------------ role

-- This migration adds the value and does nothing else with it.
--
-- Postgres refuses *any* use of a new enum value in the transaction that added
-- it (SQLSTATE 55P04) — not only writing it to a row. A `language sql` function
-- body is parsed at CREATE time, so even mentioning 'superadmin' inside
-- `is_admin()` counts. That is why the helpers live in migration 17 and the
-- promotion in 18: three files, three transactions.
alter type public.user_role add value if not exists 'superadmin';

-- ----------------------------------------------------------- permissions

-- Module segments, matching `ADMIN_NAV` in src/lib/admin/nav.ts. Text rather
-- than an enum: the module list changes with the application, and a migration
-- per new screen is a tax with no safety attached — an unknown segment simply
-- matches nothing.
alter table public.profiles
  add column if not exists permissions text[] not null default '{}';

comment on column public.profiles.permissions is
  'Admin module segments this account may reach, e.g. {products,inventory}. '
  'Ignored for superadmin, which reaches everything. Empty means portal '
  'access with no modules — the dashboard only.';

-- ------------------------------------------------- grandfather existing staff

-- Everyone who already had the portal keeps it.
--
-- The column defaults to `{}`, which under the new model means "the overview
-- and nothing else". Applying this migration without the backfill would take
-- every existing operator — including whoever is running it — down to a
-- dashboard, and the screen they would need in order to grant themselves
-- anything back is Staff, which they would no longer hold.
--
-- New accounts start from the picker's default instead. This is only about not
-- changing what already works.
update public.profiles
   set permissions = array[
     'products', 'inventory', 'categories', 'collections', 'media',
     'pos', 'sales', 'orders', 'promotions', 'customers', 'appointments',
     'journal', 'pages', 'messages', 'subscribers', 'staff', 'settings'
   ]
 where role in ('admin', 'staff')
   and coalesce(array_length(permissions, 1), 0) = 0;
