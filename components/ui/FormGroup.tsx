import * as React from 'react';

export interface FormGroupProps {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function FormGroup({ label, htmlFor, hint, error, required, children, className = '' }: FormGroupProps) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
      >
        {label}
        {required && <span className="text-red-600 dark:text-red-400" aria-hidden> *</span>}
      </label>
      {hint && (
        <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400" id={htmlFor ? `${htmlFor}-hint` : undefined}>
          {hint}
        </p>
      )}
      <div className="mt-1.5">{children}</div>
      {error && (
        <p className="mt-1.5 text-sm text-red-600 dark:text-red-400" id={htmlFor ? `${htmlFor}-error` : undefined} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
