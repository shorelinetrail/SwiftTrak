'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import type { User } from '@/types/database';

export function useUser() {
  const { user, setUser } = useAppStore();
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);

  const fetchUserProfile = useCallback(async (authUserId: string) => {
    console.log('[useUser] Fetching profile for:', authUserId);
    const supabase = createClient();

    try {
      const { data: profile, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUserId)
        .single();

      console.log('[useUser] Profile result:', { profileId: profile?.id, role: profile?.role, error: error?.message });

      if (profile) {
        setUser(profile as User);
        return profile as User;
      }
    } catch (error) {
      console.error('[useUser] Error fetching profile:', error);
    }
    return null;
  }, [setUser]);

  useEffect(() => {
    // Prevent double initialization in React Strict Mode
    if (initializedRef.current) {
      console.log('[useUser] Already initialized');
      return;
    }
    initializedRef.current = true;

    console.log('[useUser] Initializing auth listener...');
    const supabase = createClient();

    // Initial auth check
    const initializeAuth = async () => {
      try {
        console.log('[useUser] Getting initial session...');
        const startTime = Date.now();

        const { data: { session }, error } = await supabase.auth.getSession();
        console.log('[useUser] getSession completed in', Date.now() - startTime, 'ms', {
          hasSession: !!session,
          userId: session?.user?.id,
          error: error?.message
        });

        if (session?.user) {
          await fetchUserProfile(session.user.id);
        } else {
          console.log('[useUser] No session found');
          setUser(null);
        }
      } catch (error) {
        console.error('[useUser] Error in initializeAuth:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[useUser] Auth state changed:', event, { userId: session?.user?.id });

        switch (event) {
          case 'SIGNED_IN':
          case 'TOKEN_REFRESHED':
          case 'USER_UPDATED':
            if (session?.user) {
              await fetchUserProfile(session.user.id);
            }
            break;
          case 'SIGNED_OUT':
            console.log('[useUser] User signed out, clearing state');
            setUser(null);
            // Don't redirect here - let middleware handle it
            break;
          case 'INITIAL_SESSION':
            // Already handled by initializeAuth
            break;
          default:
            console.log('[useUser] Unhandled auth event:', event);
        }
      }
    );

    return () => {
      console.log('[useUser] Cleaning up auth listener');
      subscription.unsubscribe();
    };
  }, [setUser, fetchUserProfile]);

  return { user, loading };
}

export function usePermission(workstreamId?: string) {
  const { user } = useAppStore();
  const [permission, setPermission] = useState<'view' | 'edit' | 'admin' | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  console.log('[usePermission] Render state:', {
    userId: user?.id,
    userRole: user?.role,
    permission,
    loading,
    workstreamId
  });

  useEffect(() => {
    mountedRef.current = true;
    let timeoutId: NodeJS.Timeout;
    console.log('[usePermission] Effect running, user:', user?.id, user?.role);

    const checkPermission = async () => {
      // If no user yet, wait a bit for user fetch to complete
      if (!user) {
        console.log('[usePermission] No user, starting 3s timeout...');
        timeoutId = setTimeout(() => {
          console.log('[usePermission] Timeout fired, still no user');
          if (mountedRef.current) {
            setPermission(null);
            setLoading(false);
          }
        }, 3000);
        return;
      }

      // Clear timeout if user exists
      clearTimeout(timeoutId);
      console.log('[usePermission] User found:', user.id, 'role:', user.role);

      // Admin has full access everywhere
      if (user.role === 'admin') {
        console.log('[usePermission] User is admin, granting admin permission');
        if (mountedRef.current) {
          setPermission('admin');
          setLoading(false);
        }
        return;
      }

      // If no workstream specified, use global role
      if (!workstreamId) {
        console.log('[usePermission] No workstreamId, using global role:', user.role);
        if (mountedRef.current) {
          setPermission(user.role);
          setLoading(false);
        }
        return;
      }

      // Check workstream-specific permission
      try {
        console.log('[usePermission] Checking workstream permission for:', workstreamId);
        const supabase = createClient();
        const { data: workstreamPermission, error } = await supabase
          .from('user_workstream_permissions')
          .select('permission')
          .eq('user_id', user.id)
          .eq('workstream_id', workstreamId)
          .single();

        console.log('[usePermission] Workstream permission result:', { workstreamPermission, error });

        if (mountedRef.current) {
          if (workstreamPermission) {
            setPermission(workstreamPermission.permission as 'view' | 'edit' | 'admin');
          } else {
            setPermission(user.role);
          }
          setLoading(false);
        }
      } catch (error) {
        console.error('[usePermission] Error checking permission:', error);
        if (mountedRef.current) {
          setPermission(user.role);
          setLoading(false);
        }
      }
    };

    checkPermission();

    return () => {
      console.log('[usePermission] Cleanup, unmounting');
      mountedRef.current = false;
      clearTimeout(timeoutId);
    };
  }, [user, workstreamId]);

  const canView = permission !== null;
  const canEdit = permission === 'edit' || permission === 'admin';
  const canAdmin = permission === 'admin';

  console.log('[usePermission] Return values:', { permission, loading, canView, canEdit, canAdmin });

  return { permission, loading, canView, canEdit, canAdmin };
}
