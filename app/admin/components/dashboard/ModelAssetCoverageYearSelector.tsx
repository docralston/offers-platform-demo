'use client';

import { useRouter, useSearchParams } from 'next/navigation';

export function ModelAssetCoverageYearSelector() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const nowYear = new Date().getFullYear();
  const yearParam = searchParams.get('year');
  const selectedYear = yearParam ? Number(yearParam) || nowYear : nowYear;

  const baseYears = [nowYear - 1, nowYear, nowYear + 1];
  const years = Array.from(new Set([...baseYears, selectedYear])).sort((a, b) => a - b);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextYear = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    params.set('year', nextYear);
    router.push(`/admin?${params.toString()}`, { scroll: false });
  };

  return (
    <label className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
      <span>Year</span>
      <select
        className="rounded border border-neutral-300 bg-white px-1.5 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
        value={String(selectedYear)}
        onChange={handleChange}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </label>
  );
}
