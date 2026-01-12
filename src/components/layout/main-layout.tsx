'use client';

import { useEffect, useRef } from 'react';
import { Toaster } from 'react-hot-toast';
import { Sidebar } from './sidebar';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { useAppStore } from '@/stores/app-store';
import { createClient } from '@/lib/supabase/client';
import { LoadingPage } from '@/components/ui/loading';
import type { Workstream, Notification } from '@/types/database';

// Module-level state to track workstream fetch across all MainLayout instances
let workstreamsFetchInProgress = false;

interface MainLayoutProps {
  children: React.ReactNode;
}

function MainLayoutContent({ children }: MainLayoutProps) {
  const { user, loading } = useAuth();
  const { workstreams, setWorkstreams, setNotifications, sidebarOpen } = useAppStore();
  const lastUserIdRef = useRef<string | null>(null);

  console.log('[MainLayoutContent] Render - user:', !!user, 'loading:', loading, 'workstreams:', workstreams.length);

  // Fetch workstreams once globally - only if not already loaded or in progress
  useEffect(() => {
    console.log('[MainLayoutContent] Workstreams effect - length:', workstreams.length, 'inProgress:', workstreamsFetchInProgress);
    // Already have workstreams in store - nothing to do
    if (workstreams.length > 0) return;
    // Another fetch is in progress - wait for it
    if (workstreamsFetchInProgress) return;

    workstreamsFetchInProgress = true;
    let mounted = true;

    const fetchWorkstreams = async () => {
      const supabase = createClient();
      try {
        const result = await Promise.race([
          supabase.from('workstreams').select('*').order('order_index'),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
        ]);

        if (mounted && result?.data && result.data.length > 0) {
          setWorkstreams(result.data as Workstream[]);
        } else {
          // Fetch failed or timed out - allow retry
          workstreamsFetchInProgress = false;
        }
      } catch (error) {
        console.error('[MainLayout] Error fetching workstreams:', error);
        // Allow retry on error
        workstreamsFetchInProgress = false;
      }
    };

    fetchWorkstreams();

    return () => {
      mounted = false;
    };
  }, [workstreams.length, setWorkstreams]);

  // Fetch notifications when user changes - with timeout protection
  useEffect(() => {
    if (!user || user.id === lastUserIdRef.current) return;
    lastUserIdRef.current = user.id;
    let mounted = true;

    const fetchNotifications = async () => {
      const supabase = createClient();
      try {
        const result = await Promise.race([
          supabase
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]);

        if (mounted && result?.data) {
          setNotifications(result.data as Notification[]);
        }
      } catch (error) {
        console.error('[MainLayout] Error fetching notifications:', error);
      }
    };

    fetchNotifications();

    return () => {
      mounted = false;
    };
  }, [user, setNotifications]);

  // Show loading while auth initializes
  if (loading) {
    console.log('[MainLayoutContent] Showing loading page');
    return <LoadingPage />;
  }

  console.log('[MainLayoutContent] Rendering content - user:', user?.email, 'role:', user?.role);

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#1f2937',
            color: '#fff',
          },
        }}
      />
      <Sidebar />
      <main
        className={`transition-all duration-300 ${
          sidebarOpen ? 'ml-64' : 'ml-20'
        }`}
      >
        {children}
      </main>
    </div>
  );
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <AuthProvider>
      <MainLayoutContent>{children}</MainLayoutContent>
    </AuthProvider>
  );
}
