'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
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

// ============================================
// GLOBAL AUTH STATE - shared across all instances
// ============================================
let globalAuthInitialized = false;
let globalAuthSubscription: { unsubscribe: () => void } | null = null;
let globalRefreshTimer: NodeJS.Timeout | null = null;

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

// Schedule proactive token refresh
function scheduleTokenRefresh(session: Session) {
  if (globalRefreshTimer) {
    clearTimeout(globalRefreshTimer);
  }

  if (!session.expires_at) return;

  const expiresAt = session.expires_at * 1000;
  const refreshAt = expiresAt - 5 * 60 * 1000; // 5 minutes before expiry
  const refreshIn = Math.max(0, refreshAt - Date.now());

  if (refreshIn > 0) {
    globalRefreshTimer = setTimeout(async () => {
      const supabase = createClient();
      const { data, error } = await supabase.auth.refreshSession();
      if (data.session && !error) {
        scheduleTokenRefresh(data.session);
      }
    }, refreshIn);
  }
}

// Initialize auth ONCE globally
function initializeGlobalAuth(
  onUserChange: (user: User | null) => void,
  onLoadingChange: (loading: boolean) => void,
  onRedirectToLogin: () => void
) {
  console.log('[AuthProvider] initializeGlobalAuth called, initialized:', globalAuthInitialized);

  if (globalAuthInitialized) {
    console.log('[AuthProvider] Already initialized, skipping');
    return;
  }
  globalAuthInitialized = true;

  const supabase = createClient();
  console.log('[AuthProvider] Getting session...');

  // Get initial session
  supabase.auth.getSession().then(async ({ data: { session }, error }) => {
    console.log('[AuthProvider] getSession result:', {
      hasSession: !!session,
      hasUser: !!session?.user,
      error: error?.message,
      storeUser: !!useAppStore.getState().user
    });

    if (error || !session?.user) {
      console.log('[AuthProvider] No session, setting loading false');
      onLoadingChange(false);
      // Only redirect if no user in store
      if (!useAppStore.getState().user) {
        console.log('[AuthProvider] No user in store, redirecting to login');
        onRedirectToLogin();
      }
      return;
    }

    // Setup token refresh
    scheduleTokenRefresh(session);

    // Fetch and set user profile
    console.log('[AuthProvider] Fetching user profile...');
    const profile = await fetchUserProfile(session.user);
    console.log('[AuthProvider] Profile fetched:', { id: profile.id, role: profile.role });
    onUserChange(profile);
    onLoadingChange(false);
  }).catch((error) => {
    console.error('[AuthProvider] Init error:', error);
    onLoadingChange(false);
    if (!useAppStore.getState().user) {
      onRedirectToLogin();
    }
  });

  // Set up SINGLE global subscription
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (event, session) => {
      console.log('[AuthProvider] onAuthStateChange:', event, { hasSession: !!session });

      if (event === 'SIGNED_OUT') {
        console.log('[AuthProvider] SIGNED_OUT - clearing user');
        if (globalRefreshTimer) {
          clearTimeout(globalRefreshTimer);
        }
        onUserChange(null);
        onRedirectToLogin();
      } else if (event === 'SIGNED_IN' && session?.user) {
        console.log('[AuthProvider] SIGNED_IN - setting user');
        scheduleTokenRefresh(session);
        const profile = await fetchUserProfile(session.user);
        onUserChange(profile);
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        console.log('[AuthProvider] TOKEN_REFRESHED');
        scheduleTokenRefresh(session);
        const currentUser = useAppStore.getState().user;
        if (currentUser?.id === session.user.id) {
          const profile = await fetchUserProfile(session.user);
          onUserChange(profile);
        }
      }
    }
  );

  globalAuthSubscription = subscription;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAppStore((state) => state.user);
  const setUser = useAppStore((state) => state.setUser);

  // If user already in store, don't show loading
  const [loading, setLoading] = useState(() => {
    const existingUser = useAppStore.getState().user;
    console.log('[AuthProvider] Initial state - existingUser:', !!existingUser, 'loading:', !existingUser);
    return !existingUser;
  });

  console.log('[AuthProvider] Render - user:', !!user, 'loading:', loading, 'pathname:', pathname);

  // Redirect to login handler
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

  // Initialize auth once globally
  useEffect(() => {
    initializeGlobalAuth(
      (newUser) => {
        useAppStore.getState().setUser(newUser);
      },
      setLoading,
      redirectToLogin
    );

    // Failsafe timeout
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    return () => {
      clearTimeout(timeout);
    };
  }, [redirectToLogin]);

  // Update loading when user changes
  useEffect(() => {
    if (user) {
      setLoading(false);
    }
  }, [user]);

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
