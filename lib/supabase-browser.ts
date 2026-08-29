import { createBrowserClient } from "@supabase/ssr";

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
