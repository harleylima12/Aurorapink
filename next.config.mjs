/** @type {import('next').NextConfig} */

// Photos live in Supabase Storage, so next/image needs that host on its
// allowlist. Derived from the env var (instead of hardcoded) so a
// different Supabase project works without touching this file.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;

const nextConfig = {
  images: {
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
