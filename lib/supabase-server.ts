import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Auth-aware Supabase client for Server Components, Server Actions and
 * Route Handlers. Reads the session from the request's cookies (kept
 * fresh by middleware.ts) so RLS policies see the logged-in admin user.
 *
 * Returns null instead of throwing if the Supabase env vars are missing,
 * so a misconfigured environment degrades (empty data, redirects) rather
 * than crashing the page.
 */
export async function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "Supabase env vars ausentes (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)."
    );
    return null;
  }

  const cookieStore = cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component render, where cookies are
          // read-only. Middleware already refreshes the session on
          // every request, so this is safe to ignore here.
        }
      },
    },
  });
}
