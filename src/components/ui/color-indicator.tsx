'use client';

import { cn } from '@/lib/utils';

interface ColorIndicatorProps {
  color: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Standardized color indicator bubble for workstreams and other color-coded items.
 * Default size is 'sm' (w-3 h-3) for consistency across the application.
 */
export function ColorIndicator({ color, size = 'sm', className }: ColorIndicatorProps) {
  const sizes = {
    xs: 'w-2 h-2',
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  return (
    <span
      className={cn('inline-block rounded-full flex-shrink-0', sizes[size], className)}
      style={{ backgroundColor: color }}
    />
  );
}
