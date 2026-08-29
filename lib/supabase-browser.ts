import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Auth-aware Supabase client for Client Components (login form, logout
 * button). Unlike the plain client in lib/supabase.ts, this syncs the
 * session into cookies (not just localStorage) so middleware and Server
 * Components can read it on subsequent requests.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Same as createClient(), but never throws — returns null if the Supabase
 * env vars are missing or client construction otherwise fails. Use this
 * anywhere the client is built outside a user-initiated action (e.g. on
 * mount), where an unguarded throw would crash the whole page.
 */
export function tryCreateClient(): SupabaseClient | null {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    console.error(
      "Supabase env vars ausentes (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)."
    );
    return null;
  }

  try {
    return createClient();
  } catch (error) {
    console.error("Falha ao criar cliente Supabase:", error);
    return null;
  }
}
