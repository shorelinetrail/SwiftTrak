'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAppStore } from '@/stores/app-store';
import { Button } from '../ui/button';
import { Avatar } from '../ui/avatar';
import {
  BellIcon,
  MagnifyingGlassIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';
import { Menu, Transition } from '@headlessui/react';
import { Fragment } from 'react';

interface HeaderProps {
  title?: React.ReactNode;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Header({ title, subtitle, actions }: HeaderProps) {
  const router = useRouter();
  const { user, unreadCount, isConnected } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery)}`);
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
      <div className="flex h-16 items-center justify-between px-6">
        {/* Title */}
        <div>
          {title && (
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
              {/* Connection status indicator */}
              <div
                className={`w-2 h-2 rounded-full ${
                  isConnected ? 'bg-green-500' : 'bg-gray-300'
                }`}
                title={isConnected ? 'Connected' : 'Disconnected'}
              />
            </div>
          )}
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>

        {/* Search & Actions */}
        <div className="flex items-center gap-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 pl-10 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </form>

          {/* Custom Actions */}
          {actions}

          {/* Notifications */}
          <button
            onClick={() => router.push('/notifications')}
            className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
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
              <Menu.Button className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100">
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
                      <p className="text-xs text-gray-500">{user.email}</p>
                    </div>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={() => router.push('/profile')}
                          className={`${
                            active ? 'bg-gray-100' : ''
                          } flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-700`}
                        >
                          Profile Settings
                        </button>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={handleSignOut}
                          className={`${
                            active ? 'bg-gray-100' : ''
                          } flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600`}
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
    </header>
  );
}
