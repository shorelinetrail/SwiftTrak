'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/app-store';
import {
  HomeIcon,
  ClipboardDocumentListIcon,
  ExclamationTriangleIcon,
  QuestionMarkCircleIcon,
  DocumentTextIcon,
  FlagIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  BellIcon,
} from '@heroicons/react/24/outline';
import { Avatar } from '../ui/avatar';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { name: 'Actions', href: '/actions', icon: ClipboardDocumentListIcon },
  { name: 'Threats', href: '/threats', icon: ExclamationTriangleIcon },
  { name: 'Technical Queries', href: '/queries', icon: QuestionMarkCircleIcon },
  { name: 'Decisions', href: '/decisions', icon: DocumentTextIcon },
  { name: 'Milestones', href: '/milestones', icon: FlagIcon },
  { name: 'Gantt Chart', href: '/gantt', icon: ChartBarIcon },
];

const adminNavigation = [
  { name: 'Admin Settings', href: '/admin', icon: Cog6ToothIcon },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, sidebarOpen, setSidebarOpen, unreadCount } = useAppStore();

  const isAdmin = user?.role === 'admin';

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen bg-gray-900 transition-all duration-300',
        sidebarOpen ? 'w-64' : 'w-20'
      )}
    >
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-gray-800">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">S</span>
            </div>
            {sidebarOpen && (
              <span className="text-white font-semibold text-lg">SwiftTrak</span>
            )}
          </Link>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white"
          >
            {sidebarOpen ? (
              <ChevronLeftIcon className="w-5 h-5" />
            ) : (
              <ChevronRightIcon className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4">
          <ul className="space-y-1 px-3">
            {navigation.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                      isActive
                        ? 'bg-red-600 text-white'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                    )}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    {sidebarOpen && <span className="text-sm font-medium">{item.name}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>

          {isAdmin && (
            <>
              <div className="my-4 px-3">
                <div className="border-t border-gray-800" />
              </div>
              <ul className="space-y-1 px-3">
                {adminNavigation.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                          isActive
                            ? 'bg-red-600 text-white'
                            : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                        )}
                      >
                        <item.icon className="w-5 h-5 flex-shrink-0" />
                        {sidebarOpen && <span className="text-sm font-medium">{item.name}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </nav>

        {/* Notifications & Settings */}
        <div className="border-t border-gray-800 py-4 px-3 space-y-1">
          <Link
            href="/notifications"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <div className="relative">
              <BellIcon className="w-5 h-5 flex-shrink-0" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full text-xs text-white flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            {sidebarOpen && <span className="text-sm font-medium">Notifications</span>}
          </Link>
          <Link
            href="/profile"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <Cog6ToothIcon className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span className="text-sm font-medium">Settings</span>}
          </Link>
        </div>

        {/* User */}
        {user && (
          <div className="border-t border-gray-800 p-4">
            <Link
              href="/profile"
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <Avatar src={user.avatar_url} name={user.full_name} size="sm" />
              {sidebarOpen && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{user.full_name}</p>
                  <p className="text-xs text-gray-400 truncate">{user.email}</p>
                </div>
              )}
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}
