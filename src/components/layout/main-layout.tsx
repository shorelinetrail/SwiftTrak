'use client';

import { useEffect, useRef } from 'react';
import { Toaster } from 'react-hot-toast';
import { Sidebar } from './sidebar';
import { useUser } from '@/hooks/use-user';
import { useAppStore } from '@/stores/app-store';
import { createClient } from '@/lib/supabase/client';
import type { Workstream, Notification } from '@/types/database';

interface MainLayoutProps {
  children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const { user } = useUser();
  const { setWorkstreams, setNotifications, sidebarOpen } = useAppStore();
  const workstreamsFetchedRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);

  // Fetch workstreams once on mount
  useEffect(() => {
    if (workstreamsFetchedRef.current) return;
    workstreamsFetchedRef.current = true;

    const fetchWorkstreams = async () => {
      const supabase = createClient();
      const { data: workstreams } = await supabase
        .from('workstreams')
        .select('*')
        .order('order_index');

      if (workstreams) {
        setWorkstreams(workstreams as Workstream[]);
      }
    };

    fetchWorkstreams();
  }, [setWorkstreams]);

  // Fetch notifications when user changes
  useEffect(() => {
    if (!user || user.id === lastUserIdRef.current) return;
    lastUserIdRef.current = user.id;

    const fetchNotifications = async () => {
      const supabase = createClient();
      const { data: notifications } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (notifications) {
        setNotifications(notifications as Notification[]);
      }
    };

    fetchNotifications();
  }, [user, setNotifications]);

  // Don't block rendering - middleware handles auth
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
