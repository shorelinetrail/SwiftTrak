'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import type { User } from '@/types/database';
import type { User as AuthUser, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
});

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

// Calculate when to refresh token (5 minutes before expiry)
function getTokenRefreshTime(session: Session): number {
  if (!session.expires_at) return 0;
  const expiresAt = session.expires_at * 1000; // Convert to milliseconds
  const refreshAt = expiresAt - 5 * 60 * 1000; // 5 minutes before expiry
  return Math.max(0, refreshAt - Date.now());
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const user = useAppStore((state) => state.user);
  const setUser = useAppStore((state) => state.setUser);

  // Track initialization to prevent duplicate setup
  const initializedRef = useRef(false);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Clear refresh timer on unmount
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  // Setup proactive token refresh
  const scheduleTokenRefresh = useCallback((session: Session) => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }

    const refreshIn = getTokenRefreshTime(session);
    if (refreshIn > 0) {
      refreshTimerRef.current = setTimeout(async () => {
        const supabase = createClient();
        const { data, error } = await supabase.auth.refreshSession();
        if (data.session && !error) {
          scheduleTokenRefresh(data.session);
        }
      }, refreshIn);
    }
  }, []);

  // Redirect to login (using router, not hard redirect)
  const redirectToLogin = useCallback(() => {
    if (!pathname.startsWith('/auth')) {
      router.replace('/auth/login');
    }
  }, [pathname, router]);

  // Sign out handler
  const signOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    router.replace('/auth/login');
  }, [setUser, router]);

  // Initialize auth
  useEffect(() => {
    // Prevent double initialization (handles React StrictMode and HMR)
    if (initializedRef.current) return;
    initializedRef.current = true;

    const supabase = createClient();
    let mounted = true;

    const initialize = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (!mounted) return;

        if (error || !session?.user) {
          setLoading(false);
          redirectToLogin();
          return;
        }

        // Setup proactive token refresh
        scheduleTokenRefresh(session);

        // Fetch and set user profile
        const profile = await fetchUserProfile(session.user);
        if (mounted) {
          setUser(profile);
          setLoading(false);
        }
      } catch (error) {
        console.error('[AuthProvider] Init error:', error);
        if (mounted) {
          setLoading(false);
          redirectToLogin();
        }
      }
    };

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        if (event === 'SIGNED_OUT') {
          setUser(null);
          if (refreshTimerRef.current) {
            clearTimeout(refreshTimerRef.current);
          }
          redirectToLogin();
        } else if (event === 'SIGNED_IN' && session?.user) {
          scheduleTokenRefresh(session);
          const profile = await fetchUserProfile(session.user);
          setUser(profile);
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          scheduleTokenRefresh(session);
          // Only update profile if user ID matches (prevents race conditions)
          const currentUser = useAppStore.getState().user;
          if (currentUser?.id === session.user.id) {
            const profile = await fetchUserProfile(session.user);
            setUser(profile);
          }
        }
      }
    );

    initialize();

    return () => {
      mounted = false;
      subscription.unsubscribe();
      // Reset for HMR
      initializedRef.current = false;
    };
  }, [setUser, redirectToLogin, scheduleTokenRefresh]);

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
