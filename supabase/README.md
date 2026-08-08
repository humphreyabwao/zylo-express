# ZYLO Express — Supabase setup

The app runs today without any of this: when Supabase is unreachable or
unconfigured, every catalogue read falls back to the seed data in
`src/data/catalog.ts`. Follow these steps to switch it onto the real database.

## 1. Environment

```bash
cp .env.example .env.local
```

Fill in the values from **Dashboard → Project Settings → API**.

Nothing in that file is prefixed `NEXT_PUBLIC_`, and it must stay that way —
that prefix is what inlines a value into the browser bundle. Every Supabase
call in this app is made server-side precisely so no key needs to ship.

## 2. Apply the migrations

**This step cannot be automated from the app**: creating tables is DDL, and
neither the publishable nor the secret key can run DDL through PostgREST. It
needs either the database password or a Supabase access token.

### Option A — SQL Editor, one paste

```bash
npm run schema
```

That writes **`supabase/schema.sql`**: all seven migrations concatenated in
dependency order, with a guard at the top that aborts cleanly if the schema is
already applied. Open **Dashboard → SQL Editor**, paste the whole file, run it
once. The editor runs the buffer as a single transaction, so a failure anywhere
rolls the entire thing back — you never end up half-migrated.

`schema.sql` is generated. Change `migrations/`, then re-run `npm run schema`;
editing the generated file gives you a schema that disagrees with its own
source, and the copy you notice last is the one the database actually ran.

**On a database that is already set up**, the full file is not what you want —
it aborts on its own guard. Ask for just the migrations added since:

```bash
npm run schema -- --from 23     # writes supabase/schema-pending.sql
```

**Do not guess the number.** Ask the database what it has:

```bash
npm run db:status               # supabase migration list --linked
```

The linked project is applied through **23** as of 2026-08-08, so on that
database there is nothing pending and this file is not needed at all. Re-generate
at whatever offset `db:status` reports a gap from.

The file carries no already-applied guard — it cannot know which subset you have
run — so a second run aborts on the first duplicate object, having changed
nothing.

> **Migrations 16, 17 and 18 must arrive as three separate transactions.** 16
> adds `superadmin` to an enum, and Postgres refuses any use of a new enum value
> in the transaction that added it — including inside the function bodies in 17.
> `npm run db:push` (Option B) runs each file in its own transaction and is the
> supported route. Pasting the concatenation across that range will fail at 17.

> **If it stops on `must be owner of table objects`** — that is the storage
> policy block in migration 5. Some projects do not grant the SQL editor's role
> ownership of `storage.objects`. Everything else will have rolled back, so
> create the two buckets by hand first (**Storage → New bucket**: `media`,
> public; `user-content`, private), delete that one `create policy` block, and
> re-run. The bucket UI writes equivalent policies.

| Order | File | What it creates |
|---|---|---|
| 1 | `20260806000001_catalog.sql` | countries, categories, collections, products, images, options, variants, full-text search, triggers |
| 2 | `20260806000002_commerce.sql` | profiles, addresses, orders, order items, wishlist, promotions, reviews |
| 3 | `20260806000003_content.sql` | articles, content pages, site settings, newsletter, contact inbox |
| 4 | `20260806000004_rls.sql` | Row Level Security on every table |
| 5 | `20260806000005_storage_and_rpc.sql` | storage buckets and policies, search/facet/inventory RPCs |
| 6 | `20260806000006_oauth_profiles.sql` | profile trigger that understands OAuth metadata, plus a backfill |
| 7 | `20260806000007_payments.sql` | payments, webhook event log, settle/fail/expire RPCs |
| 8–15 | realtime, inventory, content admin, appointments, settings, bootstrap admin, POS | see the files |
| 16–19 | permissions, permission helpers, bootstrap superadmin, payment credentials | per-module access control |
| 20–22 | sale status, sale payments, record-sale status | till approve/cancel |
| 23 | `20260806000023_order_actions.sql` | order status/tracking/delete RPCs, stock release, `replica identity full` on `orders` |

### Option B — Supabase CLI

```bash
npx supabase link --project-ref gwddqngawlooldswsxey   # asks for the DB password
npx supabase db push
```

Prefer this if you have the database password: it records what has been applied
in `supabase_migrations`, so later changes are incremental rather than another
full paste.

## 3. Seed the catalogue

```bash
npm run seed            # data only
npm run seed -- --media # also upload public/media to Storage (~130 images)
```

Idempotent — every write is an upsert on a natural key, so re-running it is
safe. It uses the secret key and bypasses RLS, which is why it only ever runs
from a terminal.

## 4. Verify

```bash
npm run build
npm start
```

`/shop` should show the same catalogue, now served from Postgres. If a query
fails the app logs `[catalog] … using seed data` and keeps rendering, so check
the server console rather than trusting the page.

## 5. Sign in with Google

The storefront offers two ways in — email/password and Google — and both end
at the same place: `/api/auth/callback` exchanges a one-time code for an
httpOnly session cookie. Nothing below puts a credential in this repository;
the Google client secret lives in the Supabase dashboard.

### a. Google Cloud Console

**APIs & Services → Credentials → Create OAuth client ID → Web application.**

Authorised redirect URI — this is Supabase's callback, *not* ours:

```
https://<PROJECT_REF>.supabase.co/auth/v1/callback
```

That one URI covers every environment. Our own origins are allow-listed in
Supabase (step c), not here, because the browser never talks to Google from
our domain — the flow is Google → Supabase → us.

You will also need an OAuth consent screen. For a public storefront that means
submitting it for verification; until then only test users you list can sign
in, which is the usual reason "it works for me and nobody else".

### b. Enable the provider

**Supabase → Authentication → Providers → Google.** Enable it and paste the
client ID and client secret.

### c. URL configuration

**Supabase → Authentication → URL Configuration.**

- **Site URL** — your production origin, e.g. `https://zylo.example.com`.
- **Redirect URLs** — an allow-list. Supabase rejects any `redirect_to` that
  does not match, and the rejection surfaces as a failed sign-in rather than a
  useful error, so add every origin you actually use:

```
https://zylo.example.com/api/auth/callback
http://localhost:3000/api/auth/callback
```

### d. Keep `SITE_URL` in step

`SITE_URL` is what builds the `redirect_to` handed to Supabase. If it disagrees
with the deployed origin, Google returns to the wrong host — or Supabase
refuses the request because the URL is not in the allow-list above. Set it per
environment, with no trailing slash.

### Account linking

A customer who registered with an email and password and later clicks
"Sign in with Google" on the same verified address is linked to the **same**
user by Supabase — one account, one order history, either door. It relies on
Google having verified the address, which it does for ordinary Gmail accounts.

Because they are one user, the profile row is created once, by the trigger in
migration 6. That trigger reads `given_name`/`family_name`/`full_name` as well
as the `first_name`/`last_name` our own form writes, so a Google customer's
name is populated rather than left null — see the migration for why the
original version got this wrong.

Marketing consent is deliberately **not** inferred for OAuth sign-ups: Google
was never asked, so the profile defaults to opted out and the customer opts in
from account settings.

## 6. Payments

Two providers, both driven entirely server-side — see `src/lib/payments/`.

| Method | Provider | Flow |
| --- | --- | --- |
| Card | Paystack | Initialise → redirect to Paystack's hosted page → callback → verify |
| M-Pesa | Paystack | Charge → STK prompt on the handset → webhook, with the browser polling |
| PayPal | PayPal Orders v2 | Create order → redirect to approval → return → capture |

Set the credentials in `.env.local` (see `.env.example`), then register both
webhooks in the provider dashboards:

```
https://<your-domain>/api/payments/paystack/webhook
https://<your-domain>/api/payments/paypal/webhook
```

Paystack's is authenticated by an HMAC-SHA512 of the raw body keyed by the
secret key. PayPal's needs `PAYPAL_WEBHOOK_ID` — without it the route rejects
every delivery rather than trusting one it cannot verify.

**Schedule the expiry sweep.** Every redirect flow leaks abandoned attempts,
and each one holds its stock in a `pending` order. `/api/payments/expire`
releases them; on Vercel, add to `vercel.json`:

```json
{ "crons": [{ "path": "/api/payments/expire", "schedule": "*/5 * * * *" }] }
```

It requires `CRON_SECRET` as a bearer token and refuses to run without one.

### The `create-order` Edge Function is gone

It has been replaced by `src/lib/orders.ts`, which does the same authoritative
repricing but writes orders as `pending` so that only a verified payment can
confirm one. The old function wrote them `confirmed` outright — if it is still
deployed it is a public endpoint that creates paid-looking orders nobody paid
for. Remove it:

```bash
npx supabase functions delete create-order
```

## 7. Redis (optional, recommended in production)

Create an Upstash Redis database and set `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN`. Without them the cache and rate limiter fall back
to an in-process store, which is per-instance — fine locally, not a real limit
across serverless instances.

---

## Making yourself an admin

Catalogue writes are staff-only. After signing up, promote your account from
the SQL Editor:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

`public.is_admin()` backs every write policy, so the future admin dashboard
authenticates through exactly this and needs no new grants.

## Security notes

- **RLS is the boundary, not key secrecy.** The publishable key is designed to
  be public; it is kept server-side here as defence in depth, but the policies
  in `20260806000004_rls.sql` are what actually protect the data.
- **The secret key bypasses RLS entirely.** It is only used by the seed script,
  the realtime proxy, and order creation. `import "server-only"` makes a Client
  Component import of it a build error.
- **Rotate the keys** if they have ever been pasted into a chat, a ticket, or a
  shared terminal. Dashboard → Project Settings → API → Rotate.
