/**
 * Thresholds, stopwords, and global ignore words for uniqueness gating.
 */

export const INTRA_BATCH_THRESHOLD = 0.11;
export const CROSS_BRAND_THRESHOLD = 0.08;
export const SIBLING_STORE_THRESHOLD = 0.1;
/** @deprecated Use {@link SIBLING_STORE_THRESHOLD} */
export const LEXUS_STORE_THRESHOLD = SIBLING_STORE_THRESHOLD;
/**
 * Maximum number of uniqueness-gated regeneration attempts per page.
 * Keep this small so a failing run does not spam OpenAI with errors or excess OpenAI cost.
 */
export const MAX_REGENERATION_ATTEMPTS = 2;

export const DEFAULT_THRESHOLDS = {
  intraBatch: INTRA_BATCH_THRESHOLD,
  crossBrand: CROSS_BRAND_THRESHOLD,
  siblingStore: SIBLING_STORE_THRESHOLD,
} as const;

export type Thresholds = {
  intraBatch: number;
  crossBrand: number;
  siblingStore: number;
  /** @deprecated Use siblingStore */
  lexusStore?: number;
};

/** Common English stopwords for similarity normalization. */
export const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "he",
  "in", "is", "it", "its", "of", "on", "that", "the", "to", "was", "were",
  "will", "with", "this", "but", "they", "have", "had", "what", "when", "where",
  "who", "which", "why", "how", "all", "each", "every", "both", "few", "more",
  "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same",
  "so", "than", "too", "very", "just", "can", "should", "now", "or", "if", "then",
]);

/** Words to strip from comparison to avoid inflating similarity (brands, localities, etc.). */
export const GLOBAL_IGNORE_WORDS = new Set([
  "toyota", "lexus", "bmw", "Demotown", "willow", "grove", "bucks", "county",
  "montgomery", "Demo", "dealer", "dealership", "2026", "pa", "philadelphia",
]);
