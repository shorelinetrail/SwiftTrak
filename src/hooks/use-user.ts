'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import type { User } from '@/types/database';
import type { User as AuthUser } from '@supabase/supabase-js';

// Module-level state for auth initialization
let authInitPromise: Promise<void> | null = null;

export function useUser() {
  const { user, setUser } = useAppStore();
  const [loading, setLoading] = useState(!user);
  const mountedRef = useRef(true);

  const fetchUserProfile = useCallback(async (authUser: AuthUser): Promise<User | null> => {
    const supabase = createClient();

    // Create default user from auth data (used as fallback)
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
      const { data: profile, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (error || !profile) {
        console.log('[useUser] Using default user for:', defaultUser.email);
        return defaultUser;
      }

      return profile as User;
    } catch (error) {
      console.error('[useUser] Error fetching profile:', error);
      return defaultUser;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const supabase = createClient();

    // If user already exists, just mark as loaded
    if (user) {
      setLoading(false);
      // Still set up subscription for auth changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (event === 'SIGNED_OUT') {
            setUser(null);
          } else if (session?.user && event === 'TOKEN_REFRESHED') {
            const profile = await fetchUserProfile(session.user);
            if (mountedRef.current && profile) setUser(profile);
          }
        }
      );
      return () => {
        mountedRef.current = false;
        subscription.unsubscribe();
      };
    }

    // Initialize auth only once (deduplicated via promise)
    if (!authInitPromise) {
      authInitPromise = (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            const profile = await fetchUserProfile(session.user);
            // Use getState() to ensure we set the latest
            if (profile) {
              useAppStore.getState().setUser(profile);
            }
          }
        } catch (error) {
          console.error('[useUser] Init error:', error);
        }
      })();
    }

    // Wait for initialization
    authInitPromise.then(() => {
      if (mountedRef.current) setLoading(false);
    });

    // Set up auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          setUser(null);
          authInitPromise = null; // Reset for next login
        } else if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
          const profile = await fetchUserProfile(session.user);
          if (mountedRef.current && profile) setUser(profile);
        }
      }
    );

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [user, setUser, fetchUserProfile]);

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
