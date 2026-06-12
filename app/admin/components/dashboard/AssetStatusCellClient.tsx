'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { AssetStatus, AssetStatusInfo } from '@/lib/domain/dashboard/summary';

interface Props {
  status: AssetStatus;
  info?: AssetStatusInfo;
  label: string;
}

export function AssetStatusCellClient({ status, info, label }: Props) {
  const [showToast, setShowToast] = useState(false);
  const [isFading, setIsFading] = useState(false);
  const toastTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current != null) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  let baseClass =
    'inline-flex h-2.5 w-2.5 items-center justify-center rounded-full border border-transparent';
  let innerClass = 'h-2 w-2 rounded-full';

  if (status === 'live') {
    baseClass += ' bg-emerald-500 cursor-pointer';
    innerClass += ' bg-emerald-500';
  } else if (status === 'placeholder') {
    baseClass += ' border-emerald-500';
    innerClass += ' bg-emerald-50 dark:bg-emerald-900/40';
  } else if (status === 'error') {
    baseClass += ' bg-red-500';
    innerClass += ' bg-red-500';
  } else {
    // missing
    baseClass += ' bg-neutral-300 dark:bg-neutral-700';
    innerClass += ' bg-neutral-300 dark:bg-neutral-700';
  }

  const note = info?.note;
  const path = info?.path;
  const url = info?.url;
  const titleParts = [label, status.toUpperCase()];
  if (note) titleParts.push(note);
  if (path) titleParts.push(path);
  if (url) titleParts.push(url);
  const title = titleParts.join(' • ');

  async function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (status !== 'live' || !url) return;

    // Modified behavior:
    // - Normal click: copy URL to clipboard + toast.
    // - Alt/Option (or Meta/Cmd) click: open in new tab.
    if (e.altKey || e.metaKey) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setShowToast(true);
      setIsFading(false);
      if (toastTimeoutRef.current != null) {
        window.clearTimeout(toastTimeoutRef.current);
      }
      const fadeStart = window.setTimeout(() => {
        setIsFading(true);
      }, 2000);
      const hide = window.setTimeout(() => {
        setShowToast(false);
        setIsFading(false);
      }, 3000);
      toastTimeoutRef.current = hide;
      window.setTimeout(() => window.clearTimeout(fadeStart), 3100);
    } catch {
      // Ignore clipboard failures; no toast.
    }
  }

  return (
    <>
      <td className="px-2 py-1 text-center">
        <button
          type="button"
          className="inline-flex items-center justify-center"
          onClick={handleClick}
          title={title}
          aria-label={
            status === 'live' && url
              ? `${label}: Live. Click to copy URL; Alt/Option-click to open in new tab.`
              : `${label}: ${status.toUpperCase()}`
          }
        >
          <span className={baseClass}>
            <span className={innerClass} />
          </span>
        </button>
      </td>
      {showToast &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className={`fixed bottom-4 right-4 z-50 rounded-md bg-neutral-900 px-3 py-2 text-xs text-white shadow-lg transition-opacity duration-500 ${
              isFading ? 'opacity-0' : 'opacity-100'
            }`}
          >
            Copied to clipboard
          </div>,
          document.body,
        )}
    </>
  );
}

