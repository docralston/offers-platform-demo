import * as React from 'react';

const base = 'animate-pulse rounded bg-neutral-200 dark:bg-neutral-700';

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={[base, className].filter(Boolean).join(' ')} />;
}

export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={['space-y-2', className].filter(Boolean).join(' ')}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={[i === lines - 1 && lines > 1 ? 'w-2/3' : 'w-full', 'h-4'].join(' ')}
        />
      ))}
    </div>
  );
}
