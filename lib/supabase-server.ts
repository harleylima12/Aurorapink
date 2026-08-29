import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Auth-aware Supabase client for Server Components, Server Actions and
 * Route Handlers. Reads the session from the request's cookies (kept
 * fresh by middleware.ts) so RLS policies see the logged-in admin user.
 */
export async function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    }
  );
}
