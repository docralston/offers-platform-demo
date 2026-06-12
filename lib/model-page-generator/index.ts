/**
 * Public API: generate one page or all pages; normalize punctuation on output.
 */

import { normalizePunctuation } from "./punctuation";
import { buildPage, type ModelSpec, type StoreConfig, type ModelYearPage, type BuildPageOptions } from "./schema";

export { slugify } from "./slug";
export { normalizePunctuation, findForbiddenPunctuationPaths, FORBIDDEN_PUNCTUATION } from "./punctuation";
export { getToyotaCareFaq, TOYOTACARE_QUESTION } from "./toyotacare";
export {
  getWarrantyFaq,
  WARRANTY_QUESTIONS,
  normalizeBrandWarranty,
  type BrandWarranty,
  type WarrantyFaq,
} from "./warranty-faqs";
export { validatePage, validatePageFilename, type ValidationError, type ValidatePageOptions } from "./validate";
export type { ModelSpec, ModelSpecs, StoreConfig, ModelYearPage, BuildPageOptions } from "./schema";

/**
 * Generate one model-year page object. Applies punctuation normalization to the result.
 */
export function generatePage(
  store: StoreConfig,
  spec: ModelSpec,
  modelIndex: number,
  options: BuildPageOptions
): ModelYearPage {
  const page = buildPage(store, spec, modelIndex, options);
  return normalizePunctuation(page) as ModelYearPage;
}

/**
 * Generate page objects for all models. Deterministic per modelIndex.
 */
export function generateAll(
  store: StoreConfig,
  modelList: ModelSpec[],
  options: BuildPageOptions
): ModelYearPage[] {
  return modelList.map((spec, i) =>
    generatePage(store, spec, i, options)
  );
}
