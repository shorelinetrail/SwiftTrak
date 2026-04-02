'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/app-store';
import {
  HomeIcon,
  ClipboardDocumentListIcon,
  MegaphoneIcon,
  ExclamationTriangleIcon,
  QuestionMarkCircleIcon,
  DocumentTextIcon,
  FlagIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  BellIcon,
  SwatchIcon,
  BuildingOfficeIcon,
  Bars3Icon,
  XMarkIcon,
  FolderIcon,
} from '@heroicons/react/24/outline';
import { Avatar } from '../ui/avatar';

import type { FeatureConfig } from '@/types/database';

type NavItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  featureKey?: keyof FeatureConfig;
};

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: HomeIcon },
  { name: 'Updates', href: '/updates', icon: MegaphoneIcon },
  { name: 'Actions', href: '/actions', icon: ClipboardDocumentListIcon },
  { name: 'Threats', href: '/threats', icon: ExclamationTriangleIcon },
  { name: 'Technical Queries', href: '/queries', icon: QuestionMarkCircleIcon, featureKey: 'technical_queries_enabled' },
  { name: 'Decisions', href: '/decisions', icon: DocumentTextIcon },
  { name: 'Milestones', href: '/milestones', icon: FlagIcon },
  { name: 'Vendors', href: '/vendors', icon: BuildingOfficeIcon },
  { name: 'Files', href: '/photos', icon: FolderIcon },
  { name: 'Gantt Chart', href: '/gantt', icon: ChartBarIcon, featureKey: 'gantt_chart_enabled' },
];

const editNavigation = [
  { name: 'Workstreams', href: '/workstreams', icon: SwatchIcon },
];

const adminNavigation = [
  { name: 'Admin Settings', href: '/admin', icon: Cog6ToothIcon },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, sidebarOpen, setSidebarOpen, mobileMenuOpen, setMobileMenuOpen, unreadCount, featureConfig } = useAppStore();

  const isAdmin = user?.role === 'admin';
  const canEdit = user?.role === 'admin' || user?.role === 'edit';

  // Filter navigation items based on feature config
  const filteredNavigation = navigation.filter(item => {
    if (!item.featureKey) return true;
    const isEnabled = featureConfig[item.featureKey];
    return isEnabled === true;
  });

  // Close mobile menu on navigation
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname, setMobileMenuOpen]);

  // Close mobile menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [setMobileMenuOpen]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const NavContent = () => (
    <>
      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <ul className="space-y-1 px-3">
          {filteredNavigation.map((item) => {
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
                  <span className="text-sm font-medium">{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        {canEdit && (
          <>
            <div className="my-4 px-3">
              <div className="border-t border-gray-800" />
            </div>
            <ul className="space-y-1 px-3">
              {editNavigation.map((item) => {
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
                      <span className="text-sm font-medium">{item.name}</span>
                    </Link>
                  </li>
                );
              })}
              {isAdmin && adminNavigation.map((item) => {
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
                      <span className="text-sm font-medium">{item.name}</span>
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
          <span className="text-sm font-medium">Notifications</span>
        </Link>
        <Link
          href="/profile"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
        >
          <Cog6ToothIcon className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium">Settings</span>
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
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.full_name}</p>
              <p className="text-xs text-gray-400 truncate">{user.email}</p>
            </div>
          </Link>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Mobile menu button - fixed at top */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-gray-900 border-b border-gray-800 px-4 h-14 flex items-center justify-between">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-lg">S</span>
          </div>
          <span className="text-white font-semibold">SwiftTrak</span>
        </Link>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? (
            <XMarkIcon className="w-6 h-6" />
          ) : (
            <Bars3Icon className="w-6 h-6" />
          )}
        </button>
      </div>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Mobile menu drawer */}
      <aside
        className={cn(
          'lg:hidden fixed left-0 top-14 bottom-0 z-40 w-72 bg-gray-900 transform transition-transform duration-300 ease-in-out',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          <NavContent />
        </div>
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden lg:block fixed left-0 top-0 z-40 h-screen bg-gray-900 transition-all duration-300',
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

          {/* Desktop Navigation - collapsed version */}
          <nav className="flex-1 overflow-y-auto py-4">
            <ul className="space-y-1 px-3">
              {filteredNavigation.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      title={!sidebarOpen ? item.name : undefined}
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

            {canEdit && (
              <>
                <div className="my-4 px-3">
                  <div className="border-t border-gray-800" />
                </div>
                <ul className="space-y-1 px-3">
                  {editNavigation.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                    return (
                      <li key={item.name}>
                        <Link
                          href={item.href}
                          title={!sidebarOpen ? item.name : undefined}
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
                  {isAdmin && adminNavigation.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                    return (
                      <li key={item.name}>
                        <Link
                          href={item.href}
                          title={!sidebarOpen ? item.name : undefined}
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
              title={!sidebarOpen ? 'Notifications' : undefined}
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
              title={!sidebarOpen ? 'Settings' : undefined}
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
    </>
  );
}
