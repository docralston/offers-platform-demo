/**
 * Canonical filesystem paths for modelpager configs (pages JSON, etc.).
 */

import * as path from "path";
import { listStoresForBrand } from "./list";
import { pagesUseStoreSubdirForBrand } from "./brand-paths";

/** @deprecated Use {@link pagesUseStoreSubdirForBrand} — requires config root. */
export function modelPagerPagesUseStoreSubdir(
  configRoot: string,
  brandSlug: string
): boolean {
  return pagesUseStoreSubdirForBrand(configRoot, brandSlug);
}

/**
 * Absolute path to the directory containing model-year `*.json` pages for this scope.
 */
export function joinModelPagerPagesDir(
  configRoot: string,
  brandSlug: string,
  year: number,
  storeKey: string | null
): string {
  const brand = brandSlug.toLowerCase();
  const segments = [configRoot, "pages", brand, String(year)];
  if (storeKey && pagesUseStoreSubdirForBrand(configRoot, brandSlug)) {
    segments.push(storeKey);
  }
  return path.join(...segments);
}

/**
 * True when the admin must let the user pick a store (multi-store brand).
 */
export function modelPagerAdminNeedsStorePicker(
  configRoot: string,
  brandSlug: string
): boolean {
  return listStoresForBrand(configRoot, brandSlug).length > 1;
}

/**
 * When pages use a store subdir, only accept a page JSON if its `storeKey` matches the scoped store.
 */
export function modelPagerPageMatchesStoreScope(
  configRoot: string,
  brandSlug: string,
  scopeStoreKey: string | null | undefined,
  pageStoreKey: string | null | undefined
): boolean {
  if (!pagesUseStoreSubdirForBrand(configRoot, brandSlug)) return true;
  const sk = scopeStoreKey?.trim();
  const pk = pageStoreKey?.trim();
  if (!sk) return true;
  if (!pk) return true;
  return pk.toLowerCase() === sk.toLowerCase();
}
