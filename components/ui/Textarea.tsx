import * as React from 'react';

const base =
  'block w-full rounded-md border bg-white py-2 px-3 text-sm text-neutral-900 transition-colors duration-150 placeholder:text-neutral-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500 disabled:bg-neutral-50 disabled:text-neutral-500 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder-neutral-500 dark:disabled:bg-neutral-800/50 dark:disabled:text-neutral-400 min-h-[4.5rem] resize-y';

const states = {
  default: 'border-neutral-300 dark:border-neutral-600',
  error: 'border-red-500 focus:border-red-500 focus:ring-red-500 dark:border-red-500',
};

export interface TextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {
  error?: boolean;
  className?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, className = '', ...props }, ref) => (
    <textarea
      ref={ref}
      className={[base, error ? states.error : states.default, className].filter(Boolean).join(' ')}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';
