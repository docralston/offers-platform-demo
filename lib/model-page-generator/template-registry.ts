/**
 * HTML templates for model-year and brand-lineup rendering (admin preview, CLI).
 */

import * as path from "path";

const MODEL_YEAR_BY_BRAND: Record<string, string> = {
  lexus: "model-year-lexus.html",
  bmw: "model-year-bmw.html",
  toyota: "model-year-toyota.html",
};

const LINEUP_BY_BRAND: Record<string, string> = {
  lexus: "brand-lineup-lexus.html",
  bmw: "brand-lineup-bmw.html",
  toyota: "brand-lineup-toyota.html",
};

const FALLBACK_MODEL_YEAR = "model-year-toyota.html";
const FALLBACK_LINEUP = "brand-lineup-toyota.html";

export function getModelYearTemplateFilename(brandSlug: string): string {
  return MODEL_YEAR_BY_BRAND[brandSlug.toLowerCase()] ?? FALLBACK_MODEL_YEAR;
}

export function getBrandLineupTemplateFilename(brandSlug: string): string {
  return LINEUP_BY_BRAND[brandSlug.toLowerCase()] ?? FALLBACK_LINEUP;
}

export function getModelPagerTemplatesDir(): string {
  return path.join(process.cwd(), "lab", "modelpager", "templates");
}

export function resolveModelYearTemplatePath(brandSlug: string): string {
  return path.join(
    getModelPagerTemplatesDir(),
    getModelYearTemplateFilename(brandSlug)
  );
}

export function resolveBrandLineupTemplatePath(brandSlug: string): string {
  return path.join(
    getModelPagerTemplatesDir(),
    getBrandLineupTemplateFilename(brandSlug)
  );
}
