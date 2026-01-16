'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { Avatar } from '../ui/avatar';
import {
  BellIcon,
  MagnifyingGlassIcon,
  ArrowRightOnRectangleIcon,
  ChevronRightIcon,
  HomeIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { Menu, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { cn } from '@/lib/utils';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface HeaderProps {
  title?: React.ReactNode;
  subtitle?: string;
  actions?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
}

export function Header({ title, subtitle, actions, breadcrumbs }: HeaderProps) {
  const router = useRouter();
  const { user, unreadCount, isConnected } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
      setSearchOpen(false);
    }
  };

  return (
    <header className="sticky top-0 lg:top-0 z-30 bg-white border-b border-gray-200">
      <div className={cn(
        'flex items-center justify-between px-4 sm:px-6',
        breadcrumbs && breadcrumbs.length > 0 ? 'py-3' : 'h-14 sm:h-16'
      )}>
        {/* Title & Breadcrumbs */}
        <div className="min-w-0 flex-1">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="flex items-center gap-1 text-xs mb-0.5 overflow-x-auto">
              <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                <HomeIcon className="w-3.5 h-3.5" />
              </Link>
              {breadcrumbs.map((crumb, index) => (
                <span key={index} className="flex items-center gap-1 flex-shrink-0">
                  <ChevronRightIcon className="w-3 h-3 text-gray-400" />
                  {crumb.href ? (
                    <Link href={crumb.href} className="text-gray-500 hover:text-gray-700 truncate max-w-[100px] sm:max-w-[150px]">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-gray-700 font-medium truncate max-w-[120px] sm:max-w-[200px]">{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
          {title && (
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-semibold text-gray-900 truncate">{title}</h1>
              {/* Connection status indicator */}
              <div
                className={cn(
                  'w-2 h-2 rounded-full flex-shrink-0',
                  isConnected ? 'bg-green-500' : 'bg-gray-300'
                )}
                title={isConnected ? 'Connected' : 'Disconnected'}
              />
            </div>
          )}
          {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Mobile Search Toggle */}
          <button
            onClick={() => setSearchOpen(!searchOpen)}
            className="lg:hidden p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg touch-manipulation"
          >
            {searchOpen ? (
              <XMarkIcon className="w-5 h-5" />
            ) : (
              <MagnifyingGlassIcon className="w-5 h-5" />
            )}
          </button>

          {/* Desktop Search */}
          <form onSubmit={handleSearch} className="relative hidden lg:block">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-48 xl:w-64 pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </form>

          {/* Custom Actions - hidden on small mobile */}
          <div className="hidden sm:flex items-center gap-2">
            {actions}
          </div>

          {/* Notifications */}
          <button
            onClick={() => router.push('/notifications')}
            className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg touch-manipulation"
          >
            <BellIcon className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-0 right-0 w-5 h-5 bg-red-600 rounded-full text-xs text-white flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* User Menu */}
          {user && (
            <Menu as="div" className="relative">
              <Menu.Button className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 touch-manipulation">
                <Avatar src={user.avatar_url} name={user.full_name} size="sm" />
              </Menu.Button>
              <Transition
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <Menu.Items className="absolute right-0 mt-2 w-56 origin-top-right rounded-lg bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                  <div className="p-2">
                    <div className="px-3 py-2 border-b border-gray-100">
                      <p className="text-sm font-medium text-gray-900">{user.full_name}</p>
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    </div>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={() => router.push('/profile')}
                          className={cn(
                            active && 'bg-gray-100',
                            'flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm text-gray-700 touch-manipulation'
                          )}
                        >
                          Profile Settings
                        </button>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={handleSignOut}
                          className={cn(
                            active && 'bg-gray-100',
                            'flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-sm text-red-600 touch-manipulation'
                          )}
                        >
                          <ArrowRightOnRectangleIcon className="w-4 h-4" />
                          Sign Out
                        </button>
                      )}
                    </Menu.Item>
                  </div>
                </Menu.Items>
              </Transition>
            </Menu>
          )}
        </div>
      </div>

      {/* Mobile Search Drawer */}
      {searchOpen && (
        <div className="lg:hidden px-4 pb-3 border-t border-gray-100">
          <form onSubmit={handleSearch} className="relative mt-3">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              className="w-full pl-10 pr-4 py-3 text-base bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </form>
          {/* Show actions on mobile when search is open */}
          {actions && (
            <div className="flex items-center gap-2 mt-3 sm:hidden">
              {actions}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
