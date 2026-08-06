import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Request proxy.
 *
 * Next.js 16 renamed the `middleware` convention to `proxy`; the exported
 * function must be named `proxy`. Unlike middleware, this always runs on the
 * Node.js runtime — the edge runtime is not supported here.
 *
 * Two jobs:
 *   1. Refresh the Supabase session and write rotated cookies onto the
 *      response. Server Components cannot set cookies, so if this did not run
 *      before rendering, an expired access token would never be renewed and
 *      users would be logged out roughly hourly.
 *   2. Bounce unauthenticated visitors away from account pages before any
 *      rendering work happens.
 *
 * This is *not* the authorization boundary. Row Level Security is. A proxy
 * check improves the experience (a redirect instead of an empty page) but
 * anything that actually protects data must be enforced in Postgres.
 */

/** Prefixes that require a signed-in user. */
const PROTECTED_PREFIXES = ["/account"];

/** Prefixes that a signed-in user has no reason to see. */
const AUTH_ONLY_PREFIXES = ["/sign-in", "/sign-up"];

/**
 * Warned about once per process, not once per request.
 *
 * A misconfigured deployment serves thousands of requests a minute; logging
 * the same line for each buries everything else in the log.
 */
let warnedAboutConfig = false;

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  /**
   * Pass the request through untouched.
   *
   * Used whenever the session cannot be resolved. It is safe because this
   * proxy is not the authorization boundary — Row Level Security is, and every
   * protected surface re-checks server-side (`requireAdmin`, the account
   * layout, and the RLS policies themselves). What is lost is the *redirect*,
   * a navigation convenience: a signed-out visitor reaches /account and is
   * bounced from there instead of from here.
   *
   * The alternative is what this replaced. These two values were read with
   * non-null assertions and handed straight to `createServerClient`, which
   * throws when either is missing — from a proxy that runs on essentially
   * every request. One absent environment variable therefore returned
   * "Internal Server Error" for the entire site, including the pages that
   * render perfectly well from seed data with no Supabase at all.
   */
  const passThrough = (reason: string) => {
    if (!warnedAboutConfig) {
      warnedAboutConfig = true;
      console.error(
        `[proxy] session handling disabled: ${reason}. ` +
          "Pages render, but sessions will not refresh and auth redirects are " +
          "skipped. Check SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are set " +
          "for this environment."
      );
    }
    return NextResponse.next({ request });
  };

  if (!supabaseUrl || !supabaseKey) {
    return passThrough("Supabase environment variables are missing");
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Written to both request and response: the request copy is what
          // the Server Components rendered downstream will read, the response
          // copy is what the browser stores.
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    }
  );

  // Must run before the response is generated, or a refresh that completes
  // afterwards cannot write its cookies and is silently lost.
  //
  // Wrapped because `getUser()` reaches the network: a Supabase outage, a DNS
  // failure or a paused project all throw here, and an unhandled throw in a
  // proxy is a site-wide 500. A storefront that cannot verify a session should
  // still sell things.
  let user = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (error) {
    console.error("[proxy] session lookup failed:", error);
    return passThrough("Supabase could not be reached");
  }

  const { pathname } = request.nextUrl;

  if (!user && PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    // Send them back where they were headed once they have signed in.
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  // `expired=1` is set by the account layout when it could not resolve a
  // profile despite this proxy admitting the request. Bouncing such a user
  // back to /account would send them straight into the redirect that produced
  // this one — an infinite loop the browser renders as a bare error page. Let
  // them reach the sign-in form and re-authenticate instead.
  const recovering = request.nextUrl.searchParams.get("expired") === "1";

  if (
    user &&
    !recovering &&
    AUTH_ONLY_PREFIXES.some((p) => pathname.startsWith(p))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/account";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // A token refresh writes Set-Cookie. Without this, a CDN in front of the app
  // could cache one visitor's session cookie and serve it to the next.
  response.headers.set("Cache-Control", "private, no-store");

  return response;
}

export const config = {
  /**
   * Skip static assets and image optimisation — running a session refresh for
   * every font and photograph would triple the auth traffic for no benefit.
   *
   * `api/payments` is skipped for a different reason. Those routes are called
   * by Paystack and PayPal, never by a browser, and carry no session cookie —
   * so the `getUser()` above is a guaranteed-useless round trip to Supabase
   * sitting inside a provider's webhook timeout. They authenticate themselves
   * by signature; see the handlers.
   */
  matcher: [
    "/((?!_next/static|_next/image|api/payments|favicon.ico|media/|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff|woff2)$).*)",
  ],
};
