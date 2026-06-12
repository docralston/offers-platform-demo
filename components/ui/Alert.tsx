import * as React from 'react';

type Tone = 'error' | 'warning' | 'success' | 'info';

const tones: Record<Tone, string> = {
  error:
    'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200',
  warning:
    'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
  success:
    'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200',
  info:
    'border-neutral-200 bg-neutral-50 text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-200',
};

const base = 'rounded-md border px-4 py-3 text-sm';

export interface AlertProps {
  tone?: Tone;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function Alert({ tone = 'info', title, children, className = '' }: AlertProps) {
  return (
    <div className={[base, tones[tone], className].filter(Boolean).join(' ')} role="alert">
      {title && <p className="font-medium">{title}</p>}
      <div className={title ? 'mt-1' : ''}>{children}</div>
    </div>
  );
}
