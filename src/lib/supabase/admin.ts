import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Privileged client. The secret key BYPASSES Row Level Security entirely.
 *
 * Reach for this only where a trusted server-side operation genuinely needs to
 * act outside a user's permissions:
 *   - the seed script
 *   - order creation, which must read true catalogue prices
 *   - the realtime proxy, which subscribes on behalf of many viewers
 *
 * Anything acting *as a user* must use `createClient()` from ./server so RLS
 * still applies. `import "server-only"` turns a Client Component import of
 * this file into a build error rather than a leaked key.
 */
let cached: SupabaseClient<Database> | null = null;

export function createAdminClient(): SupabaseClient<Database> {
  if (cached) return cached;

  cached = createSupabaseClient<Database>(
    env.supabaseUrl,
    env.supabaseSecretKey,
    {
      auth: {
        // No user session to persist or refresh — this client is not a person.
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
      global: {
        headers: { "x-application-name": "zylo-express-server" },
      },
    }
  );

  return cached;
}
