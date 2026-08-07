-- ---------------------------------------------------------------------------
-- ZYLO Express — store settings, and the currency table behind them
--
-- `site_settings` has existed since migration 3 and `scripts/seed.ts` has been
-- writing three keys into it — `free_shipping_threshold`, `tax_rate` and
-- `announcement` — which nothing has ever read back. The values the storefront
-- actually used were the constants in `src/data/commerce.ts`, changeable only
-- by a deploy.
--
-- This adds the currency keys and makes the table the source of truth. The
-- existing flat key names are kept rather than namespaced: inventing a
-- parallel `storefront.*` namespace would leave two rows meaning the same
-- thing and no way to tell which one is live.
--
-- `announcements` (plural, a list) is new and sits beside the seed's
-- `announcement` (singular, a {text, href} object). The bar rotates through a
-- list, so the singular row is left alone rather than reshaped under a script
-- that may still be writing it.
--
-- ## What is deliberately NOT here
--
-- `currency_code` is untouched, and no money column changes type. The
-- catalogue stays priced in USD minor units and orders stay booked in USD —
-- display currency is a presentation concern, resolved per request from the
-- rates below. Widening the enum would invite a KES-priced product row, and
-- then a promotions table with a fixed $250 discount and a revenue query that
-- sums across currencies would both be quietly wrong.
--
-- The payments layer already models the other half of this properly: it stores
-- `amount`/`currency` (the books) alongside `charge_amount`/`charge_currency`
-- and the `exchange_rate` used. That separation is what makes a refund six
-- weeks later still agree with the original charge, and it is why this
-- migration does not disturb it.
-- ---------------------------------------------------------------------------

-- --------------------------------------------------------------- seeding

-- `on conflict do nothing`, so re-running never clobbers a value an operator
-- has since changed. The description column is what the admin form renders as
-- help text, so it is worth writing properly.
insert into public.site_settings (key, value, description) values

  -- ------------------------------------------------------------- currency

  (
    'currency.base',
    '"USD"'::jsonb,
    'The ledger currency. Every price, order and payment amount in the database is stored in this currency''s minor units. Changing it does not convert anything — it only changes what those stored numbers claim to mean, so it is not editable from the portal.'
  ),
  (
    'currency.default',
    '"KES"'::jsonb,
    'What a visitor sees before they choose. Must be one of the enabled currencies.'
  ),
  (
    'currency.enabled',
    '["USD","EUR","GBP","KES"]'::jsonb,
    'Currencies offered in the storefront switcher. The base currency is always available and cannot be removed.'
  ),
  (
    'currency.rates',
    '{"USD":1,"EUR":0.92,"GBP":0.79,"KES":129}'::jsonb,
    'Units of each currency per 1 USD. Seed values only — refreshed from the live FX provider (see src/lib/fx.ts) within hours of first use.'
  ),
  (
    'currency.rates_updated_at',
    'null'::jsonb,
    'When the FX provider last updated the stored rates. Written by the refresh, not by hand.'
  ),
  (
    'currency.rates_source',
    'null'::jsonb,
    'Host the rates were fetched from.'
  ),

  -- ----------------------------------------------------------- storefront

  (
    'free_shipping_threshold',
    '50000'::jsonb,
    'Order subtotal, in base-currency minor units, above which standard delivery is free. 50000 = $500.00.'
  ),
  (
    'announcements',
    '["Complimentary delivery above $500","Private appointments in Paris, London, New York and Tokyo"]'::jsonb,
    'Rotating messages in the bar above the header.'
  )

on conflict (key) do nothing;

-- --------------------------------------------------------------- realtime

-- A settings change has to reach open storefront tabs, not just the operator
-- who made it — that is the whole point of editing the store currency from the
-- portal rather than from a deploy.
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
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'site_settings'
  ) then
    alter publication supabase_realtime add table public.site_settings;
  end if;
end
$$;

-- `key` is the primary key and is all a subscriber needs, so the default
-- replica identity would technically do. `full` is set anyway for consistency
-- with the other broadcast tables, and because the projection reads `key` off
-- the old row on a delete.
alter table public.site_settings replica identity full;

-- ------------------------------------------------------------------ notes

comment on table public.site_settings is
  'Key/value store for values the portal edits. Publicly readable by design — '
  'the storefront resolves display currency and shipping thresholds from here '
  'on every request. Never put a secret in this table.';
