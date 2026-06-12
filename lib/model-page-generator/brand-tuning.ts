/**
 * LLM output limits and retry counts per brand. Data: lab/modelpager/configs/brand-tuning.json
 * (or MODELPAGER_CONFIGS/brand-tuning.json when configsDir is set).
 */

import * as fs from "fs";
import * as path from "path";
import { MAX_REGENERATION_ATTEMPTS } from "./config";

export interface BrandTuningValues {
  maxTokensPage: number;
  maxTokensFaqs: number;
  maxTokensLocal: number;
  maxRegenerationAttempts: number;
  /** Lowercase town names to drop from `seo.serviceArea` when picking nearby towns for prompts. */
  nearbyTownsExcludeLowercase: string[];
}

const HARDCODED_FALLBACK: BrandTuningValues = {
  maxTokensPage: 3200,
  maxTokensFaqs: 1600,
  maxTokensLocal: 2200,
  maxRegenerationAttempts: MAX_REGENERATION_ATTEMPTS,
  nearbyTownsExcludeLowercase: [],
};

interface FileShape {
  defaults?: Partial<BrandTuningValues>;
  perBrand?: Record<string, Partial<BrandTuningValues>>;
}

function readTuningFile(configsDir: string | undefined): FileShape | null {
  if (!configsDir) return null;
  const p = path.join(configsDir, "brand-tuning.json");
  if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return null;
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw) as FileShape;
  } catch {
    return null;
  }
}

function merge(
  base: BrandTuningValues,
  patch: Partial<BrandTuningValues> | undefined
): BrandTuningValues {
  if (!patch) return base;
  return {
    maxTokensPage: patch.maxTokensPage ?? base.maxTokensPage,
    maxTokensFaqs: patch.maxTokensFaqs ?? base.maxTokensFaqs,
    maxTokensLocal: patch.maxTokensLocal ?? base.maxTokensLocal,
    maxRegenerationAttempts:
      patch.maxRegenerationAttempts ?? base.maxRegenerationAttempts,
    nearbyTownsExcludeLowercase:
      patch.nearbyTownsExcludeLowercase !== undefined
        ? patch.nearbyTownsExcludeLowercase
        : base.nearbyTownsExcludeLowercase,
  };
}

/**
 * Resolved tuning for a brand slug. Merges: hardcoded fallback → file defaults → file perBrand.
 */
export function getBrandTuning(
  configsDir: string | undefined,
  brandSlug: string
): BrandTuningValues {
  const file = readTuningFile(configsDir);
  const brand = brandSlug.toLowerCase();
  let v = { ...HARDCODED_FALLBACK };
  if (file?.defaults) {
    v = merge(v, file.defaults);
  }
  const per = file?.perBrand?.[brand];
  if (per) {
    v = merge(v, per);
  }
  return v;
}
