import * as React from 'react';

const base =
  'block w-full rounded-md border bg-white py-2 pl-3 pr-9 text-sm text-neutral-900 transition-colors duration-150 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 disabled:bg-neutral-50 disabled:text-neutral-500 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:disabled:bg-neutral-800/50 dark:disabled:text-neutral-400 appearance-none bg-[url(\'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%23737373%22%20d%3D%22M2.5%204.5L6%208l3.5-3.5%22%2F%3E%3C%2Fsvg%3E\')] [background-position:right_0.5rem_center] [background-repeat:no-repeat] [background-size:1rem_1rem] [padding-right:2rem]';

const states = {
  default: 'border-neutral-300 dark:border-neutral-600',
  error: 'border-red-500 focus:border-red-500 focus:ring-red-500 dark:border-red-500',
};

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'className'> {
  error?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ error, className = '', children, ...props }, ref) => (
    <select
      ref={ref}
      className={[base, error ? states.error : states.default, className].filter(Boolean).join(' ')}
      {...props}
    >
      {children}
    </select>
  )
);
Select.displayName = 'Select';
