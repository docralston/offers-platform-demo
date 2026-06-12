/**
 * List brands, years, stores, and models from the model-page config directory.
 * Used by the GUI for scope selection (Brand → Year → Store → Models).
 */

import * as fs from "fs";
import * as path from "path";
import { slugify } from "./slug";
import type { ModelSpec } from "./schema";
import { modelListFilenameCandidates } from "./model-list-paths";

export { BRAND_MODEL_LIST_PREFIX } from "./model-list-paths";

export interface ModelWithSlug extends ModelSpec {
  slug: string;
}

export interface ListMetaResult {
  brands: string[];
  yearsByBrand: Record<string, number[]>;
  storesByBrand: Record<string, string[]>;
}

/**
 * List available brands (from configs/pages subdirs).
 */
export function listBrands(configRoot: string): string[] {
  const pagesDir = path.join(configRoot, "pages");
  if (!fs.existsSync(pagesDir)) return [];
  return fs
    .readdirSync(pagesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => !name.startsWith("."));
}

/**
 * List available years for a brand (from configs/pages/<brand> subdirs).
 */
export function listYearsForBrand(configRoot: string, brand: string): number[] {
  const brandDir = path.join(configRoot, "pages", brand.toLowerCase());
  if (!fs.existsSync(brandDir)) return [];
  const entries = fs.readdirSync(brandDir, { withFileTypes: true });
  const years: number[] = [];
  for (const e of entries) {
    if (e.isDirectory()) {
      const y = parseInt(e.name, 10);
      if (!Number.isNaN(y)) years.push(y);
    }
  }
  return years.sort((a, b) => a - b);
}

/**
 * List store keys for a brand (from configs/stores/<brand>/*.json).
 * For Lexus returns ["lexdt", "lexwg"]; for Toyota/BMW typically one store (e.g. toy, bmw).
 */
export function listStoresForBrand(configRoot: string, brand: string): string[] {
  const brandDir = path.join(configRoot, "stores", brand.toLowerCase());
  if (!fs.existsSync(brandDir)) return [];
  return fs
    .readdirSync(brandDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

/**
 * Load model list for a brand+year. Returns models with slug attached.
 */
export function listModelsForYear(
  configRoot: string,
  brand: string,
  year: number
): ModelWithSlug[] {
  const yearDir = path.join(configRoot, "pages", brand.toLowerCase(), String(year));
  const candidates = modelListFilenameCandidates(yearDir, brand, year);

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf8");
      const data = JSON.parse(raw) as { models?: ModelSpec[] } | ModelSpec[];
      const models: ModelSpec[] = Array.isArray(data) ? data : (data.models ?? []);
      return models.map((m) => ({
        ...m,
        slug: slugify(m.displayName),
      }));
    }
  }
  return [];
}

/**
 * Get full meta for GUI: brands, years per brand, stores per brand.
 */
export function getListMeta(configRoot: string): ListMetaResult {
  const brands = listBrands(configRoot);
  const yearsByBrand: Record<string, number[]> = {};
  const storesByBrand: Record<string, string[]> = {};
  for (const brand of brands) {
    yearsByBrand[brand] = listYearsForBrand(configRoot, brand);
    storesByBrand[brand] = listStoresForBrand(configRoot, brand);
  }
  return { brands, yearsByBrand, storesByBrand };
}
