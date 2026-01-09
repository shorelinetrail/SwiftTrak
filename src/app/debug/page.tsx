'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createClient as createDirectClient } from '@supabase/supabase-js';

interface TestResult {
  name: string;
  success: boolean;
  timeMs: number;
  error?: string;
  data?: unknown;
  suggestion?: string;
}

export default function DebugPage() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [envInfo, setEnvInfo] = useState<Record<string, unknown>>({});
  const [cookies, setCookies] = useState<string>('');
  const mountedRef = useRef(true);

  // Wait for hydration to complete
  useEffect(() => {
    mountedRef.current = true;
    setHydrated(true);

    // Check environment variables visible to client
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    setEnvInfo({
      supabaseUrl: supabaseUrl ? supabaseUrl.substring(0, 50) + '...' : 'NOT SET',
      hasAnonKey: !!supabaseKey,
      keyPrefix: supabaseKey ? supabaseKey.substring(0, 20) + '...' : 'NOT SET',
      urlValid: supabaseUrl?.startsWith('https://') && supabaseUrl?.includes('.supabase.co'),
    });

    // Get cookies (auth-related)
    const allCookies = document.cookie;
    const authCookies = allCookies.split(';')
      .filter(c => c.includes('sb-') || c.includes('supabase'))
      .map(c => c.trim().split('=')[0])
      .join(', ');
    setCookies(authCookies || 'No Supabase auth cookies found');

    return () => {
      mountedRef.current = false;
    };
  }, []);

  const runTest = async (
    name: string,
    fn: () => Promise<unknown>,
    suggestion?: string
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
        suggestion,
      };
    }
  };

  const runAllTests = async () => {
    if (!hydrated) return;

    setRunning(true);
    setResults([]);
    const newResults: TestResult[] = [];

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // Test 0: Basic connectivity check (ping)
    newResults.push(
      await runTest(
        '0. Basic connectivity (health check)',
        async () => {
          if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
          const response = await fetch(`${url}/rest/v1/`, {
            method: 'HEAD',
            headers: { apikey: key! },
          });
          return { status: response.status, ok: response.ok };
        },
        'Check if Supabase project is active (not paused). Free tier projects pause after 7 days of inactivity.'
      )
    );
    if (mountedRef.current) setResults([...newResults]);

    // Test 1: Direct fetch to Supabase REST API
    newResults.push(
      await runTest(
        '1. Direct fetch (no library)',
        async () => {
          if (!url || !key) throw new Error('Missing environment variables');
          const response = await fetch(`${url}/rest/v1/workstreams?select=id&limit=1`, {
            headers: {
              apikey: key,
              Authorization: `Bearer ${key}`,
            },
          });
          if (!response.ok) {
            const text = await response.text();
            throw new Error(`HTTP ${response.status}: ${text}`);
          }
          return await response.json();
        },
        'If this fails but connectivity passes, check RLS policies on workstreams table.'
      )
    );
    if (mountedRef.current) setResults([...newResults]);

    // Test 2: Direct supabase-js client (not SSR)
    newResults.push(
      await runTest(
        '2. supabase-js direct client',
        async () => {
          const client = createDirectClient(url!, key!);
          const { data, error } = await client.from('workstreams').select('id').limit(1);
          if (error) throw new Error(`${error.code}: ${error.message}`);
          return data;
        },
        'Standard Supabase client - should work if #1 works.'
      )
    );
    if (mountedRef.current) setResults([...newResults]);

    // Test 3: SSR client (what the app uses)
    newResults.push(
      await runTest(
        '3. SSR client (createBrowserClient)',
        async () => {
          const client = createClient();
          const { data, error } = await client.from('workstreams').select('id').limit(1);
          if (error) throw new Error(`${error.code}: ${error.message}`);
          return data;
        },
        'This is what your app uses. If it fails but #2 works, check @supabase/ssr setup.'
      )
    );
    if (mountedRef.current) setResults([...newResults]);

    // Test 4: Auth getSession (from cookies)
    newResults.push(
      await runTest(
        '4. Auth getSession (from cookies)',
        async () => {
          const client = createClient();
          const { data, error } = await client.auth.getSession();
          if (error) throw new Error(`${error.code}: ${error.message}`);
          return {
            hasSession: !!data.session,
            expiresAt: data.session?.expires_at
              ? new Date(data.session.expires_at * 1000).toISOString()
              : null,
          };
        },
        'Reads session from cookies. If no session, user needs to log in.'
      )
    );
    if (mountedRef.current) setResults([...newResults]);

    // Test 5: Auth getUser (validates with server)
    newResults.push(
      await runTest(
        '5. Auth getUser (server validation)',
        async () => {
          const client = createClient();
          const { data, error } = await client.auth.getUser();
          if (error) throw new Error(`${error.code}: ${error.message}`);
          return {
            userId: data.user?.id?.substring(0, 8),
            email: data.user?.email?.substring(0, 3) + '***',
          };
        },
        'Validates token with Supabase server. Timeouts here may indicate network issues or invalid tokens.'
      )
    );
    if (mountedRef.current) setResults([...newResults]);

    // Test 6: Users table query (requires auth + RLS)
    newResults.push(
      await runTest(
        '6. Users table query (requires auth)',
        async () => {
          const client = createClient();
          const { data, error } = await client.from('users').select('id, role').limit(1);
          if (error) throw new Error(`${error.code}: ${error.message}`);
          return data;
        },
        'Requires valid auth session. Empty result may indicate RLS policy issues.'
      )
    );
    if (mountedRef.current) setResults([...newResults]);

    if (mountedRef.current) setRunning(false);
  };

  const getStatusColor = (results: TestResult[]) => {
    if (results.length === 0) return 'bg-gray-700';
    const allPassed = results.every(r => r.success);
    const somePassed = results.some(r => r.success);
    if (allPassed) return 'bg-green-700';
    if (somePassed) return 'bg-yellow-700';
    return 'bg-red-700';
  };

  const getDiagnosis = () => {
    if (results.length === 0) return null;

    const connFailed = results[0] && !results[0].success;
    const fetchFailed = results[1] && !results[1].success;
    const authFailed = results[4] && !results[4].success && results[4].error?.includes('Timeout');

    // Check for AbortError pattern (raw fetch works but library calls fail)
    const hasAbortError = results.some(r => r.error?.includes('AbortError') || r.error?.includes('aborted'));
    const rawFetchWorks = results[1]?.success;
    const libraryFails = results[2] && !results[2].success;

    if (hasAbortError && rawFetchWorks && libraryFails) {
      return {
        title: 'Supabase Client State Corrupted',
        message: 'The Supabase client library has entered a corrupted state (AbortError). This happens when:',
        items: [
          'A previous request was aborted or timed out',
          'The client\'s internal connection was interrupted',
          'Running tests multiple times without page reload',
        ],
        action: 'Reload the page to reset the client state. This fix has been applied to the app - the browser client now creates fresh instances.',
        showReload: true,
      };
    }

    if (connFailed) {
      return {
        title: 'Supabase Project Unreachable',
        message: 'Cannot connect to your Supabase project. This usually means:',
        items: [
          'The Supabase project is paused (free tier pauses after 7 days of inactivity)',
          'The NEXT_PUBLIC_SUPABASE_URL is incorrect',
          'There are network/firewall issues',
        ],
        action: 'Go to supabase.com/dashboard and check if your project is active. If paused, click "Restore project".',
      };
    }

    if (fetchFailed && results[0]?.success) {
      return {
        title: 'Database Access Issue',
        message: 'Can connect to Supabase but cannot query database:',
        items: [
          'RLS (Row Level Security) policies may be blocking access',
          'The workstreams table may not exist',
          'The anon key may not have proper permissions',
        ],
        action: 'Check your RLS policies in Supabase Dashboard → Authentication → Policies.',
      };
    }

    if (authFailed && results[1]?.success) {
      return {
        title: 'Authentication Timeout',
        message: 'Database queries work but auth is timing out:',
        items: [
          'Auth cookies may be invalid or expired',
          'Supabase Auth service may be slow',
          'Token refresh might be failing',
        ],
        action: 'Try logging out and back in. Check Supabase Dashboard → Authentication → URL Configuration for correct redirect URLs.',
      };
    }

    return null;
  };

  const diagnosis = getDiagnosis();

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8 flex items-center justify-center">
        <p>Loading diagnostic tools...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-2xl font-bold mb-4">Supabase Connectivity Diagnostics</h1>

      {/* Status Banner */}
      <div className={`mb-6 p-4 rounded ${getStatusColor(results)}`}>
        {results.length === 0 ? (
          <p>Click "Run Diagnostic Tests" to check Supabase connectivity</p>
        ) : (
          <p>
            {results.filter(r => r.success).length} of {results.length} tests passed
          </p>
        )}
      </div>

      {/* Environment Info */}
      <div className="mb-6 p-4 bg-gray-800 rounded">
        <h2 className="font-semibold mb-2">Environment Configuration</h2>
        <pre className="text-sm text-gray-300">
          {JSON.stringify(envInfo, null, 2)}
        </pre>
        <p className="text-xs text-gray-400 mt-2">Auth Cookies: {cookies}</p>
      </div>

      {/* Diagnosis */}
      {diagnosis && (
        <div className="mb-6 p-4 bg-orange-900 rounded border border-orange-600">
          <h2 className="font-bold text-lg mb-2">{diagnosis.title}</h2>
          <p className="mb-2">{diagnosis.message}</p>
          <ul className="list-disc list-inside mb-3 text-sm">
            {diagnosis.items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
          <p className="text-orange-200 font-medium">{diagnosis.action}</p>
          {'showReload' in diagnosis && diagnosis.showReload && (
            <button
              onClick={() => window.location.reload()}
              className="mt-3 px-4 py-2 bg-orange-600 rounded hover:bg-orange-500"
            >
              Reload Page
            </button>
          )}
        </div>
      )}

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
            {result.suggestion && !result.success && (
              <p className="text-yellow-300 text-xs mt-1 italic">{result.suggestion}</p>
            )}
            {result.data !== undefined && (
              <pre className="text-xs text-gray-300 mt-1 overflow-auto">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 p-4 bg-gray-800 rounded">
        <h2 className="font-semibold mb-2">Test Explanations:</h2>
        <ul className="text-sm text-gray-300 space-y-1">
          <li><strong>0. Connectivity</strong> - Can we reach Supabase at all?</li>
          <li><strong>1. Direct fetch</strong> - Raw HTTP request, no libraries</li>
          <li><strong>2. supabase-js</strong> - Standard Supabase client library</li>
          <li><strong>3. SSR client</strong> - The @supabase/ssr client your app uses</li>
          <li><strong>4. getSession</strong> - Read auth session from cookies</li>
          <li><strong>5. getUser</strong> - Validate auth token with Supabase server</li>
          <li><strong>6. Users query</strong> - Query that requires auth + RLS</li>
        </ul>
      </div>

      <div className="mt-4 p-4 bg-gray-800 rounded">
        <h2 className="font-semibold mb-2">Common Fixes:</h2>
        <ul className="text-sm text-gray-300 space-y-2">
          <li><strong>Project Paused:</strong> Go to supabase.com/dashboard → Select project → Click "Restore" if paused</li>
          <li><strong>URL Config:</strong> Supabase Dashboard → Authentication → URL Configuration → Add your deployment URLs</li>
          <li><strong>Vercel Previews:</strong> Add <code className="bg-gray-700 px-1">https://*-yourproject.vercel.app/**</code> to Redirect URLs</li>
          <li><strong>Invalid Session:</strong> Try logging out and back in at /auth/login</li>
        </ul>
      </div>
    </div>
  );
}
