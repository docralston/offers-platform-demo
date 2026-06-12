import * as React from 'react';

type Status = 'live' | 'success' | 'warning' | 'error' | 'neutral' | 'inactive';

const variants: Record<Status, string> = {
  live:
    'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  success:
    'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  warning:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  error:
    'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  neutral:
    'bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300',
  inactive:
    'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

const base = 'inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium';

export interface StatusBadgeProps {
  status: Status | string;
  children?: React.ReactNode;
  className?: string;
}

const statusMap: Record<string, Status> = {
  LIVE: 'live',
  INACTIVE: 'inactive',
  live: 'live',
  inactive: 'inactive',
};

export function StatusBadge({ status, children, className = '' }: StatusBadgeProps) {
  const s = (typeof status === 'string' ? statusMap[status] ?? 'neutral' : status) as Status;
  const label = children ?? (typeof status === 'string' ? status : s);
  return (
    <span className={[base, variants[s], className].filter(Boolean).join(' ')}>
      {label}
    </span>
  );
}
