'use client';

import { cn } from '@/lib/utils';
import { ColorIndicator } from './color-indicator';
import type { Workstream } from '@/types/database';

interface WorkstreamBadgeProps {
  workstream: {
    name: string;
    color: string;
    parent_id?: string | null;
  };
  /** Parent workstream for showing hierarchy (e.g., "Parent / Child") */
  parent?: {
    name: string;
    color: string;
  } | null;
  /** Show full hierarchy path (Parent / Child) when parent exists */
  showHierarchy?: boolean;
  /** Size variant */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Unified workstream badge component with color indicator and optional hierarchy display.
 * Use this instead of inline workstream styling throughout the application.
 */
export function WorkstreamBadge({
  workstream,
  parent,
  showHierarchy = true,
  size = 'sm',
  className,
}: WorkstreamBadgeProps) {
  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };

  const showParent = showHierarchy && parent;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        sizes[size],
        className
      )}
      style={{
        backgroundColor: `${workstream.color}15`,
        color: workstream.color,
      }}
    >
      <ColorIndicator color={workstream.color} size="xs" />
      {showParent ? (
        <span className="flex items-center gap-1">
          <span className="opacity-70">{parent.name}</span>
          <span className="opacity-50">/</span>
          <span>{workstream.name}</span>
        </span>
      ) : (
        <span>{workstream.name}</span>
      )}
    </span>
  );
}

interface WorkstreamBadgeWithDataProps {
  workstream: Workstream;
  allWorkstreams: Workstream[];
  showHierarchy?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * WorkstreamBadge that automatically resolves parent from workstream list.
 * Convenience wrapper when you have access to the full workstreams array.
 */
export function WorkstreamBadgeWithData({
  workstream,
  allWorkstreams,
  showHierarchy = true,
  size = 'sm',
  className,
}: WorkstreamBadgeWithDataProps) {
  const parent = workstream.parent_id
    ? allWorkstreams.find(ws => ws.id === workstream.parent_id)
    : null;

  return (
    <WorkstreamBadge
      workstream={workstream}
      parent={parent}
      showHierarchy={showHierarchy}
      size={size}
      className={className}
    />
  );
}
