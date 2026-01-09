'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import type { User } from '@/types/database';

export function useUser() {
  const { user, setUser } = useAppStore();
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    // If we already fetched, skip
    if (fetchedRef.current) {
      console.log('[useUser] Already fetched, skipping');
      return;
    }
    fetchedRef.current = true;
    console.log('[useUser] Starting user fetch...');

    const supabase = createClient();

    // Don't block rendering - fetch in background
    const fetchUser = async () => {
      try {
        console.log('[useUser] Calling supabase.auth.getUser()...');
        const startTime = Date.now();
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
        console.log('[useUser] getUser completed in', Date.now() - startTime, 'ms', { authUser: authUser?.id, authError });

        if (authUser) {
          console.log('[useUser] Auth user found, fetching profile...');
          const profileStart = Date.now();
          const { data: profile, error: profileError } = await supabase
            .from('users')
            .select('*')
            .eq('id', authUser.id)
            .single();
          console.log('[useUser] Profile fetch completed in', Date.now() - profileStart, 'ms', { profile: profile?.id, role: profile?.role, profileError });

          if (profile) {
            console.log('[useUser] Setting user from profile:', profile.id, profile.role);
            setUser(profile as User);
          } else {
            console.log('[useUser] No profile, creating default user');
            setUser({
              id: authUser.id,
              email: authUser.email || '',
              full_name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'User',
              role: 'view',
              avatar_url: undefined,
              created_at: authUser.created_at,
              updated_at: authUser.created_at,
            } as User);
          }
        } else {
          console.log('[useUser] No auth user found');
        }
      } catch (error) {
        console.error('[useUser] Error fetching user:', error);
      }
    };

    fetchUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          setUser(null);
          window.location.href = '/auth/login';
        } else if (session?.user && event === 'SIGNED_IN') {
          const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (profile) {
            setUser(profile as User);
          } else {
            setUser({
              id: session.user.id,
              email: session.user.email || '',
              full_name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
              role: 'view',
              avatar_url: undefined,
              created_at: session.user.created_at,
              updated_at: session.user.created_at,
            } as User);
          }
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [setUser]);

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
          // Only update state if still mounted
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
