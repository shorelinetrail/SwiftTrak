import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

async function testWithTimeout<T>(
  name: string,
  fn: () => Promise<T>,
  timeoutMs: number = 5000
): Promise<{ name: string; success: boolean; timeMs: number; data?: T; error?: string }> {
  const start = Date.now();
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
    return {
      name,
      success: true,
      timeMs: Date.now() - start,
      data: result,
    };
  } catch (error) {
    return {
      name,
      success: false,
      timeMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function GET() {
  const startTime = Date.now();
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    env: {
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSupabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      supabaseUrlPrefix: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + '...',
      nodeEnv: process.env.NODE_ENV,
    },
  };

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    // Run tests in sequence
    const tests = [];

    // Test 1: Basic workstreams query (should always work with anon key)
    tests.push(await testWithTimeout('workstreams_select', async () => {
      const { data, error } = await supabase.from('workstreams').select('id, name').limit(3);
      if (error) throw new Error(error.message);
      return { count: data?.length || 0, sample: data?.[0] };
    }));

    // Test 2: Users table query
    tests.push(await testWithTimeout('users_select', async () => {
      const { data, error } = await supabase.from('users').select('id, role').limit(3);
      if (error) throw new Error(error.message);
      return { count: data?.length || 0, roles: data?.map(u => u.role) };
    }));

    // Test 3: Actions query
    tests.push(await testWithTimeout('actions_select', async () => {
      const { data, error } = await supabase.from('actions').select('id, status').limit(3);
      if (error) throw new Error(error.message);
      return { count: data?.length || 0 };
    }));

    // Test 4: Milestones query
    tests.push(await testWithTimeout('milestones_select', async () => {
      const { data, error } = await supabase.from('milestones').select('id').limit(3);
      if (error) throw new Error(error.message);
      return { count: data?.length || 0 };
    }));

    // Test 5: Auth session check
    tests.push(await testWithTimeout('auth_session', async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw new Error(error.message);
      return { hasSession: !!data?.session, userId: data?.session?.user?.id?.substring(0, 8) };
    }));

    results.tests = tests;
    results.summary = {
      total: tests.length,
      passed: tests.filter(t => t.success).length,
      failed: tests.filter(t => !t.success).length,
      avgTimeMs: Math.round(tests.reduce((a, t) => a + t.timeMs, 0) / tests.length),
    };
    results.totalTimeMs = Date.now() - startTime;
    results.status = tests.every(t => t.success) ? 'healthy' : 'degraded';

  } catch (error) {
    results.error = error instanceof Error ? error.message : 'Unknown error';
    results.status = 'failed';
    results.totalTimeMs = Date.now() - startTime;
  }

  return NextResponse.json(results, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
