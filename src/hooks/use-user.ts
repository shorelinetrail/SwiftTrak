'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import type { User } from '@/types/database';
import type { User as AuthUser } from '@supabase/supabase-js';

// Module-level state - ensures single global auth initialization
let authInitialized = false;
let authInitializing = false;

// Fetch user profile from database, with fallback to auth metadata
async function fetchUserProfile(authUser: AuthUser): Promise<User> {
  const supabase = createClient();

  const defaultUser: User = {
    id: authUser.id,
    email: authUser.email || '',
    full_name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'User',
    role: 'view',
    avatar_url: authUser.user_metadata?.avatar_url,
    created_at: authUser.created_at,
    updated_at: authUser.created_at,
  };

  try {
    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();

    return (profile as User) || defaultUser;
  } catch {
    return defaultUser;
  }
}

// Initialize auth ONCE globally - sets up session and subscription
function initializeAuthOnce() {
  // Already initialized or in progress
  if (authInitialized || authInitializing) return;
  authInitializing = true;

  const supabase = createClient();

  // Get initial session
  supabase.auth.getSession().then(({ data: { session } }) => {
    // Only set user if we don't already have one
    if (session?.user && !useAppStore.getState().user) {
      fetchUserProfile(session.user).then((profile) => {
        useAppStore.getState().setUser(profile);
      });
    }
    authInitialized = true;
    authInitializing = false;
  }).catch((error) => {
    console.error('[useUser] Init error:', error);
    authInitialized = true;
    authInitializing = false;
  });

  // Set up SINGLE global subscription - never unsubscribed
  supabase.auth.onAuthStateChange(async (event, session) => {
    // Only handle explicit sign out - verify session is actually gone
    if (event === 'SIGNED_OUT') {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        useAppStore.getState().setUser(null);
      }
    } else if (event === 'SIGNED_IN' && session?.user) {
      const profile = await fetchUserProfile(session.user);
      useAppStore.getState().setUser(profile);
    } else if (event === 'TOKEN_REFRESHED' && session?.user) {
      // Only update if we already have a user (don't interrupt navigation)
      const currentUser = useAppStore.getState().user;
      if (currentUser && currentUser.id === session.user.id) {
        const profile = await fetchUserProfile(session.user);
        useAppStore.getState().setUser(profile);
      }
    }
  });
}

export function useUser() {
  const user = useAppStore((state) => state.user);
  const [loading, setLoading] = useState(!user);

  useEffect(() => {
    // Initialize auth globally (only runs once across ALL components)
    initializeAuthOnce();

    // If user exists in store, we're done
    if (user) {
      setLoading(false);
      return;
    }

    // Wait for auth to initialize with timeout
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 3000);

    return () => clearTimeout(timeout);
  }, [user]);

  return { user, loading };
}

export function usePermission(workstreamId?: string) {
  const { user } = useAppStore();
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
