import { createBrowserClient } from '@supabase/ssr';

let client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (client) {
    return client;
  }

  console.log('[Supabase] Creating new browser client...');

  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  console.log('[Supabase] Client created');

  return client;
}

// Helper to reset client (useful for testing)
export function resetClient() {
  client = null;
}
