import { createBrowserClient } from '@supabase/ssr';

// Create a new client for each call - this ensures fresh cookie reading
// The @supabase/ssr library handles connection pooling internally
export function createClient() {
  console.log('[Supabase] Creating browser client');

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
