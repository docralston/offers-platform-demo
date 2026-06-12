'use server';

import { requireAdmin } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

import { runAssetHealthChecks } from '@/lib/domain/dashboard/asset-health';
import type { ModelCoverageBrand } from '@/lib/domain/dashboard/summary';

const BRANDS: ModelCoverageBrand[] = ['bmw', 'toyota', 'lexus'];

export async function refreshAllAssetHealth(year: number) {
  await requireAdmin();
  await Promise.all(BRANDS.map((brand) => runAssetHealthChecks({ brand, year })));
  revalidatePath('/admin');
}

