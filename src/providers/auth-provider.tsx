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
let authHandled = false; // Track if we've already processed auth

// Fetch user profile via API (uses admin client to bypass RLS)
async function fetchUserProfile(authUser: AuthUser): Promise<User> {
  console.log('[fetchUserProfile] Starting for user:', authUser.id);

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
    console.log('[fetchUserProfile] Calling /api/auth/profile...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch('/api/auth/profile', {
      method: 'GET',
      credentials: 'include',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log('[fetchUserProfile] API error:', response.status);
      return defaultUser;
    }

    const profile = await response.json();
    console.log('[fetchUserProfile] Profile received:', { id: profile.id, role: profile.role, email: profile.email });

    return profile as User;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.log('[fetchUserProfile] Request timeout after 5s');
    } else {
      console.error('[fetchUserProfile] Error:', err);
    }
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

  // Set up subscription FIRST - it fires immediately with current state
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (event, session) => {
      console.log('[AuthProvider] onAuthStateChange:', event, { hasSession: !!session, authHandled });

      try {
        if (event === 'SIGNED_OUT') {
          console.log('[AuthProvider] SIGNED_OUT - clearing user');
          authHandled = false;
          if (globalRefreshTimer) {
            clearTimeout(globalRefreshTimer);
          }
          onUserChange(null);
          onLoadingChange(false);
          onRedirectToLogin();
        } else if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
          // Skip if we've already handled auth
          if (authHandled && useAppStore.getState().user) {
            console.log('[AuthProvider] Auth already handled, skipping');
            return;
          }
          console.log('[AuthProvider] Processing auth event:', event);
          authHandled = true;
          scheduleTokenRefresh(session);
          console.log('[AuthProvider] About to fetch profile for:', session.user.id);
          const profile = await fetchUserProfile(session.user);
          console.log('[AuthProvider] Profile fetched:', { id: profile.id, role: profile.role, email: profile.email });
          onUserChange(profile);
          console.log('[AuthProvider] User set, setting loading=false');
          onLoadingChange(false);
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          console.log('[AuthProvider] TOKEN_REFRESHED');
          scheduleTokenRefresh(session);
          const currentUser = useAppStore.getState().user;
          if (currentUser?.id === session.user.id) {
            const profile = await fetchUserProfile(session.user);
            onUserChange(profile);
          }
        }
      } catch (error) {
        console.error('[AuthProvider] Error in auth handler:', error);
        // On error, still set loading to false to prevent infinite spinner
        onLoadingChange(false);
      }
    }
  );

  // Fallback: Get initial session if onAuthStateChange doesn't fire
  // This handles edge cases where the subscription might not fire immediately
  setTimeout(async () => {
    if (authHandled) {
      console.log('[AuthProvider] Auth already handled by subscription');
      return;
    }

    console.log('[AuthProvider] Fallback: Getting session...');
    const { data: { session }, error } = await supabase.auth.getSession();
    console.log('[AuthProvider] Fallback getSession result:', {
      hasSession: !!session,
      hasUser: !!session?.user,
      error: error?.message,
      authHandled
    });

    // If auth was handled while we were waiting, skip
    if (authHandled) return;

    if (error || !session?.user) {
      console.log('[AuthProvider] No session in fallback');
      onLoadingChange(false);
      if (!useAppStore.getState().user) {
        onRedirectToLogin();
      }
      return;
    }

    // Handle session from fallback
    authHandled = true;
    scheduleTokenRefresh(session);
    const profile = await fetchUserProfile(session.user);
    console.log('[AuthProvider] Fallback profile fetched:', { id: profile.id, role: profile.role });
    onUserChange(profile);
    onLoadingChange(false);
  }, 100); // Small delay to let subscription fire first

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
