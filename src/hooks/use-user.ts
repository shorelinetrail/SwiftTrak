'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import type { User } from '@/types/database';
import type { User as AuthUser } from '@supabase/supabase-js';

export function useUser() {
  const { user, setUser } = useAppStore();
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);

  const fetchUserProfile = useCallback(async (authUser: AuthUser) => {
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
      // CRITICAL: Wrap database query with timeout to prevent hanging
      const result = await Promise.race([
        supabase.from('users').select('*').eq('id', authUser.id).single(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
      ]);

      // Timeout occurred - use default user
      if (!result) {
        console.warn('[useUser] Profile fetch timed out - using default user');
        setUser(defaultUser);
        return defaultUser;
      }

      const { data: profile, error } = result;

      if (error || !profile) {
        console.error('[useUser] Profile fetch error:', error);
        setUser(defaultUser);
        return defaultUser;
      }

      setUser(profile as User);
      return profile as User;
    } catch (error) {
      console.error('[useUser] Error fetching profile:', error);
      setUser(defaultUser);
      return defaultUser;
    }
  }, [setUser]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const supabase = createClient();
    let mounted = true;
    let failsafeTimeout: NodeJS.Timeout;

    // Helper to wrap any promise with a timeout
    const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
      return Promise.race([
        promise,
        new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
      ]);
    };

    // Get initial session
    const initializeAuth = async () => {
      try {
        const sessionResult = await withTimeout(
          supabase.auth.getSession(),
          5000,
          { data: { session: null }, error: null }
        );

        if (!mounted) return;

        if (sessionResult.data?.session?.user) {
          await fetchUserProfile(sessionResult.data.session.user);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('[useUser] Error getting session:', error);
        if (mounted) setUser(null);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    // FAILSAFE: Always stop loading after 8 seconds
    failsafeTimeout = setTimeout(() => {
      if (mounted) {
        console.warn('[useUser] Failsafe timeout - forcing loading to stop');
        setLoading(false);
      }
    }, 8000);

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          setUser(null);
        } else if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED')) {
          await fetchUserProfile(session.user);
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(failsafeTimeout);
      subscription.unsubscribe();
    };
  }, [setUser, fetchUserProfile]);

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
