'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';

// Re-export useAuth as the primary hook for auth state
export { useAuth } from '@/providers/auth-provider';

/**
 * Simple hook that reads user from the store.
 * For new code, prefer useAuth() from auth-provider.
 * This hook exists for backward compatibility.
 */
export function useUser() {
  const user = useAppStore((state) => state.user);
  // Loading is false if we have a user, true otherwise
  // The AuthProvider handles the actual loading state
  const [loading, setLoading] = useState(!user);

  useEffect(() => {
    if (user) {
      setLoading(false);
    }
  }, [user]);

  return { user, loading };
}

/**
 * Hook for checking user permissions on a workstream
 */
export function usePermission(workstreamId?: string) {
  const user = useAppStore((state) => state.user);
  const [permission, setPermission] = useState<'view' | 'edit' | 'admin' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let timeoutId: NodeJS.Timeout;

    const checkPermission = async () => {
      // Wait for user to load, with a timeout
      if (!user) {
        timeoutId = setTimeout(() => {
          if (mounted) {
            setPermission(null);
            setLoading(false);
          }
        }, 3000);
        return;
      }

      clearTimeout(timeoutId);

      // Admin has full access everywhere
      if (user.role === 'admin') {
        if (mounted) {
          setPermission('admin');
          setLoading(false);
        }
        return;
      }

      // If no workstream specified, use global role
      if (!workstreamId) {
        if (mounted) {
          setPermission(user.role);
          setLoading(false);
        }
        return;
      }

      // Check workstream-specific permission - with timeout
      try {
        const supabase = createClient();
        const result = await Promise.race([
          supabase
            .from('user_workstream_permissions')
            .select('permission')
            .eq('user_id', user.id)
            .eq('workstream_id', workstreamId)
            .single(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
        ]);

        if (mounted) {
          const perm = result?.data?.permission as 'view' | 'edit' | 'admin' | undefined;
          setPermission(perm || user.role);
          setLoading(false);
        }
      } catch {
        if (mounted) {
          setPermission(user.role);
          setLoading(false);
        }
      }
    };

    checkPermission();

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, [user, workstreamId]);

  const canView = permission !== null;
  const canEdit = permission === 'edit' || permission === 'admin';
  const canAdmin = permission === 'admin';

  return { permission, loading, canView, canEdit, canAdmin };
}
