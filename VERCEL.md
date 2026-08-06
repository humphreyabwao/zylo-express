# ZYLO Express — deploying to Vercel

Next.js needs no adapter configuration on Vercel, so there is no `vercel.json`
in this repository and there should not be one unless something below forces it.
What follows is everything that is *not* zero-config.

Deploying the app does not populate the database. If the migrations in
`supabase/migrations/` have not been applied, the storefront renders from the
seed data in `src/data/catalog.ts` and looks completely normal while sign-up,
orders, wishlist and inventory all silently do nothing. Do `supabase/README.md`
first.

## 1. Environment variables

Set these in **Project → Settings → Environment Variables**. Copy the values
from `.env.local`; none of them are `NEXT_PUBLIC_`-prefixed, and that must stay
true — the prefix is what inlines a value into the browser bundle.

| Variable | Scope | Notes |
|---|---|---|
| `SUPABASE_URL` | Build **and** Runtime | See the warning below |
| `SUPABASE_PROJECT_ID` | Runtime | |
| `SUPABASE_PUBLISHABLE_KEY` | Runtime | Subject to RLS |
| `SUPABASE_SECRET_KEY` | Runtime | Bypasses RLS. Never expose |
| `SUPABASE_SERVICE_ROLE_KEY` | Runtime | Legacy JWT; realtime proxy |
| `SITE_URL` | Build and Runtime | Your production origin, no trailing slash |
| `UPSTASH_REDIS_REST_URL` | Runtime | See §3 |
| `UPSTASH_REDIS_REST_TOKEN` | Runtime | See §3 |
| `PAYSTACK_SECRET_KEY` | Runtime | Cards and M-Pesa. Omit to hide both |
| `PAYSTACK_CURRENCY` | Runtime | Defaults to `KES` |
| `PAYPAL_CLIENT_ID` | Runtime | Omit to hide PayPal |
| `PAYPAL_CLIENT_SECRET` | Runtime | |
| `PAYPAL_ENVIRONMENT` | Runtime | `live`, or anything else for sandbox |
| `PAYPAL_WEBHOOK_ID` | Runtime | Without it the PayPal webhook rejects everything |
| `FX_USD_KES` | Runtime | Live rate. Falls back to a stale constant |
| `CRON_SECRET` | Runtime | Bearer token for `/api/payments/expire` |

> **Scope every variable to the environment you are deploying.** Vercel scopes
> each variable to Production, Preview and Development independently, and a
> value set only for Production is *absent* on a preview deployment. Missing
> Supabase variables no longer take the site down — `src/proxy.ts` degrades to
> passing requests through — but sessions will not refresh and auth redirects
> are skipped, and the server log will say so once per instance.

> **`SUPABASE_URL` is read at build time.** `next.config.ts` derives two things
> from it before any request is served: the `images.remotePatterns` entry that
> permits product photography from Supabase Storage, and the `connect-src` and
> `img-src` entries in the Content Security Policy. If it is missing during the
> build, both are silently omitted — every Storage image 404s and the CSP blocks
> the app's own API calls. The build still succeeds. Mark it available to the
> Build step, not Runtime alone.

## 2. Region

The Supabase project is in **eu-central-1** (Frankfurt). Vercel defaults new
projects to `iad1` (Washington), which puts a transatlantic round trip in front
of every query on every server-rendered page.

Set **Project → Settings → Functions → Function Region** to `fra1`.

## 3. Redis is not optional here

`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are blank in
`.env.example` and the code tolerates that by falling back to an in-process
store. That fallback is per-instance, and serverless means many short-lived
instances — so on Vercel the rate limiter in `src/lib/rate-limit.ts` effectively
stops limiting anything, and the cache in `src/lib/cache.ts` loses its entries
between invocations.

Add Upstash from the Vercel marketplace integration; it writes both variables
into the project for you.

## 4. Supabase redirect allow-list

After the first deploy, add the production origin to **Supabase → Authentication
→ URL Configuration → Redirect URLs**:

```
https://<your-domain>/api/auth/callback
```

Supabase rejects any `redirect_to` that is not on this list, and the rejection
surfaces as a failed sign-in rather than a useful error.

Preview deployments get a unique hostname per deployment, which can never be
allow-listed. If you need working sign-in on previews, set `SITE_URL` explicitly
for the Preview environment and allow-list that one origin.

## 5. Deploy

```bash
npm i -g vercel
vercel link
vercel --prod
```

`vercel` deploys from the working directory, so this does not require the branch
to be pushed to GitHub. Connect the Git integration afterwards if you want
deploy-on-push.

## Notes

- **`sharp` is a devDependency.** Vercel performs image optimization itself, so
  this is correct here. It would need promoting to `dependencies` on any host
  that runs `next start` directly.
- **`distDir` is overridden** by `NEXT_DIST_DIR` in `next.config.ts`. That
  variable exists for `npm run verify` and must not be set on Vercel; unset, it
  falls through to `.next`.
- **`src/app/api/realtime/route.ts` is a Server-Sent Events stream** and
  declares `maxDuration = 60`. Serverless functions cannot hold a connection
  open indefinitely, so the browser's `EventSource` reconnects each time the
  ceiling is reached. Nothing calls `useRealtime` yet, so this costs nothing
  today — but each reconnect re-establishes a Supabase subscription, so wire it
  up deliberately rather than on every page.
- **Vercel's Hobby tier is for non-commercial use.** A storefront taking real
  orders needs a paid plan; check current terms.
