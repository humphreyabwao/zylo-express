import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Auth callback.
 *
 * Where Supabase sends the browser after an email confirmation, magic link or
 * password reset. The one-time `code` is exchanged for a session server-side,
 * so the resulting tokens land in httpOnly cookies rather than in a URL
 * fragment the client would have to parse.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/account";

  // Reject absolute and protocol-relative targets: `next` is attacker-supplied
  // and would otherwise turn this into an open redirect.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/account";

  if (!code) {
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent("That link is invalid or has expired.")}`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth] code exchange failed:", error.message);
    return NextResponse.redirect(
      `${origin}/sign-in?error=${encodeURIComponent("We could not sign you in. Please request a new link.")}`
    );
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
