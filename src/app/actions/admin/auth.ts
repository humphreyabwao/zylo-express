"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { RateLimits, clientIdentifier, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

/**
 * Portal authentication.
 *
 * Separate from `@/app/actions/auth` on purpose. The storefront's `signIn`
 * admits any customer and sends them to `/account`; this one has to refuse
 * anyone who is not staff, and refuse them *here* rather than downstream.
 *
 * That refusal is the whole reason this file exists. Reusing the storefront
 * action would sign a customer in successfully, redirect them to `/admin`,
 * where `requireAdmin()` would bounce them back to `/admin/login` — which
 * would sign them in again. A redirect loop the browser reports as a generic
 * error, from a form that appeared to work.
 *
 * Authorization itself is still Row Level Security. This is the door, not the
 * lock: every admin read and write re-checks in Postgres.
 */

export interface AdminAuthState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const credentialsSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

/** Roles permitted into the portal. Mirrors `PORTAL_ROLES` in the guard. */
const PORTAL_ROLES = ["staff", "admin"];

/**
 * Turn Supabase's wording into something an operator can act on.
 *
 * Deliberately does not distinguish "no such account" from "wrong password":
 * that difference is an account-enumeration oracle, and a staff portal is
 * exactly where you would go fishing for one.
 */
function friendlyError(message: string): string {
  const normalised = message.toLowerCase();
  if (normalised.includes("invalid login credentials")) {
    return "That email and password do not match an account.";
  }
  if (normalised.includes("email not confirmed")) {
    return "This account has not confirmed its email address yet.";
  }
  if (normalised.includes("rate limit") || normalised.includes("too many")) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  return "Could not sign in. Please try again.";
}

export async function adminSignIn(
  _previous: AdminAuthState,
  formData: FormData
): Promise<AdminAuthState> {
  // Tight limit, and paired with Supabase's own throttling. A staff portal has
  // a handful of legitimate sign-ins a day; anything more is someone guessing.
  const identifier = await clientIdentifier();
  const limit = await rateLimit("admin:signin", identifier, RateLimits.auth);

  if (!limit.success) {
    return {
      error: `Too many sign-in attempts. Try again in ${Math.ceil(
        limit.reset / 60
      )} minutes.`,
    };
  }

  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors;
    return {
      fieldErrors: Object.fromEntries(
        Object.entries(flat)
          .filter(([, messages]) => messages?.length)
          .map(([field, messages]) => [field, messages![0]!])
      ),
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return { error: friendlyError(error?.message ?? "") };
  }

  // Read the role through the *authenticated* client, so RLS applies to the
  // lookup as well — a session that cannot read its own profile has no
  // business in the portal either.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile || !PORTAL_ROLES.includes(profile.role)) {
    // Sign the session back out rather than leaving a customer holding a live
    // cookie they obtained at a staff URL. They can still sign in normally on
    // the storefront; this just declines to be the door they used.
    await supabase.auth.signOut();

    return {
      error:
        "That account is not a member of staff. Customer accounts sign in on the storefront.",
    };
  }

  // The portal shell renders the operator's name and role, so its cached
  // render is now stale.
  revalidatePath("/admin", "layout");

  // Outside every try/catch: `redirect` signals by throwing, and catching it
  // would turn a successful sign-in into an error message.
  redirect("/admin");
}

/**
 * End the session and return to the door.
 *
 * Back to `/admin/login` rather than the storefront: an operator signing out
 * of the portal is nearly always finishing a shift or handing over a machine,
 * and the next thing wanted is the sign-in form.
 */
export async function adminSignOut(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();

  revalidatePath("/admin", "layout");
  revalidatePath("/", "layout");

  redirect("/admin/login");
}
