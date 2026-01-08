'use client';

import { useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import type { RealtimeChannel } from '@supabase/supabase-js';

type TableName = 'actions' | 'action_updates' | 'action_audit' | 'threats' | 'technical_queries' | 'decisions' | 'milestones' | 'gantt_tasks' | 'gantt_dependencies' | 'notifications' | 'workstreams' | 'attachments' | 'mentions' | 'users';

interface UseRealtimeOptions {
  table: TableName;
  filter?: string;
  onInsert?: (payload: Record<string, unknown>) => void;
  onUpdate?: (payload: Record<string, unknown>) => void;
  onDelete?: (payload: Record<string, unknown>) => void;
}

export function useRealtime({
  table,
  filter,
  onInsert,
  onUpdate,
  onDelete,
}: UseRealtimeOptions) {
  const { setIsConnected } = useAppStore();

  useEffect(() => {
    const supabase = createClient();
    let channel: RealtimeChannel;

    const setupChannel = () => {
      const channelName = filter ? `${table}:${filter}` : table;

      channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table,
            filter,
          },
          (payload) => {
            onInsert?.(payload.new as Record<string, unknown>);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table,
            filter,
          },
          (payload) => {
            onUpdate?.(payload.new as Record<string, unknown>);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table,
            filter,
          },
          (payload) => {
            onDelete?.(payload.old as Record<string, unknown>);
          }
        )
        .subscribe((status) => {
          setIsConnected(status === 'SUBSCRIBED');
        });
    };

    setupChannel();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [table, filter, onInsert, onUpdate, onDelete, setIsConnected]);
}

export function useNotificationsRealtime(userId: string) {
  const { addNotification } = useAppStore();

  const handleInsert = useCallback((payload: Record<string, unknown>) => {
    addNotification(payload as unknown as import('@/types/database').Notification);
  }, [addNotification]);

  useRealtime({
    table: 'notifications',
    filter: `user_id=eq.${userId}`,
    onInsert: handleInsert,
  });
}
