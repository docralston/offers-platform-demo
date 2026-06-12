'use client';

import * as React from 'react';

const DEFAULT_SPLIT_PCT = 50;
const MIN_PANE_PCT = 20;
const DIVIDER_WIDTH_PX = 12;

export function ResizableSplit({
  leftLabel,
  rightLabel,
  left,
  right,
  className,
}: {
  leftLabel: string;
  rightLabel: string;
  left: React.ReactNode;
  right: React.ReactNode;
  className?: string;
}) {
  const [leftPct, setLeftPct] = React.useState(DEFAULT_SPLIT_PCT);
  const [dragging, setDragging] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const dividerRef = React.useRef<HTMLDivElement>(null);
  const pointerIdRef = React.useRef<number | null>(null);

  const endDrag = React.useCallback(() => {
    setDragging(false);
    const div = dividerRef.current;
    const id = pointerIdRef.current;
    if (div && id !== null && typeof div.releasePointerCapture === 'function') {
      try {
        div.releasePointerCapture(id);
      } catch {
        /* ignore */
      }
      pointerIdRef.current = null;
    }
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    pointerIdRef.current = e.pointerId;
    setDragging(true);
    dividerRef.current?.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging || e.pointerId === undefined) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.min(100 - MIN_PANE_PCT, Math.max(MIN_PANE_PCT, (x / rect.width) * 100));
    setLeftPct(pct);
  };

  const handlePointerUpOrCancel = () => {
    endDrag();
  };

  React.useEffect(() => {
    const onLeave = () => setDragging(false);
    window.addEventListener('mouseleave', onLeave);
    return () => window.removeEventListener('mouseleave', onLeave);
  }, []);

  React.useEffect(() => {
    if (!dragging) return;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
    };
  }, [dragging]);

  return (
    <div
      ref={containerRef}
      className={`flex w-full overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-600 ${
        className ?? 'h-[420px]'
      }`}
    >
      <div
        className="flex shrink-0 flex-col overflow-hidden"
        style={{ flex: `0 0 ${leftPct}%`, minWidth: 0 }}
      >
        <h2 className="mb-2 shrink-0 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {leftLabel}
        </h2>
        <div className="min-h-0 flex-1 overflow-auto">{left}</div>
      </div>

      <div
        ref={dividerRef}
        role="separator"
        aria-valuenow={leftPct}
        aria-valuemin={MIN_PANE_PCT}
        aria-valuemax={100 - MIN_PANE_PCT}
        aria-label="Resize panels"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUpOrCancel}
        onPointerCancel={handlePointerUpOrCancel}
        className={`flex shrink-0 cursor-col-resize items-center justify-center bg-neutral-100 dark:bg-neutral-700 select-none ${
          dragging
            ? 'bg-accent-100 dark:bg-accent-900/30'
            : 'hover:bg-neutral-200 dark:hover:bg-neutral-600'
        }`}
        style={{ width: DIVIDER_WIDTH_PX }}
      >
        <span
          className="h-8 w-0.5 rounded-full bg-neutral-400 dark:bg-neutral-500"
          aria-hidden
        />
        <span className="ml-1 select-none text-xs font-medium text-neutral-500 dark:text-neutral-400" aria-hidden>
          ↔
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden" style={{ flex: '1 1 0', minWidth: 120 }}>
        <h2 className="mb-2 shrink-0 text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {rightLabel}
        </h2>
        <div className="relative min-h-0 flex-1 overflow-hidden">{right}</div>
      </div>
    </div>
  );
}

