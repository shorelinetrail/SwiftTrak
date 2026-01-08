import { create } from 'zustand';
import type { User, Workstream, Notification } from '@/types/database';

interface AppState {
  // User
  user: User | null;
  setUser: (user: User | null) => void;

  // Workstreams
  workstreams: Workstream[];
  setWorkstreams: (workstreams: Workstream[]) => void;
  activeWorkstreamId: string | null;
  setActiveWorkstreamId: (id: string | null) => void;

  // Notifications
  notifications: Notification[];
  setNotifications: (notifications: Notification[]) => void;
  addNotification: (notification: Notification) => void;
  markNotificationRead: (id: string) => void;
  unreadCount: number;

  // UI State
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  // Real-time
  isConnected: boolean;
  setIsConnected: (connected: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // User
  user: null,
  setUser: (user) => set({ user }),

  // Workstreams
  workstreams: [],
  setWorkstreams: (workstreams) => set({ workstreams }),
  activeWorkstreamId: null,
  setActiveWorkstreamId: (activeWorkstreamId) => set({ activeWorkstreamId }),

  // Notifications
  notifications: [],
  setNotifications: (notifications) => set({
    notifications,
    unreadCount: notifications.filter(n => !n.read).length
  }),
  addNotification: (notification) => set((state) => ({
    notifications: [notification, ...state.notifications],
    unreadCount: state.unreadCount + (notification.read ? 0 : 1),
  })),
  markNotificationRead: (id) => set((state) => ({
    notifications: state.notifications.map(n =>
      n.id === id ? { ...n, read: true } : n
    ),
    unreadCount: Math.max(0, state.unreadCount - 1),
  })),
  unreadCount: 0,

  // UI State
  sidebarOpen: true,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),

  // Real-time
  isConnected: false,
  setIsConnected: (isConnected) => set({ isConnected }),
}));
