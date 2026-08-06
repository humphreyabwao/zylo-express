"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import {
  RateLimits,
  clientIdentifier,
  rateLimit,
} from "@/lib/rate-limit";
import {
  resetRequestSchema,
  signInSchema,
  signUpSchema,
} from "@/lib/validation";

/**
 * Authentication, as Server Actions.
 *
 * Credentials are posted to our own origin and exchanged with Supabase from
 * the server, so no Supabase key is ever present in the browser. The session
 * comes back as an httpOnly cookie, which JavaScript cannot read — an XSS bug
 * on the storefront therefore cannot exfiltrate a token.
 *
 * The same Zod schemas the forms use are re-validated here. Client validation
 * is a convenience; a Server Action is a public HTTP endpoint and must assume
 * the request did not come from our form.
 */

export interface AuthState {
  error?: string;
  /** Field-level errors, keyed by form field name. */
  fieldErrors?: Record<string, string>;
  success?: string;
}

/**
 * Supabase's own messages leak whether an address is registered. Mapping them
 * keeps the copy on-brand and avoids handing an attacker an account oracle.
 */
function friendlyAuthError(message: string): string {
  const normalised = message.toLowerCase();

  if (normalised.includes("invalid login credentials")) {
    return "That email and password combination is not recognised.";
  }
  if (normalised.includes("email not confirmed")) {
    return "Please confirm your email address first — check your inbox.";
  }
  if (normalised.includes("already registered") || normalised.includes("already exists")) {
    return "An account with that address already exists. Try signing in.";
  }
  if (normalised.includes("rate limit") || normalised.includes("too many")) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  return "Something went wrong. Please try again.";
}

/**
 * Only same-origin paths survive. `redirectTo` reaches us from a query string,
 * so an attacker can seed it; without this both sign-in flows would forward a
 * freshly authenticated customer to whatever host they chose.
 */
function safeRedirect(value: FormDataEntryValue | null): string {
  const target = String(value || "/account");
  return target.startsWith("/") && !target.startsWith("//")
    ? target
    : "/account";
}

function fieldErrorsFrom(error: {
  flatten: () => { fieldErrors: Record<string, string[] | undefined> };
}): Record<string, string> {
  const flat = error.flatten().fieldErrors;
  return Object.fromEntries(
    Object.entries(flat)
      .filter(([, messages]) => messages?.length)
      .map(([field, messages]) => [field, messages![0]])
  );
}

/* ---------------------------------------------------------------- sign in */

export async function signIn(
  _previous: AuthState,
  formData: FormData
): Promise<AuthState> {
  const identifier = await clientIdentifier();
  const limit = await rateLimit("auth:signin", identifier, RateLimits.auth);

  if (!limit.success) {
    return {
      error: `Too many sign-in attempts. Try again in ${Math.ceil(limit.reset / 60)} minutes.`,
    };
  }

  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    remember: formData.get("remember") === "on",
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) return { error: friendlyAuthError(error.message) };

  // The layout renders account state, so its cached render is now stale.
  revalidatePath("/", "layout");

  redirect(safeRedirect(formData.get("redirectTo")));
}

/* ---------------------------------------------------------------- sign up */

export async function signUp(
  _previous: AuthState,
  formData: FormData
): Promise<AuthState> {
  const identifier = await clientIdentifier();
  const limit = await rateLimit("auth:signup", identifier, RateLimits.auth);

  if (!limit.success) {
    return { error: "Too many attempts. Please wait a few minutes." };
  }

  const parsed = signUpSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    marketingOptIn: formData.get("marketingOptIn") === "on",
    terms: formData.get("terms") === "on",
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // Read by the `handle_new_user` trigger, which creates the profile row
      // inside the same transaction as the auth user.
      data: {
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
        marketing_opt_in: parsed.data.marketingOptIn,
      },
      emailRedirectTo: `${env.siteUrl}/api/auth/callback`,
    },
  });

  if (error) return { error: friendlyAuthError(error.message) };

  return {
    success:
      "Check your inbox — we have sent a link to confirm your email address.",
  };
}

/* --------------------------------------------------------- google oauth */

/**
 * Starts the Google sign-in flow.
 *
 * Deliberately a Server Action rather than a browser-side `signInWithOAuth`.
 * The client library would need a Supabase key in the bundle, which is the one
 * thing this codebase's data layer is built to avoid — so the authorize URL is
 * minted here and the browser is merely redirected to it.
 *
 * `skipBrowserRedirect` makes that explicit: there is no `window` to navigate,
 * so we take the URL and hand it to Next's `redirect`.
 *
 * The PKCE code verifier is written to a cookie by the `@supabase/ssr` client.
 * That works here because Server Actions may set cookies — the same call from
 * a Server Component would silently drop it and the callback would then fail
 * to exchange the code.
 *
 * Google returns to Supabase, which returns to `/api/auth/callback`, which
 * exchanges the code for an httpOnly session exactly as the email flows do.
 * One session shape, one callback, whichever way the customer signed in.
 */
export async function signInWithGoogle(formData: FormData): Promise<void> {
  const next = safeRedirect(formData.get("redirectTo"));

  const identifier = await clientIdentifier();
  const limit = await rateLimit("auth:oauth", identifier, RateLimits.auth);

  if (!limit.success) {
    redirect(
      `/sign-in?error=${encodeURIComponent("Too many attempts. Please wait a few minutes and try again.")}`
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${env.siteUrl}/api/auth/callback?next=${encodeURIComponent(next)}`,
      skipBrowserRedirect: true,
      // Shows the account chooser rather than silently reusing whichever
      // Google account the browser last used — this is a shared-device
      // storefront, not an internal tool.
      queryParams: { prompt: "select_account" },
    },
  });

  if (error || !data?.url) {
    console.error("[auth] google oauth start failed:", error?.message);
    redirect(
      `/sign-in?error=${encodeURIComponent("Could not reach Google. Please try again, or sign in with your email.")}`
    );
  }

  // External absolute URL — Next issues it as a plain redirect response.
  redirect(data.url);
}

/* ------------------------------------------------------------ reset flow */

export async function requestPasswordReset(
  _previous: AuthState,
  formData: FormData
): Promise<AuthState> {
  const identifier = await clientIdentifier();
  const limit = await rateLimit("auth:reset", identifier, RateLimits.auth);

  if (!limit.success) {
    return { error: "Too many requests. Please wait a few minutes." };
  }

  const parsed = resetRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env.siteUrl}/api/auth/callback?next=/account/settings`,
  });

  // Always the same answer, whether or not the address exists — otherwise
  // this endpoint enumerates registered customers.
  return {
    success:
      "If an account exists for that address, a reset link is on its way.",
  };
}

/* ----------------------------------------------------------------- sign out */

/**
 * Signs the user out and returns them to the storefront.
 *
 * Takes `FormData` so it can be used directly as a `<form action>` — sign-out
 * clears an httpOnly cookie, which only the server can do, and a plain form
 * keeps working if JavaScript never loads. The argument is unused.
 */
export async function signOut(_formData?: FormData): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/");
}
