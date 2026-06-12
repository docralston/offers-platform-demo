import * as React from 'react';

const tableWrapper = 'overflow-x-auto border border-neutral-200 dark:border-neutral-700 rounded-md';
const table = 'min-w-full divide-y divide-neutral-200 dark:divide-neutral-700';
const thead = 'bg-surface-blue dark:bg-surface-blue-dark';
const th =
  'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400';
const trBase = 'divide-x-0 divide-y-0 transition-colors duration-150';
const trHover = 'hover:bg-neutral-50 dark:hover:bg-neutral-800/60';
const trActive = 'bg-accent-50 dark:bg-accent-950/30';
const td = 'align-top whitespace-normal break-words px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100';

export function Table({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={[tableWrapper, className].filter(Boolean).join(' ')}>
      <table className={table}>{children}</table>
    </div>
  );
}

export function TableHeader({ children }: { children: React.ReactNode }) {
  return <thead className={thead}>{children}</thead>;
}

export function TableBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700 bg-surface-slate/60 dark:bg-surface-slate-dark/80">{children}</tbody>;
}

export function TableRow({
  children,
  active,
  className = '',
}: { children: React.ReactNode; active?: boolean; className?: string }) {
  return (
    <tr
      className={[trBase, trHover, active ? trActive : '', className].filter(Boolean).join(' ')}
    >
      {children}
    </tr>
  );
}

export function TableHead({
  children,
  align = 'left',
  className = '',
}: { children: React.ReactNode; align?: 'left' | 'right' | 'center'; className?: string }) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : '';
  return <th className={[th, alignClass, className].filter(Boolean).join(' ')} scope="col">{children}</th>;
}

export function TableCell({
  children,
  align = 'left',
  className = '',
  colSpan,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  colSpan?: number;
}) {
  const alignClass = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : '';
  return (
    <td colSpan={colSpan} className={[td, alignClass, className].filter(Boolean).join(' ')}>
      {children}
    </td>
  );
}

export function TableEmpty({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
        {children}
      </td>
    </tr>
  );
}

export function TableLoading({ colSpan, rows = 5 }: { colSpan: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className={trBase}>
          <td colSpan={colSpan} className="px-4 py-3">
            <div className="h-5 w-full animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
          </td>
        </tr>
      ))}
    </>
  );
}
