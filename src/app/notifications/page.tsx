'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { Header } from '@/components/layout/header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/utils';
import {
  BellIcon,
  CheckIcon,
  TrashIcon,
  ClipboardDocumentListIcon,
  ExclamationTriangleIcon,
  QuestionMarkCircleIcon,
  FlagIcon,
  DocumentTextIcon,
  UserIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import type { Notification } from '@/types/database';

const NOTIFICATION_ICONS: Record<string, React.ReactNode> = {
  action_assigned: <ClipboardDocumentListIcon className="w-5 h-5 text-blue-500" />,
  action_updated: <ClipboardDocumentListIcon className="w-5 h-5 text-gray-500" />,
  action_completed: <CheckCircleIcon className="w-5 h-5 text-green-500" />,
  threat_created: <ExclamationTriangleIcon className="w-5 h-5 text-amber-500" />,
  threat_escalated: <ExclamationTriangleIcon className="w-5 h-5 text-red-500" />,
  query_assigned: <QuestionMarkCircleIcon className="w-5 h-5 text-purple-500" />,
  query_response: <QuestionMarkCircleIcon className="w-5 h-5 text-green-500" />,
  milestone_approaching: <FlagIcon className="w-5 h-5 text-orange-500" />,
  milestone_completed: <FlagIcon className="w-5 h-5 text-green-500" />,
  decision_made: <DocumentTextIcon className="w-5 h-5 text-indigo-500" />,
  mention: <UserIcon className="w-5 h-5 text-blue-500" />,
  default: <BellIcon className="w-5 h-5 text-gray-500" />,
};

function getNotificationIcon(type: string) {
  return NOTIFICATION_ICONS[type] || NOTIFICATION_ICONS.default;
}

function getNotificationLink(notification: Notification): string | null {
  if (!notification.entity_type || !notification.entity_id) return null;

  const routes: Record<string, string> = {
    action: `/actions/${notification.entity_id}`,
    threat: `/threats/${notification.entity_id}`,
    query: `/queries/${notification.entity_id}`,
    milestone: `/milestones/${notification.entity_id}`,
    decision: `/decisions/${notification.entity_id}`,
  };

  return routes[notification.entity_type] || null;
}

export default function NotificationsPage() {
  const router = useRouter();
  const { user, notifications, setNotifications, markNotificationRead } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    if (!user) return;

    const fetchNotifications = async () => {
      const supabase = createClient();

      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(100);

        if (error) throw error;

        setNotifications(data as Notification[]);
      } catch (error) {
        console.error('Failed to fetch notifications:', error);
        toast.error('Failed to load notifications');
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();

    // Subscribe to real-time notifications
    const supabase = createClient();
    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification;
          useAppStore.getState().addNotification(newNotification);
          toast(newNotification.title, {
            icon: '🔔',
            duration: 4000,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, setNotifications]);

  const handleMarkAsRead = async (id: string) => {
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id);

      if (error) throw error;

      markNotificationRead(id);
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      toast.error('Failed to update notification');
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;

    const supabase = createClient();

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false);

      if (error) throw error;

      // Update local state
      const updatedNotifications = notifications.map(n => ({ ...n, read: true }));
      setNotifications(updatedNotifications);

      toast.success('All notifications marked as read');
    } catch (error) {
      console.error('Failed to mark all as read:', error);
      toast.error('Failed to update notifications');
    }
  };

  const handleDeleteNotification = async (id: string) => {
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setNotifications(notifications.filter(n => n.id !== id));
      toast.success('Notification deleted');
    } catch (error) {
      console.error('Failed to delete notification:', error);
      toast.error('Failed to delete notification');
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    // Mark as read if unread
    if (!notification.read) {
      await handleMarkAsRead(notification.id);
    }

    // Navigate to related entity
    const link = getNotificationLink(notification);
    if (link) {
      router.push(link);
    }
  };

  const filteredNotifications = filter === 'unread'
    ? notifications.filter(n => !n.read)
    : notifications;

  const unreadCount = notifications.filter(n => !n.read).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header
        title="Notifications"
        subtitle={`${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-gray-200 p-1">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  filter === 'all'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('unread')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  filter === 'unread'
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                Unread ({unreadCount})
              </button>
            </div>
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" onClick={handleMarkAllAsRead}>
                <CheckIcon className="w-4 h-4 mr-1" />
                Mark all read
              </Button>
            )}
          </div>
        }
      />

      <div className="p-6 max-w-4xl mx-auto">
        {filteredNotifications.length === 0 ? (
          <Card>
            <CardContent className="py-12">
              <EmptyState
                icon={<BellIcon className="w-6 h-6" />}
                title={filter === 'unread' ? 'No unread notifications' : 'No notifications'}
                description={
                  filter === 'unread'
                    ? "You're all caught up!"
                    : 'Notifications about actions, threats, and mentions will appear here.'
                }
              />
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {filteredNotifications.map((notification) => {
              const link = getNotificationLink(notification);

              return (
                <div
                  key={notification.id}
                  className={`
                    flex items-start gap-4 p-4 rounded-lg border transition-all
                    ${notification.read
                      ? 'bg-white border-gray-200'
                      : 'bg-blue-50 border-blue-200'
                    }
                    ${link ? 'cursor-pointer hover:shadow-md' : ''}
                  `}
                  onClick={() => handleNotificationClick(notification)}
                >
                  {/* Icon */}
                  <div className={`
                    flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center
                    ${notification.read ? 'bg-gray-100' : 'bg-blue-100'}
                  `}>
                    {getNotificationIcon(notification.type)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className={`text-sm font-medium ${notification.read ? 'text-gray-900' : 'text-blue-900'}`}>
                          {notification.title}
                        </h3>
                        <p className={`text-sm mt-0.5 ${notification.read ? 'text-gray-600' : 'text-blue-700'}`}>
                          {notification.message}
                        </p>
                      </div>
                      {!notification.read && (
                        <span className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-2" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      {formatDate(notification.created_at, {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                      })}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex-shrink-0 flex items-center gap-1">
                    {!notification.read && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMarkAsRead(notification.id);
                        }}
                        className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                        title="Mark as read"
                      >
                        <CheckIcon className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNotification(notification.id);
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                      title="Delete"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
