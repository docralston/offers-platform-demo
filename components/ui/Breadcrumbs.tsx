import Link from 'next/link';
import * as React from 'react';

export interface BreadcrumbItem {
  label: React.ReactNode;
  href?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-x-1.5 text-sm text-neutral-500 dark:text-neutral-400">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-x-1.5">
            {i > 0 && (
              <span className="text-neutral-400 dark:text-neutral-600" aria-hidden>
                /
              </span>
            )}
            {item.href ? (
              <Link
                href={item.href}
                className="hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors duration-150"
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-neutral-900 dark:text-neutral-100 font-medium" aria-current="page">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
