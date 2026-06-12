/**
 * Data-driven layout rules under configs (e.g. optional store segment in pages/).
 * Data: lab/modelpager/configs/brand-paths.json (or MODELPAGER_CONFIGS/brand-paths.json).
 */

import * as fs from "fs";
import * as path from "path";

interface BrandPathsFile {
  defaults?: { pagesUseStoreSubdir?: boolean };
  perBrand?: Record<string, { pagesUseStoreSubdir?: boolean }>;
}

function readBrandPathsFile(configsDir: string): BrandPathsFile | null {
  const p = path.join(configsDir, "brand-paths.json");
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as BrandPathsFile;
  } catch {
    return null;
  }
}

/**
 * When true, model-year JSONs live under pages/<brand>/<year>/<storeKey>/.
 */
export function pagesUseStoreSubdirForBrand(
  configsDir: string,
  brandSlug: string
): boolean {
  const file = readBrandPathsFile(configsDir);
  const brand = brandSlug.toLowerCase();
  const per = file?.perBrand?.[brand];
  if (per?.pagesUseStoreSubdir !== undefined) {
    return Boolean(per.pagesUseStoreSubdir);
  }
  return Boolean(file?.defaults?.pagesUseStoreSubdir);
}
