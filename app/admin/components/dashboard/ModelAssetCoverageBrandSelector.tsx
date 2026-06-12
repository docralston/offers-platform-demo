'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { ModelCoverageBrand } from '@/lib/domain/dashboard/summary';

const BRAND_OPTIONS: { value: ModelCoverageBrand; label: string }[] = [
  { value: 'toyota', label: 'Toyota' },
  { value: 'lexus', label: 'Lexus' },
  { value: 'bmw', label: 'BMW' },
];

export function ModelAssetCoverageBrandSelector() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const brandParam = searchParams.get('brand');
  const selectedBrand: ModelCoverageBrand =
    brandParam === 'lexus' || brandParam === 'bmw' ? brandParam : 'toyota';

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextBrand = e.target.value as ModelCoverageBrand;
    const params = new URLSearchParams(searchParams.toString());
    params.set('brand', nextBrand);
    router.push(`/admin?${params.toString()}`, { scroll: false });
  };

  return (
    <label className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
      <span>Brand</span>
      <select
        className="rounded border border-neutral-300 bg-white px-1.5 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
        value={selectedBrand}
        onChange={handleChange}
      >
        {BRAND_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
