import * as React from 'react';

type Variant = 'primary' | 'secondary' | 'tertiary' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center font-medium transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 disabled:pointer-events-none disabled:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0';

const variants: Record<Variant, string> = {
  primary:
    'bg-accent-600 text-white hover:bg-accent-500 active:bg-accent-700 dark:bg-accent-600 dark:hover:bg-accent-500 dark:active:bg-accent-700',
  secondary:
    'bg-neutral-100 text-neutral-900 ring-1 ring-inset ring-neutral-300 hover:bg-neutral-200 active:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-100 dark:ring-neutral-600 dark:hover:bg-neutral-700 dark:active:bg-neutral-600',
  tertiary:
    'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 active:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 dark:active:bg-neutral-700',
  destructive:
    'bg-red-600 text-white hover:bg-red-500 active:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500 dark:active:bg-red-700',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 gap-1.5 rounded-md px-2.5 text-sm [&>svg]:size-3.5',
  md: 'h-9 gap-2 rounded-md px-3 text-sm',
  lg: 'h-10 gap-2 rounded-md px-4 text-base',
};

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: Variant;
  size?: Size;
  className?: string;
  children: React.ReactNode;
  asChild?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  asChild,
  ...props
}: ButtonProps) {
  const cn = [base, variants[variant], sizes[size], className].filter(Boolean).join(' ');
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ className?: string }>, {
      className: [cn, (children as React.ReactElement<{ className?: string }>).props?.className].filter(Boolean).join(' '),
    });
  }
  return (
    <button type="button" className={cn} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = 'tertiary',
  size = 'md',
  className = '',
  href,
  children,
  ...props
}: Omit<ButtonProps, 'asChild'> & { href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const cn = [base, variants[variant], sizes[size], className].filter(Boolean).join(' ');
  return (
    <a href={href} className={cn} {...props}>
      {children}
    </a>
  );
}
