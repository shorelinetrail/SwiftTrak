'use client';

import { Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  mobileFullScreen?: boolean;
}

export function Modal({ open, onClose, title, description, children, size = 'md', mobileFullScreen = false }: ModalProps) {
  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-4xl',
  };

  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/25 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className={cn(
            'flex min-h-full items-center justify-center',
            mobileFullScreen ? 'p-0 sm:p-4' : 'p-4'
          )}>
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel
                className={cn(
                  'w-full transform bg-white shadow-xl transition-all',
                  mobileFullScreen
                    ? 'min-h-screen sm:min-h-0 sm:rounded-xl pb-safe'
                    : 'rounded-xl',
                  sizes[size]
                )}
              >
                {title && (
                  <div className={cn(
                    'flex items-center justify-between border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4',
                    mobileFullScreen && 'sticky top-0 bg-white z-10'
                  )}>
                    <div className="pr-4">
                      <Dialog.Title as="h3" className="text-base sm:text-lg font-semibold text-gray-900">
                        {title}
                      </Dialog.Title>
                      {description && (
                        <Dialog.Description className="mt-1 text-sm text-gray-500">
                          {description}
                        </Dialog.Description>
                      )}
                    </div>
                    <button
                      type="button"
                      className="rounded-lg p-2.5 text-gray-400 hover:bg-gray-100 hover:text-gray-500 -mr-2 touch-manipulation min-w-[44px] min-h-[44px] flex items-center justify-center"
                      onClick={onClose}
                    >
                      <XMarkIcon className="h-5 w-5 sm:h-6 sm:w-6" />
                    </button>
                  </div>
                )}
                <div className={cn(
                  !title && 'pt-4 sm:pt-6',
                  'px-4 pb-4 sm:px-6 sm:pb-6',
                  mobileFullScreen ? 'max-h-none' : 'max-h-[80vh] overflow-y-auto overflow-x-visible'
                )}>
                  {children}
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
}
