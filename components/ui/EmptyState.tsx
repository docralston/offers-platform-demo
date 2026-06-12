import * as React from 'react';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div
      className={[
        'flex flex-col items-center justify-center rounded-md border border-dashed border-neutral-300 bg-surface-slate/80 px-6 py-12 text-center dark:border-neutral-700 dark:bg-surface-slate-dark/60',
        className,
      ].filter(Boolean).join(' ')}
    >
      {icon && <div className="mb-3 text-neutral-400 dark:text-neutral-500">{icon}</div>}
      <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
