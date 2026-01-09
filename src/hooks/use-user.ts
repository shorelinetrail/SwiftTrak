'use client';

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import type { User } from '@/types/database';

export function useUser() {
  const { user, setUser } = useAppStore();
  // Start loading as false if we already have a user in store
  const [loading, setLoading] = useState(!user);
  const fetchedRef = useRef(false);

  useEffect(() => {
    // If we already have a user, don't refetch
    if (user && fetchedRef.current) {
      setLoading(false);
      return;
    }

    const supabase = createClient();
    let mounted = true;
    let timeoutId: NodeJS.Timeout;

    const fetchUser = async () => {
      // Set a hard timeout to prevent infinite loading
      timeoutId = setTimeout(() => {
        if (mounted) {
          console.warn('Auth check timed out');
          setLoading(false);
        }
      }, 5000);

      try {
        const { data: { user: authUser }, error } = await supabase.auth.getUser();

        if (!mounted) return;
        clearTimeout(timeoutId);

        if (error) {
          console.error('Auth error:', error);
          setLoading(false);
          return;
        }

        if (authUser) {
          fetchedRef.current = true;
          // Try to get profile
          const { data: profile } = await supabase
            .from('users')
            .select('*')
            .eq('id', authUser.id)
            .single();

          if (mounted) {
            if (profile) {
              setUser(profile as User);
            } else {
              // Create minimal user from auth data
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
          }
        }
      } catch (error) {
        console.error('Error fetching user:', error);
      } finally {
        clearTimeout(timeoutId);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          setUser(null);
          fetchedRef.current = false;
        } else if (session?.user && event === 'SIGNED_IN') {
          fetchedRef.current = true;
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
      mounted = false;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [user, setUser]);

  return { user, loading };
}

export function usePermission(workstreamId?: string) {
  const { user } = useAppStore();
  const [permission, setPermission] = useState<'view' | 'edit' | 'admin' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkPermission = async () => {
      if (!user) {
        setPermission(null);
        setLoading(false);
        return;
      }

      // Admin has full access everywhere
      if (user.role === 'admin') {
        setPermission('admin');
        setLoading(false);
        return;
      }

      // If no workstream specified, use global role
      if (!workstreamId) {
        setPermission(user.role);
        setLoading(false);
        return;
      }

      // Check workstream-specific permission
      const supabase = createClient();
      const { data: workstreamPermission } = await supabase
        .from('user_workstream_permissions')
        .select('permission')
        .eq('user_id', user.id)
        .eq('workstream_id', workstreamId)
        .single();

      if (workstreamPermission) {
        setPermission(workstreamPermission.permission as 'view' | 'edit' | 'admin');
      } else {
        setPermission(user.role);
      }
      setLoading(false);
    };

    checkPermission();
  }, [user, workstreamId]);

  const canView = permission !== null;
  const canEdit = permission === 'edit' || permission === 'admin';
  const canAdmin = permission === 'admin';

  return { permission, loading, canView, canEdit, canAdmin };
}
