'use client';

import { cn } from '@/lib/utils';
import { Card, CardContent } from './card';

type StatsColor = 'red' | 'orange' | 'yellow' | 'amber' | 'green' | 'blue' | 'gray';

interface StatsCardProps {
  title: string;
  value: number | string;
  icon?: React.ReactNode;
  /** Visual style variant */
  variant?: 'gradient' | 'light' | 'bordered';
  /** Color theme */
  color?: StatsColor;
  /** Optional subtitle or trend text */
  subtitle?: string;
  /** Click handler */
  onClick?: () => void;
  className?: string;
}

const gradientColors: Record<StatsColor, string> = {
  red: 'from-red-500 to-red-600',
  orange: 'from-orange-500 to-orange-600',
  yellow: 'from-yellow-500 to-yellow-600',
  amber: 'from-amber-500 to-amber-600',
  green: 'from-green-500 to-green-600',
  blue: 'from-blue-500 to-blue-600',
  gray: 'from-gray-500 to-gray-600',
};

const lightColors: Record<StatsColor, { bg: string; border: string; text: string; subtext: string }> = {
  red: { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', subtext: 'text-red-600' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', subtext: 'text-orange-600' },
  yellow: { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', subtext: 'text-yellow-600' },
  amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', subtext: 'text-amber-600' },
  green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', subtext: 'text-green-600' },
  blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', subtext: 'text-blue-600' },
  gray: { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700', subtext: 'text-gray-600' },
};

const borderedColors: Record<StatsColor, string> = {
  red: 'border-red-200 text-red-600',
  orange: 'border-orange-200 text-orange-600',
  yellow: 'border-yellow-200 text-yellow-600',
  amber: 'border-amber-200 text-amber-600',
  green: 'border-green-200 text-green-600',
  blue: 'border-blue-200 text-blue-600',
  gray: 'border-gray-200 text-gray-600',
};

/**
 * Unified stats card component for displaying metrics consistently.
 * Supports three variants: gradient (dashboard), light (section stats), and bordered (executive).
 */
export function StatsCard({
  title,
  value,
  icon,
  variant = 'light',
  color = 'gray',
  subtitle,
  onClick,
  className,
}: StatsCardProps) {
  if (variant === 'gradient') {
    return (
      <Card
        className={cn(
          'bg-gradient-to-br text-white border-0',
          gradientColors[color],
          onClick && 'cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all',
          className
        )}
        onClick={onClick}
        padding="none"
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium opacity-90">{title}</p>
              <p className="text-3xl font-bold mt-1">{value}</p>
              {subtitle && <p className="text-xs opacity-75 mt-1">{subtitle}</p>}
            </div>
            {icon && (
              <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                {icon}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (variant === 'bordered') {
    const colorStyles = lightColors[color];
    return (
      <Card
        className={cn(
          'border-2',
          colorStyles.bg,
          colorStyles.border,
          onClick && 'cursor-pointer hover:shadow-md transition-all',
          className
        )}
        onClick={onClick}
        padding="none"
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className={colorStyles.text}>
              <p className="text-sm font-medium opacity-80">{title}</p>
              <p className="text-3xl font-bold mt-1">{value}</p>
              {subtitle && <p className="text-xs opacity-60 mt-1">{subtitle}</p>}
            </div>
            {icon && <div className="opacity-40">{icon}</div>}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Light variant (default)
  const colorStyles = lightColors[color];
  return (
    <Card
      className={cn(
        colorStyles.bg,
        colorStyles.border,
        onClick && 'cursor-pointer hover:shadow-md transition-all',
        className
      )}
      onClick={onClick}
      padding="none"
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className={cn('text-sm font-medium', colorStyles.subtext)}>{title}</p>
            <p className={cn('text-2xl font-bold', colorStyles.text)}>{value}</p>
            {subtitle && <p className={cn('text-xs mt-1', colorStyles.subtext)}>{subtitle}</p>}
          </div>
          {icon && (
            <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', colorStyles.bg, colorStyles.text)}>
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
