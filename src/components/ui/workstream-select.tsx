'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronUpDownIcon, CheckIcon } from '@heroicons/react/20/solid';
import { ChevronRightIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils';
import type { Workstream } from '@/types/database';

interface WorkstreamSelectProps {
  workstreams: Workstream[];
  value: string; // Can be 'all', a workstream id, or 'parent:id' for parent+children
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  includeAll?: boolean;
}

export function WorkstreamSelect({
  workstreams,
  value,
  onChange,
  placeholder = 'All Workstreams',
  disabled,
  className,
  includeAll = true,
}: WorkstreamSelectProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: Math.max(rect.width, 240),
      });
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const handlePositionUpdate = () => updatePosition();
    window.addEventListener('scroll', handlePositionUpdate, true);
    window.addEventListener('resize', handlePositionUpdate);
    return () => {
      window.removeEventListener('scroll', handlePositionUpdate, true);
      window.removeEventListener('resize', handlePositionUpdate);
    };
  }, [isOpen, updatePosition]);

  // Build hierarchy
  const rootWorkstreams = workstreams
    .filter(ws => !ws.parent_id)
    .sort((a, b) => a.name.localeCompare(b.name));

  const childrenMap = new Map<string, Workstream[]>();
  workstreams.forEach(ws => {
    if (ws.parent_id) {
      const existing = childrenMap.get(ws.parent_id) || [];
      existing.push(ws);
      childrenMap.set(ws.parent_id, existing.sort((a, b) => a.name.localeCompare(b.name)));
    }
  });

  const toggleExpanded = (parentId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
      } else {
        next.add(parentId);
      }
      return next;
    });
  };

  // Get display label
  const getDisplayLabel = () => {
    if (value === 'all' || !value) return placeholder;

    if (value.startsWith('parent:')) {
      const parentId = value.replace('parent:', '');
      const parent = workstreams.find(ws => ws.id === parentId);
      if (parent) {
        const childCount = childrenMap.get(parentId)?.length || 0;
        return `${parent.name} (all ${childCount + 1})`;
      }
    }

    const ws = workstreams.find(w => w.id === value);
    if (ws) {
      if (ws.parent_id) {
        const parent = workstreams.find(w => w.id === ws.parent_id);
        return parent ? `${parent.name} / ${ws.name}` : ws.name;
      }
      return ws.name;
    }
    return placeholder;
  };

  const handleSelect = (newValue: string) => {
    onChange(newValue);
    setIsOpen(false);
  };

  const isSelected = (checkValue: string) => value === checkValue;

  return (
    <div className={cn('space-y-1', className)}>
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'relative w-full cursor-pointer rounded-lg border bg-white py-2 pl-3 pr-10 text-left text-sm',
            'focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500',
            disabled && 'bg-gray-50 cursor-not-allowed',
            'border-gray-300'
          )}
        >
          <span className={cn('block truncate', value === 'all' && 'text-gray-500')}>
            {getDisplayLabel()}
          </span>
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
            <ChevronUpDownIcon className="h-5 w-5 text-gray-400" />
          </span>
        </button>

        {mounted && isOpen && createPortal(
          <>
            <div
              className="fixed inset-0 z-[9998]"
              onClick={() => setIsOpen(false)}
            />
            <div
              className="fixed z-[9999] max-h-72 overflow-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5"
              style={{
                top: dropdownPosition.top,
                left: dropdownPosition.left,
                width: dropdownPosition.width,
              }}
            >
              {/* All option */}
              {includeAll && (
                <div
                  onClick={() => handleSelect('all')}
                  className={cn(
                    'relative cursor-pointer select-none py-2 pl-10 pr-4',
                    'hover:bg-red-50 hover:text-red-900',
                    isSelected('all') && 'bg-red-50/50'
                  )}
                >
                  <span className={cn('block truncate', isSelected('all') && 'font-medium')}>
                    {placeholder}
                  </span>
                  {isSelected('all') && (
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-red-600">
                      <CheckIcon className="h-5 w-5" />
                    </span>
                  )}
                </div>
              )}

              {/* Workstream hierarchy */}
              {rootWorkstreams.map(parent => {
                const children = childrenMap.get(parent.id) || [];
                const hasChildren = children.length > 0;
                const isExpanded = expandedParents.has(parent.id);
                const parentValue = hasChildren ? `parent:${parent.id}` : parent.id;
                const isParentSelected = isSelected(parentValue) || isSelected(parent.id);

                return (
                  <div key={parent.id}>
                    {/* Parent row */}
                    <div
                      className={cn(
                        'relative cursor-pointer select-none py-2 pr-4',
                        hasChildren ? 'pl-3' : 'pl-10',
                        'hover:bg-red-50 hover:text-red-900',
                        isParentSelected && 'bg-red-50/50'
                      )}
                    >
                      <div className="flex items-center gap-1">
                        {hasChildren && (
                          <button
                            type="button"
                            onClick={(e) => toggleExpanded(parent.id, e)}
                            className="p-0.5 hover:bg-gray-200 rounded"
                          >
                            {isExpanded ? (
                              <ChevronDownIcon className="h-4 w-4 text-gray-500" />
                            ) : (
                              <ChevronRightIcon className="h-4 w-4 text-gray-500" />
                            )}
                          </button>
                        )}
                        <div
                          className="flex-1 flex items-center"
                          onClick={() => handleSelect(parentValue)}
                        >
                          <span className={cn(
                            'block truncate flex-1',
                            isParentSelected && 'font-medium'
                          )}>
                            {parent.name}
                            {hasChildren && (
                              <span className="text-xs text-gray-400 ml-1.5">
                                ({children.length + 1})
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                      {isParentSelected && (
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-red-600">
                          {!hasChildren && <CheckIcon className="h-5 w-5" />}
                        </span>
                      )}
                      {hasChildren && isSelected(parentValue) && (
                        <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-red-600">
                          <CheckIcon className="h-5 w-5" />
                        </span>
                      )}
                    </div>

                    {/* Children (when expanded) */}
                    {hasChildren && isExpanded && (
                      <div className="ml-4 border-l border-gray-200">
                        {children.map(child => {
                          const isChildSelected = isSelected(child.id);
                          return (
                            <div
                              key={child.id}
                              onClick={() => handleSelect(child.id)}
                              className={cn(
                                'relative cursor-pointer select-none py-2 pl-8 pr-4',
                                'hover:bg-red-50 hover:text-red-900',
                                isChildSelected && 'bg-red-50/50'
                              )}
                            >
                              <span className={cn(
                                'block truncate',
                                isChildSelected && 'font-medium'
                              )}>
                                <span className="text-gray-400">{parent.name} / </span>
                                {child.name}
                              </span>
                              {isChildSelected && (
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-red-600">
                                  <CheckIcon className="h-5 w-5" />
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>,
          document.body
        )}
      </div>
    </div>
  );
}

/**
 * Helper function to get workstream IDs for filtering based on a selection value.
 * Returns array of workstream IDs that match the selection.
 */
export function getWorkstreamFilterIds(
  value: string,
  workstreams: Workstream[]
): string[] | null {
  if (value === 'all' || !value) return null; // null means no filter

  if (value.startsWith('parent:')) {
    const parentId = value.replace('parent:', '');
    // Get parent + all children
    const ids = [parentId];
    workstreams.forEach(ws => {
      if (ws.parent_id === parentId) {
        ids.push(ws.id);
      }
    });
    return ids;
  }

  // Single workstream ID
  return [value];
}
