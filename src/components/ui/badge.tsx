'use client';

import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
  className?: string;
}

export function Badge({ children, variant = 'default', size = 'sm', className }: BadgeProps) {
  const variants = {
    default: 'bg-gray-100 text-gray-800',
    primary: 'bg-red-100 text-red-800',
    success: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    danger: 'bg-red-600 text-white',
    info: 'bg-blue-100 text-blue-800',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium rounded-full',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {children}
    </span>
  );
}

interface StatusBadgeProps {
  status: 'pending' | 'in_progress' | 'on_hold' | 'complete' | 'completed' | 'cancelled' | 'missed';
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const statusConfig = {
    pending: { label: 'Pending', variant: 'default' as const },
    in_progress: { label: 'In Progress', variant: 'info' as const },
    on_hold: { label: 'On Hold', variant: 'warning' as const },
    complete: { label: 'Complete', variant: 'success' as const },
    completed: { label: 'Completed', variant: 'success' as const },
    cancelled: { label: 'Cancelled', variant: 'danger' as const },
    missed: { label: 'Missed', variant: 'danger' as const },
  };

  const config = statusConfig[status];

  return (
    <Badge variant={config.variant} className={className}>
      {config.label}
    </Badge>
  );
}

interface PriorityBadgeProps {
  priority: 'critical' | 'urgent' | 'high' | 'medium' | 'low' | null | undefined;
  className?: string;
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  // Return nothing if no priority is set
  if (!priority) return null;

  const priorityConfig = {
    critical: { label: 'Critical', className: 'bg-red-600 text-white' },
    urgent: { label: 'Urgent', className: 'bg-red-600 text-white' },
    high: { label: 'High', className: 'bg-orange-500 text-white' },
    medium: { label: 'Medium', className: 'bg-yellow-400 text-black' },
    low: { label: 'Low', className: 'bg-green-500 text-white' },
  };

  const config = priorityConfig[priority];

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}

interface RiskBadgeProps {
  risk: 'low' | 'medium' | 'high';
  className?: string;
}

export function RiskBadge({ risk, className }: RiskBadgeProps) {
  const riskConfig = {
    low: { label: 'Low', className: 'bg-green-100 text-green-800 border border-green-300' },
    medium: { label: 'Medium', className: 'bg-yellow-100 text-yellow-800 border border-yellow-300' },
    high: { label: 'High', className: 'bg-red-100 text-red-800 border border-red-300' },
  };

  const config = riskConfig[risk];

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
