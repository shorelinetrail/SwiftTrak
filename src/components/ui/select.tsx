'use client';

import { forwardRef, Fragment } from 'react';
import { Listbox, Transition } from '@headlessui/react';
import { CheckIcon, ChevronUpDownIcon } from '@heroicons/react/20/solid';
import { cn } from '@/lib/utils';

interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

interface SelectProps {
  label?: string;
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
}

export const Select = forwardRef<HTMLDivElement, SelectProps>(
  ({ label, options, value, onChange, placeholder = 'Select...', error, disabled, className }, ref) => {
    const selectedOption = options.find(o => o.value === value);

    return (
      <div ref={ref} className={cn('space-y-1', className)}>
        {label && (
          <label className="block text-sm font-medium text-gray-700">{label}</label>
        )}
        <Listbox value={value} onChange={onChange} disabled={disabled}>
          <div className="relative">
            <Listbox.Button
              className={cn(
                'relative w-full cursor-pointer rounded-lg border bg-white py-2 pl-3 pr-10 text-left',
                'focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500',
                disabled && 'bg-gray-50 cursor-not-allowed',
                error ? 'border-red-500' : 'border-gray-300'
              )}
            >
              <span className={cn('block truncate', !selectedOption && 'text-gray-400')}>
                {selectedOption ? (
                  <span className="flex items-center gap-2">
                    {selectedOption.icon}
                    {selectedOption.label}
                  </span>
                ) : (
                  placeholder
                )}
              </span>
              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
              </span>
            </Listbox.Button>
            <Transition
              as={Fragment}
              leave="transition ease-in duration-100"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <Listbox.Options className="absolute z-[100] mt-1 max-h-60 w-full overflow-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                {options.map((option) => (
                  <Listbox.Option
                    key={option.value}
                    value={option.value}
                    className={({ active }) =>
                      cn(
                        'relative cursor-pointer select-none py-2 pl-10 pr-4',
                        active ? 'bg-red-50 text-red-900' : 'text-gray-900'
                      )
                    }
                  >
                    {({ selected }) => (
                      <>
                        <span className={cn('block truncate', selected && 'font-medium')}>
                          <span className="flex items-center gap-2">
                            {option.icon}
                            {option.label}
                          </span>
                          {option.description && (
                            <span className="text-xs text-gray-500">{option.description}</span>
                          )}
                        </span>
                        {selected && (
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-red-600">
                            <CheckIcon className="h-5 w-5" />
                          </span>
                        )}
                      </>
                    )}
                  </Listbox.Option>
                ))}
              </Listbox.Options>
            </Transition>
          </div>
        </Listbox>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }
);

Select.displayName = 'Select';
