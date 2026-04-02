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
  /** Shape variant - 'pill' for rounded-full, 'rounded' for standard rounded corners */
  shape?: 'pill' | 'rounded';
  /** Show color indicator dot */
  showIndicator?: boolean;
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
  shape = 'pill',
  showIndicator = true,
  className,
}: WorkstreamBadgeProps) {
  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };

  const shapes = {
    pill: 'rounded-full',
    rounded: 'rounded',
  };

  const showParent = showHierarchy && parent;

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium',
        showIndicator ? 'gap-1.5' : '',
        sizes[size],
        shapes[shape],
        className
      )}
      style={{
        backgroundColor: `${workstream.color}20`,
        color: workstream.color,
      }}
    >
      {showIndicator && <ColorIndicator color={workstream.color} size="sm" />}
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
  shape?: 'pill' | 'rounded';
  showIndicator?: boolean;
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
  shape = 'pill',
  showIndicator = true,
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
      shape={shape}
      showIndicator={showIndicator}
      className={className}
    />
  );
}
