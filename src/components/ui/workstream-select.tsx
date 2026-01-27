'use client';

import { useMemo } from 'react';
import { Select } from './select';
import { ColorIndicator } from './color-indicator';
import type { Workstream } from '@/types/database';

interface WorkstreamSelectProps {
  workstreams: Workstream[];
  value: string;
  onChange: (value: string) => void;
  /** Include "All Workstreams" option at the top */
  includeAll?: boolean;
  /** Label for the "All" option */
  allLabel?: string;
  /** Label for the select field */
  label?: string;
  /** Error message */
  error?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Additional className */
  className?: string;
  /** Placeholder text */
  placeholder?: string;
}

/**
 * Workstream select dropdown with visual hierarchy.
 * Shows parent/child relationships with indentation and color indicators.
 */
export function WorkstreamSelect({
  workstreams,
  value,
  onChange,
  includeAll = true,
  allLabel = 'All Workstreams',
  label,
  error,
  disabled,
  className,
  placeholder,
}: WorkstreamSelectProps) {
  const options = useMemo(() => {
    // Separate root workstreams and build children map
    const rootWorkstreams = workstreams.filter(ws => !ws.parent_id);
    const childrenMap = new Map<string, Workstream[]>();

    workstreams.forEach(ws => {
      if (ws.parent_id) {
        const existing = childrenMap.get(ws.parent_id) || [];
        existing.push(ws);
        childrenMap.set(ws.parent_id, existing);
      }
    });

    // Sort root workstreams by order_index
    rootWorkstreams.sort((a, b) => a.order_index - b.order_index);

    const result: Array<{
      value: string;
      label: string;
      icon?: React.ReactNode;
      description?: string;
    }> = [];

    // Add "All" option if requested
    if (includeAll) {
      result.push({
        value: 'all',
        label: allLabel,
      });
    }

    // Add workstreams with hierarchy
    rootWorkstreams.forEach(parent => {
      const children = childrenMap.get(parent.id) || [];
      const childCount = children.length;

      // Add parent workstream
      result.push({
        value: parent.id,
        label: parent.name,
        icon: <ColorIndicator color={parent.color} size="sm" />,
        description: childCount > 0 ? `${childCount} sub-workstream${childCount !== 1 ? 's' : ''}` : undefined,
      });

      // Sort children by order_index and add them
      children
        .sort((a, b) => a.order_index - b.order_index)
        .forEach(child => {
          result.push({
            value: child.id,
            label: `└ ${child.name}`,
            icon: <ColorIndicator color={child.color} size="sm" />,
            description: `in ${parent.name}`,
          });
        });
    });

    return result;
  }, [workstreams, includeAll, allLabel]);

  return (
    <Select
      label={label}
      options={options}
      value={value}
      onChange={onChange}
      error={error}
      disabled={disabled}
      className={className}
      placeholder={placeholder}
    />
  );
}
