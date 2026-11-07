import { config } from 'dotenv';
import type { NextConfig } from 'next';

// One .env for the whole repo. Only public values are passed to the browser:
// the Supabase URL, the publishable (anon) key and the API URL. Never the secret key.
config({ path: ['.env', '../../.env'], quiet: true });

const nextConfig: NextConfig = {
  // @hoc/shared ships TypeScript source.
  transpilePackages: ['@hoc/shared'],
  env: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '',
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
  },
};

export default nextConfig;
