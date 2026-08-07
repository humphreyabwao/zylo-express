-- ---------------------------------------------------------------------------
-- ZYLO Express — provider credentials, editable from the portal
--
-- Until now Paystack was configured only by `PAYSTACK_SECRET_KEY` in the
-- environment, which means a key rotation is a redeploy and switching between
-- test and live is a code change. This table moves that decision into Settings.
--
-- ## Why this is not in `site_settings`
--
-- `site_settings` is readable by anyone — its select policy is `using (true)`,
-- because the storefront resolves display currency and the free-shipping
-- threshold from it on every request, for signed-out visitors. Migration 13
-- put the rule on the table itself:
--
--     'Never put a secret in this table.'
--
-- A secret key there would be one anonymous PostgREST call away from the
-- public. So provider credentials get their own table with the opposite
-- posture.
--
-- ## How this table is protected
--
-- RLS is enabled and **no policy is created**. That is deliberate and is the
-- whole security model: with RLS on, Postgres denies every row to every role
-- that is subject to it, and a table with zero policies has nothing that can
-- grant an exception. The anon key cannot read it. The authenticated key
-- cannot read it. A signed-in superadmin's browser session cannot read it.
--
-- Only the service role reaches it, because that role bypasses RLS — and that
-- key exists solely on the server. So the read path is: Server Action or route
-- handler → `createAdminClient()` → this table. There is no path from a
-- browser, which means a leaked JWT is not a leaked payment key.
--
-- The portal edits these values through a Server Action that returns a *masked*
-- view; the secret itself is written but never read back to a client. See
-- src/lib/payments/credentials.ts.
-- ---------------------------------------------------------------------------

create table if not exists public.payment_credentials (
  provider text primary key
    check (provider in ('paystack', 'paypal')),

  -- Which set of keys is live. Kept beside the keys rather than in the
  -- environment so that "we are testing" and "here is the test key" cannot
  -- disagree — the pair that gets used is chosen by one column.
  mode text not null default 'test'
    check (mode in ('test', 'live')),

  -- Both pairs are stored so switching modes is a toggle, not a re-entry.
  -- A shop that has been through onboarding keeps its sandbox keys for the
  -- next time it needs to reproduce something without moving real money.
  test_secret_key text,
  test_public_key text,
  live_secret_key text,
  live_public_key text,

  -- The currency the provider settles in — the one the account is registered
  -- for. Orders are booked in the store's base currency and converted to this
  -- at charge time; see src/lib/payments/currency.ts.
  settlement_currency text not null default 'KES'
    check (settlement_currency ~ '^[A-Z]{3}$'),

  -- An operator switch that does not destroy the keys. Turning a provider off
  -- removes its methods from checkout while leaving it configured.
  enabled boolean not null default true,

  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

comment on table public.payment_credentials is
  'Payment provider API keys. NOT publicly readable — RLS is enabled with no '
  'policies, so only the service role reaches this. Never expose a secret key '
  'to a client; the portal reads a masked view through a Server Action.';

comment on column public.payment_credentials.mode is
  'Which key pair is in force: test (sandbox) or live (production).';

-- Enabled with no policies: deny-all for anon and authenticated, service role
-- bypasses. Adding a policy here would open the very hole this table exists to
-- close, so any future policy needs a much better reason than convenience.
alter table public.payment_credentials enable row level security;

-- ------------------------------------------------------------------ seeding

-- A row per provider so the portal has something to edit on first open. Keys
-- stay null until an operator supplies them; the resolver treats a null secret
-- as "not configured" and falls back to the environment, so an existing
-- deployment keeps working through this migration with nothing to do.
insert into public.payment_credentials (provider, mode, settlement_currency)
values
  ('paystack', 'test', 'KES'),
  ('paypal',   'test', 'USD')
on conflict (provider) do nothing;

-- ------------------------------------------------------------------- updated

create or replace function public.touch_payment_credentials()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists payment_credentials_touch on public.payment_credentials;

create trigger payment_credentials_touch
  before update on public.payment_credentials
  for each row
  execute function public.touch_payment_credentials();
