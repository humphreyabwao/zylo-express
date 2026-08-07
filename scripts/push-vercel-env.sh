#!/usr/bin/env bash
#
# Copy this deployment's environment from .env.local into Vercel.
#
# Why this exists: the Vercel project had *no* environment variables at all,
# which is why the deployed site looked like an older build. Without
# SUPABASE_URL, `isSupabaseConfigured()` is false and src/lib/catalog.ts falls
# back to the bundled seed data in src/data/catalog.ts — a storefront that
# renders perfectly and is not reading your database. The admin portal cannot
# authenticate at all.
#
# Run from the repo root, after `vercel link`:
#
#     bash scripts/push-vercel-env.sh
#
# Values are piped from .env.local and never printed. Re-running is safe:
# --force overwrites an existing value rather than erroring.
#
# Review before running — this uploads secrets to Vercel.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "No .env.local here. Run from the repo root." >&2
  exit 1
fi

if [ ! -d .vercel ]; then
  echo "Not linked to a Vercel project. Run: npx vercel link" >&2
  exit 1
fi

# SITE_URL is handled separately below — the local value is localhost:3000 and
# copying it would point OAuth redirects, payment callbacks, canonical links
# and the sitemap at your laptop.
VARS="
SUPABASE_PROJECT_ID
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
SUPABASE_SERVICE_ROLE_KEY
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
"

push() {
  local name="$1" value="$2" environment="$3"
  if printf '%s' "$value" | npx vercel env add "$name" "$environment" --force >/dev/null 2>&1; then
    echo "  ok    $name -> $environment"
  else
    echo "  FAIL  $name -> $environment" >&2
  fi
}

echo "Pushing environment to Vercel..."

for NAME in $VARS; do
  VALUE="$(grep "^${NAME}=" .env.local | head -1 | cut -d= -f2- || true)"

  if [ -z "${VALUE}" ]; then
    echo "  skip  $NAME (not set locally)"
    continue
  fi

  # SUPABASE_URL is read during `next build`, not only at runtime:
  # next.config.ts derives images.remotePatterns and the CSP connect-src/img-src
  # from it. Missing at build time means every Storage image 404s and the CSP
  # blocks the app's own API calls — and the build still succeeds, so nothing
  # tells you. Hence all three environments, always.
  for ENVIRONMENT in production preview development; do
    push "$NAME" "$VALUE" "$ENVIRONMENT"
  done
done

# ---------------------------------------------------------------- SITE_URL

# Production gets the stable domain explicitly, because that is the origin that
# has to appear in Supabase's redirect allow-list.
#
# Preview is deliberately left unset: src/lib/site-url.ts falls through to
# VERCEL_URL, which is correct per-deployment. A preview host is unique per
# build and can never be allow-listed, so email/password sign-in works there
# but OAuth will not.
PRODUCTION_URL="${1:-https://zylo-express.vercel.app}"
push "SITE_URL" "$PRODUCTION_URL" "production"

echo
echo "Done. Verify with: npx vercel env ls"
echo "Then redeploy — existing deployments do not pick up new variables:"
echo "  npx vercel --prod"
