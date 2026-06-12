'use client';

import * as React from 'react';

type Size = 'sm' | 'md' | 'lg' | 'xl' | 'xxl';

const sizeClass: Record<Size, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-6xl',
  xxl: 'max-w-7xl',
};

const overlay =
  'fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4';
const panel =
  'w-full rounded-md border border-neutral-200 bg-white shadow-md dark:border-neutral-700 dark:bg-neutral-900';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  size?: Size;
  children: React.ReactNode;
  /** For confirm-style: primary action slot */
  actions?: React.ReactNode;
}

export function Modal({ open, onClose, title, size = 'md', children, actions }: ModalProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  React.useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={overlay}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      <div
        ref={ref}
        className={[panel, sizeClass[size]].join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
            <h2 id="modal-title" className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              {title}
            </h2>
          </div>
        )}
        <div className="px-4 py-4">{children}</div>
        {actions && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-700">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title = 'Confirm',
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: React.ReactNode;
  body: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}) {
  const [loading, setLoading] = React.useState(false);

  const handle = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      actions={
        <>
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-1 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handle}
            disabled={loading}
            className={
              destructive
                ? 'h-9 rounded-md bg-red-600 px-3 text-sm font-medium text-white hover:bg-red-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 disabled:opacity-50'
                : 'h-9 rounded-md bg-accent-600 px-3 text-sm font-medium text-white hover:bg-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-1 disabled:opacity-50'
            }
          >
            {loading ? '…' : confirmLabel}
          </button>
        </>
      }
    >
      {body}
    </Modal>
  );
}
