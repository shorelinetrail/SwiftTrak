'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createClient as createDirectClient } from '@supabase/supabase-js';

interface TestResult {
  name: string;
  success: boolean;
  timeMs: number;
  error?: string;
  data?: unknown;
}

export default function DebugPage() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [envInfo, setEnvInfo] = useState<Record<string, unknown>>({});

  useEffect(() => {
    // Check environment variables visible to client
    setEnvInfo({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 40) + '...',
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      keyPrefix: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.substring(0, 20) + '...',
    });
  }, []);

  const runTest = async (
    name: string,
    fn: () => Promise<unknown>
  ): Promise<TestResult> => {
    const start = Date.now();
    try {
      const data = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout after 10s')), 10000)
        ),
      ]);
      return { name, success: true, timeMs: Date.now() - start, data };
    } catch (error) {
      return {
        name,
        success: false,
        timeMs: Date.now() - start,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  };

  const runAllTests = async () => {
    setRunning(true);
    setResults([]);
    const newResults: TestResult[] = [];

    // Test 1: Direct fetch to Supabase REST API
    newResults.push(
      await runTest('Direct fetch (no library)', async () => {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        const response = await fetch(`${url}/rest/v1/workstreams?select=id&limit=1`, {
          headers: {
            apikey: key!,
            Authorization: `Bearer ${key}`,
          },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      })
    );
    setResults([...newResults]);

    // Test 2: Direct supabase-js client (not SSR)
    newResults.push(
      await runTest('supabase-js direct', async () => {
        const client = createDirectClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );
        const { data, error } = await client.from('workstreams').select('id').limit(1);
        if (error) throw error;
        return data;
      })
    );
    setResults([...newResults]);

    // Test 3: SSR client (what the app uses)
    newResults.push(
      await runTest('SSR client (createBrowserClient)', async () => {
        const client = createClient();
        const { data, error } = await client.from('workstreams').select('id').limit(1);
        if (error) throw error;
        return data;
      })
    );
    setResults([...newResults]);

    // Test 4: Auth getSession
    newResults.push(
      await runTest('Auth getSession', async () => {
        const client = createClient();
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        return { hasSession: !!data.session };
      })
    );
    setResults([...newResults]);

    // Test 5: Auth getUser
    newResults.push(
      await runTest('Auth getUser', async () => {
        const client = createClient();
        const { data, error } = await client.auth.getUser();
        if (error) throw error;
        return { userId: data.user?.id?.substring(0, 8) };
      })
    );
    setResults([...newResults]);

    // Test 6: Users table query
    newResults.push(
      await runTest('Users table query', async () => {
        const client = createClient();
        const { data, error } = await client.from('users').select('id, role').limit(1);
        if (error) throw error;
        return data;
      })
    );
    setResults([...newResults]);

    setRunning(false);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-2xl font-bold mb-4">Supabase Client Debug</h1>

      <div className="mb-6 p-4 bg-gray-800 rounded">
        <h2 className="font-semibold mb-2">Environment Variables (Client-side)</h2>
        <pre className="text-sm text-gray-300">
          {JSON.stringify(envInfo, null, 2)}
        </pre>
      </div>

      <button
        onClick={runAllTests}
        disabled={running}
        className="mb-6 px-4 py-2 bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {running ? 'Running Tests...' : 'Run Diagnostic Tests'}
      </button>

      <div className="space-y-3">
        {results.map((result, i) => (
          <div
            key={i}
            className={`p-4 rounded ${
              result.success ? 'bg-green-900' : 'bg-red-900'
            }`}
          >
            <div className="flex justify-between items-center">
              <span className="font-medium">{result.name}</span>
              <span className="text-sm">
                {result.success ? '✅' : '❌'} {result.timeMs}ms
              </span>
            </div>
            {result.error && (
              <p className="text-red-300 text-sm mt-1">{result.error}</p>
            )}
            {result.data && (
              <pre className="text-xs text-gray-300 mt-1 overflow-auto">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 p-4 bg-gray-800 rounded">
        <h2 className="font-semibold mb-2">What these tests check:</h2>
        <ul className="text-sm text-gray-300 space-y-1">
          <li>1. <strong>Direct fetch</strong> - Raw HTTP request, bypasses all libraries</li>
          <li>2. <strong>supabase-js</strong> - Standard Supabase client</li>
          <li>3. <strong>SSR client</strong> - The @supabase/ssr client your app uses</li>
          <li>4. <strong>getSession</strong> - Auth session from cookies</li>
          <li>5. <strong>getUser</strong> - Validate auth token with server</li>
          <li>6. <strong>Users query</strong> - Query that requires auth for RLS</li>
        </ul>
      </div>
    </div>
  );
}
