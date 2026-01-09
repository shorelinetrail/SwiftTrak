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

    try {
      const { data: profile, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUser.id)
        .single();

      if (error) {
        console.error('[useUser] Profile fetch error:', error);
        // Create a default user from auth data if no profile exists
        const defaultUser: User = {
          id: authUser.id,
          email: authUser.email || '',
          full_name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'User',
          role: 'view',
          avatar_url: authUser.user_metadata?.avatar_url,
          created_at: authUser.created_at,
          updated_at: authUser.created_at,
        };
        setUser(defaultUser);
        return defaultUser;
      }

      setUser(profile as User);
      return profile as User;
    } catch (error) {
      console.error('[useUser] Error fetching profile:', error);
      return null;
    }
  }, [setUser]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const supabase = createClient();

    // Get initial session
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          await fetchUserProfile(session.user);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('[useUser] Error getting session:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

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

      // Check workstream-specific permission
      try {
        const supabase = createClient();
        const { data: workstreamPermission } = await supabase
          .from('user_workstream_permissions')
          .select('permission')
          .eq('user_id', user.id)
          .eq('workstream_id', workstreamId)
          .single();

        if (mounted) {
          setPermission(workstreamPermission?.permission as 'view' | 'edit' | 'admin' || user.role);
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
