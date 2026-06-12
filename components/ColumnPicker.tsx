'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export interface ColumnPickerProps {
  availableColumns: { id: string; label: string }[];
  defaultVisibleIds: string[];
  urlParamKey?: string;
}

export function ColumnPicker({
  availableColumns,
  defaultVisibleIds,
  urlParamKey = 'cols',
}: ColumnPickerProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const visibleIds =
    searchParams.get(urlParamKey)?.split(',').filter(Boolean) || defaultVisibleIds;

  function handleToggle(id: string, checked: boolean) {
    let next: string[];
    if (checked) {
      next = visibleIds.includes(id) ? visibleIds : [...visibleIds, id];
    } else {
      if (visibleIds.length <= 1) return;
      next = visibleIds.filter((x) => x !== id);
    }
    const sp = new URLSearchParams(searchParams.toString());
    sp.set(urlParamKey, next.join(','));
    const q = sp.toString();
    router.replace(q ? `${pathname}?${q}` : pathname);
  }

  return (
    <details className="relative inline-block">
      <summary className="cursor-pointer list-none rounded-md border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800 [&::-webkit-details-marker]:hidden">
        Columns
      </summary>
      <div className="absolute right-0 z-10 mt-1 min-w-[180px] rounded-md border border-neutral-200 bg-white py-2 shadow-lg dark:border-neutral-600 dark:bg-neutral-900">
        {availableColumns.map((col) => (
          <label
            key={col.id}
            className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800"
          >
            <input
              type="checkbox"
              checked={visibleIds.includes(col.id)}
              onChange={(e) => handleToggle(col.id, e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500 dark:border-neutral-600 dark:bg-neutral-800"
            />
            {col.label}
          </label>
        ))}
      </div>
    </details>
  );
}
