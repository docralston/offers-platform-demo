import * as React from 'react';

const base =
  'block w-full rounded-md border bg-white py-2 pl-3 pr-3 text-sm text-neutral-900 transition-colors duration-150 placeholder:text-neutral-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 disabled:bg-neutral-50 disabled:text-neutral-500 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder-neutral-500 dark:disabled:bg-neutral-800/50 dark:disabled:text-neutral-400';

const states = {
  default: 'border-neutral-300 dark:border-neutral-600',
  error: 'border-red-500 focus:border-red-500 focus:ring-red-500 dark:border-red-500',
};

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className'> {
  error?: boolean;
  className?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ error, className = '', type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={[base, error ? states.error : states.default, type === 'date' ? '[color-scheme:light] dark:[color-scheme:dark]' : '', className].filter(Boolean).join(' ')}
      {...props}
    />
  )
);
Input.displayName = 'Input';
