/**
 * Write validated model-year page JSON and synced dist HTML (shared by admin savePage and CLI).
 */

import * as fs from 'fs';
import * as path from 'path';
import { sanitizeBmwModelPageSAVToSUV } from './bmw-acronym-sanitizer';
import { writeModelYearDistHtml } from './dist-writer';
import { normalizePunctuation } from './punctuation';
import { joinModelPagerPagesDir } from './paths';
import { loadStore } from './run';
import type { ModelYearPage } from './schema';
import { slugify } from './slug';
import { validatePage } from './validate';

/** Absolute path to pages/{brand}/{year}/[{store}/]{slug}.json */
export function getModelPagerPageJsonPath(
  configRoot: string,
  brand: string,
  year: number,
  storeKey: string | null,
  slug: string
): string {
  const brandSlug = brand.toLowerCase();
  const slugNorm = slug.toLowerCase().replace(/\.json$/, '');
  const dir = joinModelPagerPagesDir(configRoot, brandSlug, year, storeKey);
  return path.join(dir, `${slugNorm}.json`);
}

export interface PersistModelYearPageResult {
  success: boolean;
  errors?: Array<{ field: string; message: string }>;
}

export function persistModelYearPage(
  configRoot: string,
  brand: string,
  year: number,
  storeKey: string | null,
  slug: string,
  page: ModelYearPage
): PersistModelYearPageResult {
  const brandSlug = brand.toLowerCase();
  const sanitizedPage =
    brandSlug === 'bmw' ? sanitizeBmwModelPageSAVToSUV(page) : page;
  const normalizedPage = normalizePunctuation(sanitizedPage);
  const expectedSlug = slugify(page.model);
  const store = loadStore(configRoot, brandSlug, storeKey ?? null);
  const cityRaw = store.location?.city ?? 'Demotown';
  const city = cityRaw.toLowerCase().replace(/\s+/g, '-');
  const state = (store.location?.state ?? 'PA').toLowerCase();
  const expectedPagePath = `/new-${brandSlug}/${year}-${brandSlug}-${expectedSlug}-${city}-${state}.htm`;

  const errors = validatePage(normalizedPage, {
    expectedSlug,
    expectedPagePath,
    brand: brandSlug,
  });
  if (errors.length > 0) {
    return {
      success: false,
      errors: errors.map((e) => ({ field: e.path ?? 'page', message: e.message })),
    };
  }

  const filePath = getModelPagerPageJsonPath(configRoot, brand, year, storeKey, slug);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(normalizedPage, null, 2) + '\n', 'utf8');
  writeModelYearDistHtml(configRoot, brandSlug, store, normalizedPage);
  return { success: true };
}
