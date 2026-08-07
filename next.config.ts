import type { NextConfig } from "next";

// Not NEXT_PUBLIC_: this is read at config time on the server only. Prefixing
// it would inline the Supabase URL into the client bundle for no reason.
const supabaseHost = process.env.SUPABASE_URL
  ? new URL(process.env.SUPABASE_URL).hostname
  : undefined;

const isProduction = process.env.NODE_ENV === "production";

/**
 * Content Security Policy.
 *
 * Deliberately NOT nonce-based. A per-request nonce has to be generated in
 * `proxy.ts` and injected into every response, which makes every page
 * dynamically rendered — that would disable static generation and CDN caching
 * across the entire storefront. For a catalogue site that trade is not worth
 * it, so scripts run under 'unsafe-inline' (which Next's hydration bootstrap
 * needs anyway) and the remaining directives are locked down hard.
 *
 * The real XSS defence here is that React escapes by default and the only
 * `dangerouslySetInnerHTML` in the app is JSON-LD we serialise ourselves from
 * our own database — no user-supplied string reaches it.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  // 'unsafe-eval' is required by React Refresh in development only.
  isProduction
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  // blob: and data: cover next/image's optimiser output and inlined SVGs.
  `img-src 'self' blob: data:${supabaseHost ? ` https://${supabaseHost}` : ""}`,
  "font-src 'self' data:",
  // Supabase REST, Auth and Storage. No wildcard: only our own project.
  `connect-src 'self'${supabaseHost ? ` https://${supabaseHost} wss://${supabaseHost}` : ""}`,
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // Belt and braces with frame-ancestors, for older browsers.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  /**
   * Build output directory.
   *
   * A `next build` writes freshly-hashed chunks into this directory and deletes
   * the previous ones. If a `next start` or `next dev` server is already
   * running against it, that server keeps serving its in-memory prerendered
   * HTML — which still references the *old* hashes — and every stylesheet and
   * script on every page 404s at once. The symptom is a fully-formed page with
   * no CSS, which looks like a styling bug and is not one.
   *
   * Overriding this lets a verification build run against a scratch directory
   * instead of the one a live server is holding open. See `npm run verify`.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",

  images: {
    // Product photography is served from Supabase Storage once the media is
    // uploaded; the generated plates under /public/media work without it.
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [400, 640, 768, 1024, 1280, 1600, 1920, 2400],
    imageSizes: [64, 96, 128, 256, 384],
    // Next 16 defaults this to 4 hours; catalogue imagery is content-addressed
    // and effectively immutable, so a month avoids needless re-optimisation.
    minimumCacheTTL: 60 * 60 * 24 * 30,
    // Next 16 restricts qualities to [75] by default. Cards and thumbnails
    // look fine lower; hero and gallery plates want more.
    qualities: [60, 75, 90],
    // An SVG from Storage would execute in the image's own origin. We only
    // ever serve raster catalogue photography, so leave this off.
    dangerouslyAllowSVG: false,

    /**
     * SSRF guard on the image optimiser — disabled in development only.
     *
     * Before fetching an upstream image, Next resolves the hostname and
     * rejects the request if any returned address is non-global. The test is
     * `ipaddr.parse(ip).range() !== 'unicast'`.
     *
     * On a network running DNS64/NAT64 (Cloudflare WARP, an IPv6-only or
     * mobile-tethered link) the resolver additionally synthesises IPv6
     * addresses in the `64:ff9b::/96` well-known prefix, which embed the real
     * IPv4 address in the low 32 bits. So Supabase Storage resolves to:
     *
     *   172.64.149.246      -> unicast   (Cloudflare, public)
     *   104.18.38.10        -> unicast   (Cloudflare, public)
     *   64:ff9b::ac40:95f6  -> rfc6052   == 172.64.149.246
     *   64:ff9b::6812:260a  -> rfc6052   == 104.18.38.10
     *
     * ipaddr.js labels the last two `rfc6052`, not `unicast`, so the guard
     * trips and every product image 404s with "hostname resolved to private
     * IP" — even though those are the same two public Cloudflare addresses
     * written a different way. It is a false positive, not a real finding.
     *
     * Turning the guard off is safe *here* specifically because
     * `remotePatterns` above is an exact-hostname allowlist with a fixed path
     * prefix and no wildcards: `/_next/image` cannot be pointed at an
     * arbitrary host in the first place, which is the SSRF that matters. The
     * IP check only adds cover against DNS rebinding on that one Supabase
     * hostname.
     *
     * Kept ON in production regardless — deploy targets resolve Supabase to
     * plain IPv4/IPv6 and never hit this, so there is nothing to trade away.
     */
    dangerouslyAllowLocalIP: !isProduction,
  },

  experimental: {
    optimizePackageImports: ["lucide-react"],
  },

  // Don't advertise the framework.
  poweredByHeader: false,

  async redirects() {
    return [
      {
        // /collections/all rendered the same listing as /shop. One canonical
        // URL per set of products; the old path keeps its link equity.
        source: "/collections/all",
        destination: "/shop",
        permanent: true,
      },
    ];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        source: "/media/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // API responses must never land in a shared cache: several are
        // rate-limited per client, and some are session-scoped.
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
          { key: "X-Robots-Tag", value: "noindex" },
        ],
      },
    ];
  },
};

export default nextConfig;
