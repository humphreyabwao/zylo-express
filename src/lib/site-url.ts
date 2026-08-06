/**
 * Where this deployment lives.
 *
 * One resolver rather than two. The OAuth `redirect_to` (`env.siteUrl`) and the
 * canonical/OG/JSON-LD URLs (`absoluteUrl`) have to agree, and they did not:
 * one read `SITE_URL` while the other read `NEXT_PUBLIC_SITE_URL`, which is set
 * nowhere in this project. Locally the two happened to coincide because both
 * fell back to the same literal. On a deployed host they would not have — every
 * canonical link, OG tag and sitemap entry would have claimed localhost.
 *
 * Deliberately *not* marked `server-only`, unlike `env.ts`. `absoluteUrl` lives
 * in `utils.ts`, which Client Components import for `cn` and `formatPrice`;
 * making this module server-only would turn every one of those into a build
 * error. Nothing secret is read here — only public origins.
 */

/**
 * Resolution order:
 *
 * 1. `SITE_URL`, set explicitly per environment. Always wins, and is what you
 *    should set in production so the value never depends on inference.
 * 2. Vercel's injected host. `VERCEL_PROJECT_PRODUCTION_URL` is the stable
 *    production domain; `VERCEL_URL` is unique per deployment and is the only
 *    one available on a preview build. Neither includes a scheme, so we add it
 *    — Vercel is HTTPS-only.
 * 3. Localhost, so a fresh clone with no environment still renders.
 *
 * A preview deployment falling through to `VERCEL_URL` gets correct metadata
 * but *cannot* complete an OAuth sign-in: that host is unique per deployment,
 * so it can never be in Supabase's redirect allow-list. Set `SITE_URL` on
 * preview environments too if you need to sign in on them.
 */
export function resolveSiteUrl(): string {
  const explicit = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost.replace(/\/$/, "")}`;

  return "http://localhost:3000";
}
