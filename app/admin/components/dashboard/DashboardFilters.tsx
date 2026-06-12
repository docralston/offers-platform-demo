'use client';

import { DASHBOARD_STORE_ALL, type DashboardStoreFilter } from '@/lib/dashboard/filters';
import { STORE_CODES } from '@/lib/config/stores';
import { getStoreDisplayId } from '@/lib/config/store-display';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const TIME_RANGES: { id: '7d' | '30d' | '90d'; label: string }[] = [
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 90 days' },
];

interface DashboardFiltersProps {
  storeCode: DashboardStoreFilter;
  range: '7d' | '30d' | '90d';
}

export function DashboardFilters({ storeCode, range }: DashboardFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleChange = (nextStore: string, nextRange: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('store', nextStore);
    params.set('range', nextRange);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm dark:border-neutral-700 dark:bg-neutral-900/40">
      <div className="flex items-center gap-2">
        <span className="text-neutral-500 dark:text-neutral-400">Store</span>
        <select
          value={storeCode}
          onChange={(e) => handleChange(e.target.value, range)}
          className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
        >
          <option value={DASHBOARD_STORE_ALL}>All</option>
          {STORE_CODES.map((code) => (
            <option key={code} value={code}>
              {getStoreDisplayId(code)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-neutral-500 dark:text-neutral-400">Time range</span>
        <select
          value={range}
          onChange={(e) => handleChange(storeCode, e.target.value)}
          className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
        >
          {TIME_RANGES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

