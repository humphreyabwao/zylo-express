import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

export type TypedClient = SupabaseClient<Database>;

/**
 * Request-scoped Supabase client, authenticated as the signed-in user via the
 * session cookie. Subject to Row Level Security.
 *
 * Server-only by design: the browser never receives a Supabase key, so every
 * read and write is funnelled through Server Components, Server Actions, and
 * Route Handlers where we can also rate-limit and validate.
 */
export async function createClient(): Promise<TypedClient> {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.supabaseUrl,
    env.supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. Token refresh is handled
            // in proxy.ts, which runs before rendering and can write headers,
            // so swallowing this is correct rather than merely convenient.
          }
        },
      },
    }
  );
}

/**
 * A read-only client with no user session attached.
 *
 * Catalogue reads are identical for every visitor, so binding them to a
 * session would make the response uncacheable for no benefit. Anything behind
 * RLS-by-user must use `createClient()` instead.
 */
export function createAnonymousClient(): TypedClient {
  return createServerClient<Database>(
    env.supabaseUrl,
    env.supabasePublishableKey,
    {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    }
  );
}

/**
 * The authenticated user, or null.
 *
 * Uses `getUser()`, which revalidates the JWT against Supabase. `getSession()`
 * only decodes the cookie — it will happily return a forged or expired session
 * — so it must not be used for authorization decisions.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) return null;
  return user;
}

/** The signed-in user's profile row, or null. */
export async function getCurrentProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return data;
}
