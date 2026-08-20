'use client';

import { cn } from '@/lib/utils';

interface TableWrapperProps {
  children: React.ReactNode;
  className?: string;
}

export function TableWrapper({ children, className }: TableWrapperProps) {
  return (
    <div className={cn(
      'w-full overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0',
      'scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent',
      className
    )}>
      <div className="inline-block min-w-full align-middle">
        {children}
      </div>
    </div>
  );
}

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  children: React.ReactNode;
}

export function Table({ children, className, ...props }: TableProps) {
  return (
    <table
      className={cn('min-w-full divide-y divide-gray-200', className)}
      {...props}
    >
      {children}
    </table>
  );
}

interface TableHeadProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  children: React.ReactNode;
}

export function TableHead({ children, className, ...props }: TableHeadProps) {
  return (
    <thead className={cn('bg-gray-50', className)} {...props}>
      {children}
    </thead>
  );
}

interface TableBodyProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  children: React.ReactNode;
}

export function TableBody({ children, className, ...props }: TableBodyProps) {
  return (
    <tbody className={cn('divide-y divide-gray-200 bg-white', className)} {...props}>
      {children}
    </tbody>
  );
}

interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  children: React.ReactNode;
  hover?: boolean;
}

export function TableRow({ children, className, hover = true, ...props }: TableRowProps) {
  return (
    <tr
      className={cn(hover && 'hover:bg-gray-50 transition-colors', className)}
      {...props}
    >
      {children}
    </tr>
  );
}

interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  children: React.ReactNode;
}

export function TableHeader({ children, className, ...props }: TableCellProps) {
  return (
    <th
      className={cn(
        'px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap',
        className
      )}
      {...props}
    >
      {children}
    </th>
  );
}

export function TableCell({ children, className, ...props }: TableCellProps) {
  return (
    <td
      className={cn('px-4 py-3 text-sm text-gray-900 whitespace-nowrap', className)}
      {...props}
    >
      {children}
    </td>
  );
}

interface TableCellStickyProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  children: React.ReactNode;
  isHeader?: boolean;
}

export function TableCellSticky({ children, className, isHeader = false, ...props }: TableCellStickyProps) {
  const Component = isHeader ? 'th' : 'td';
  return (
    <Component
      className={cn(
        'px-4 py-3 text-sm whitespace-nowrap',
        'sticky left-0 z-10',
        isHeader
          ? 'text-xs font-medium text-gray-500 uppercase tracking-wider bg-gray-50'
          : 'text-gray-900 bg-white',
        'after:absolute after:right-0 after:top-0 after:bottom-0 after:w-4 after:bg-gradient-to-r after:from-transparent after:to-white/80',
        className
      )}
      {...props}
    >
      {children}
    </Component>
  );
}
