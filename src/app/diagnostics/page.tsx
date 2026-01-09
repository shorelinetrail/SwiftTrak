'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { useUser, usePermission } from '@/hooks/use-user';
import { Header } from '@/components/layout/header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircleIcon, XCircleIcon, ClockIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

interface TestResult {
  name: string;
  status: 'pending' | 'running' | 'success' | 'error';
  duration?: number;
  result?: unknown;
  error?: string;
}

export default function DiagnosticsPage() {
  const { user: storeUser, workstreams } = useAppStore();
  const { user: hookUser, loading: userLoading } = useUser();
  const { permission, loading: permissionLoading, canAdmin, canEdit, canView } = usePermission();

  const [tests, setTests] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [authSession, setAuthSession] = useState<unknown>(null);

  const runTests = useCallback(async () => {
    setIsRunning(true);
    const supabase = createClient();
    const testResults: TestResult[] = [];

    // Helper to run a test
    const runTest = async (name: string, testFn: () => Promise<unknown>) => {
      const test: TestResult = { name, status: 'running' };
      setTests(prev => [...prev.filter(t => t.name !== name), test]);

      const start = Date.now();
      try {
        const result = await testFn();
        test.status = 'success';
        test.result = result;
        test.duration = Date.now() - start;
      } catch (err) {
        test.status = 'error';
        test.error = err instanceof Error ? err.message : String(err);
        test.duration = Date.now() - start;
      }
      testResults.push(test);
      setTests([...testResults]);
      return test;
    };

    // Clear previous tests
    setTests([]);

    // Test 1: Get auth session
    await runTest('Auth Session', async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      setAuthSession(session);
      return {
        hasSession: !!session,
        userId: session?.user?.id,
        email: session?.user?.email,
        expiresAt: session?.expires_at,
      };
    });

    // Test 2: Get auth user
    await runTest('Auth User (getUser)', async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) throw error;
      return {
        hasUser: !!user,
        userId: user?.id,
        email: user?.email,
        role: user?.role,
      };
    });

    // Test 3: Query users table
    await runTest('Users Table Query', async () => {
      const { data, error, count } = await supabase
        .from('users')
        .select('*', { count: 'exact' });
      if (error) throw error;
      return {
        count: data?.length,
        totalCount: count,
        firstUser: data?.[0] ? { id: data[0].id, role: data[0].role, email: data[0].email } : null,
      };
    });

    // Test 4: Query current user profile
    await runTest('Current User Profile', async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return { error: 'No auth user' };

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();
      if (error) throw error;
      return {
        id: data?.id,
        email: data?.email,
        role: data?.role,
        full_name: data?.full_name,
      };
    });

    // Test 5: Query workstreams
    await runTest('Workstreams Query', async () => {
      const { data, error, count } = await supabase
        .from('workstreams')
        .select('*', { count: 'exact' });
      if (error) throw error;
      return {
        count: data?.length,
        workstreams: data?.map(w => ({ id: w.id, name: w.name })),
      };
    });

    // Test 6: Insert workstream test (with rollback)
    await runTest('Workstream Insert Permission', async () => {
      const testName = `_test_${Date.now()}`;
      const { data, error } = await supabase
        .from('workstreams')
        .insert({ name: testName, color: '#000000', order_index: 999 })
        .select();

      if (error) {
        return { canInsert: false, error: error.message, code: error.code };
      }

      // Clean up test workstream
      if (data?.[0]?.id) {
        await supabase.from('workstreams').delete().eq('id', data[0].id);
      }

      return { canInsert: true, insertedId: data?.[0]?.id };
    });

    // Test 7: Actions table
    await runTest('Actions Query', async () => {
      const { data, error } = await supabase
        .from('actions')
        .select('id, title, status')
        .limit(5);
      if (error) throw error;
      return { count: data?.length, sample: data?.slice(0, 2) };
    });

    // Test 8: Threats table
    await runTest('Threats Query', async () => {
      const { data, error } = await supabase
        .from('threats')
        .select('id, title, current_risk')
        .limit(5);
      if (error) throw error;
      return { count: data?.length, sample: data?.slice(0, 2) };
    });

    // Test 9: RLS Policy Check
    await runTest('RLS Policy Check', async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();

      // Try to get workstreams with RLS
      const { data: wsData, error: wsError } = await supabase.from('workstreams').select('id');

      return {
        authUserId: authUser?.id,
        workstreamsVisible: wsData?.length ?? 0,
        workstreamsError: wsError?.message,
      };
    });

    setIsRunning(false);
  }, []);

  useEffect(() => {
    runTests();
  }, [runTests]);

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircleIcon className="w-5 h-5 text-green-500" />;
      case 'error':
        return <XCircleIcon className="w-5 h-5 text-red-500" />;
      case 'running':
        return <ArrowPathIcon className="w-5 h-5 text-blue-500 animate-spin" />;
      default:
        return <ClockIcon className="w-5 h-5 text-gray-400" />;
    }
  };

  return (
    <div className="min-h-screen">
      <Header
        title="System Diagnostics"
        subtitle="Debug and troubleshoot SwiftTrak"
        actions={
          <Button onClick={runTests} disabled={isRunning}>
            <ArrowPathIcon className={`w-4 h-4 mr-2 ${isRunning ? 'animate-spin' : ''}`} />
            Re-run Tests
          </Button>
        }
      />

      <div className="p-6 space-y-6">
        {/* Hook States */}
        <Card>
          <CardHeader>
            <CardTitle>React Hook States</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-700 mb-2">useAppStore</h4>
                <pre className="text-xs bg-white p-2 rounded border overflow-auto max-h-40">
{JSON.stringify({
  user: storeUser ? {
    id: storeUser.id,
    email: storeUser.email,
    role: storeUser.role,
    full_name: storeUser.full_name,
  } : null,
  workstreamsCount: workstreams.length,
}, null, 2)}
                </pre>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-700 mb-2">useUser Hook</h4>
                <pre className="text-xs bg-white p-2 rounded border overflow-auto max-h-40">
{JSON.stringify({
  user: hookUser ? {
    id: hookUser.id,
    email: hookUser.email,
    role: hookUser.role,
  } : null,
  loading: userLoading,
}, null, 2)}
                </pre>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-700 mb-2">usePermission Hook</h4>
                <pre className="text-xs bg-white p-2 rounded border overflow-auto max-h-40">
{JSON.stringify({
  permission,
  loading: permissionLoading,
  canAdmin,
  canEdit,
  canView,
}, null, 2)}
                </pre>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-700 mb-2">Auth Session</h4>
                <pre className="text-xs bg-white p-2 rounded border overflow-auto max-h-40">
{JSON.stringify(authSession, null, 2)}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Test Results */}
        <Card>
          <CardHeader>
            <CardTitle>Supabase Connection Tests</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {tests.map((test) => (
                <div
                  key={test.name}
                  className={`p-4 rounded-lg border ${
                    test.status === 'error' ? 'bg-red-50 border-red-200' :
                    test.status === 'success' ? 'bg-green-50 border-green-200' :
                    'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(test.status)}
                      <span className="font-medium">{test.name}</span>
                    </div>
                    {test.duration !== undefined && (
                      <span className="text-sm text-gray-500">{test.duration}ms</span>
                    )}
                  </div>
                  {test.error && (
                    <div className="mt-2 p-2 bg-red-100 rounded text-sm text-red-700 font-mono">
                      {test.error}
                    </div>
                  )}
                  {test.result !== undefined && (
                    <pre className="mt-2 text-xs bg-white p-2 rounded border overflow-auto max-h-32">
                      {JSON.stringify(test.result, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Environment Info */}
        <Card>
          <CardHeader>
            <CardTitle>Environment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Supabase URL:</span>
                <code className="ml-2 text-xs bg-gray-100 px-1 rounded">
                  {process.env.NEXT_PUBLIC_SUPABASE_URL?.slice(0, 40)}...
                </code>
              </div>
              <div>
                <span className="text-gray-500">Anon Key Present:</span>
                <code className="ml-2 text-xs bg-gray-100 px-1 rounded">
                  {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Yes' : 'No'}
                </code>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Console Log Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>Debug Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-2">
              Open browser DevTools console (F12) to see detailed debug logs. Look for:
            </p>
            <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
              <li><code className="bg-gray-100 px-1">[useUser]</code> - User fetch and auth state</li>
              <li><code className="bg-gray-100 px-1">[usePermission]</code> - Permission checking</li>
              <li><code className="bg-gray-100 px-1">[AdminPage]</code> - Admin page state and data loading</li>
              <li><code className="bg-gray-100 px-1">[Dashboard]</code> - Dashboard data fetching</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
