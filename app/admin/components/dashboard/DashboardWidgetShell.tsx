'use client';

import type { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { DashboardWidgetColSpan } from '@/lib/dashboard/layout';

const COL_SPAN_CLASS: Record<DashboardWidgetColSpan, string> = {
  1: 'lg:col-span-1',
  2: 'lg:col-span-2',
  3: 'lg:col-span-3',
};

export function DashboardWidgetShell({
  id,
  title,
  children,
  colSpan = 1,
  collapsed,
  onToggleCollapse,
}: {
  id: string;
  title: string;
  children: ReactNode;
  colSpan?: DashboardWidgetColSpan;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex min-w-0 flex-col rounded-md border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900 ${COL_SPAN_CLASS[colSpan]}`}
    >
      <div className="flex items-center gap-2 border-b border-neutral-100 px-3 py-2 dark:border-neutral-800">
        <button
          type="button"
          className="cursor-grab touch-none rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 active:cursor-grabbing dark:hover:bg-neutral-800"
          aria-label={`Drag ${title}`}
          {...attributes}
          {...listeners}
        >
          <GripIcon />
        </button>
        <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          {title}
        </span>
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="rounded px-2 py-0.5 text-[11px] text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            {collapsed ? 'Show' : 'Hide'}
          </button>
        )}
      </div>
      {!collapsed && <div className="p-0">{children}</div>}
    </div>
  );
}

function GripIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
      <circle cx="4" cy="3" r="1.2" />
      <circle cx="10" cy="3" r="1.2" />
      <circle cx="4" cy="7" r="1.2" />
      <circle cx="10" cy="7" r="1.2" />
      <circle cx="4" cy="11" r="1.2" />
      <circle cx="10" cy="11" r="1.2" />
    </svg>
  );
}
