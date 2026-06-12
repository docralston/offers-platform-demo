import { demoAssetBaseUrl } from '@/lib/config/demo';
import { slugify } from '@/lib/model-page-generator/slug';

export type DemoAssetKind = 'hero' | 'jellybean';

/** Flat demo filename: `2026-toyota-corolla-hero.webp` */
export function demoFlatAssetFilename(
  brandSlug: string,
  year: number,
  modelSlug: string,
  kind: DemoAssetKind
): string {
  return `${year}-${brandSlug}-${modelSlug}-${kind}.webp`;
}

/** Relative path under `public/demo/assets/`: `toyota/2026/2026-toyota-corolla-hero.webp` */
export function demoFlatAssetPath(
  brandSlug: string,
  year: number,
  modelSlug: string,
  kind: DemoAssetKind
): string {
  return `${brandSlug}/${year}/${demoFlatAssetFilename(brandSlug, year, modelSlug, kind)}`;
}

/** Page JSON path for demo mode (no `/assets/` prefix, no model subfolder). */
export function demoModelPageImagePath(
  brandSlug: string,
  year: number,
  modelSlug: string,
  kind: DemoAssetKind
): string {
  return `/${demoFlatAssetPath(brandSlug, year, modelSlug, kind)}`;
}

/**
 * Map prod nested path `/assets/toyota/2026/corolla/2026-toyota-corolla-hero.webp`
 * to demo flat `/toyota/2026/2026-toyota-corolla-hero.webp`.
 */
export function rewriteProdAssetPathForDemo(prodPath: string): string {
  const trimmed = prodPath.trim();
  const nested = trimmed.match(
    /^\/assets\/([^/]+)\/(\d+)\/[^/]+\/(\d+-\1-.+-(?:hero|jellybean)\.webp)$/i
  );
  if (nested) {
    return `/${nested[1]}/${nested[2]}/${nested[3]}`;
  }
  if (trimmed.startsWith('/assets/')) {
    return trimmed.replace(/^\/assets\//, '/');
  }
  return trimmed;
}

export function demoModelPageAssetBaseUrl(): string {
  return demoAssetBaseUrl();
}

export function demoJellybeanFilename(make: string, model: string, year: number): string {
  const brandSlug = make.trim().toLowerCase();
  const modelSlug = slugify(model);
  return demoFlatAssetFilename(brandSlug, year, modelSlug, 'jellybean');
}
