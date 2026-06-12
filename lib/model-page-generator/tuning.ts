/**
 * Threshold tuning: analyze similarity distribution and recommend thresholds.
 */

import type { ModelYearPage } from "./schema";
import type { Corpora } from "./corpora";
import type { Thresholds } from "./config";
import { getComparisonBlob, blobToNGramSet } from "./corpora";
import { jaccardSimilarity } from "./similarity";

export interface HistogramBucket {
  min: number;
  max: number;
  count: number;
}

/**
 * Build a simple histogram of pairwise 3-gram Jaccard similarities within the page set.
 * Buckets: 0-0.05, 0.05-0.10, 0.10-0.15, 0.15-0.20, 0.20+
 */
export function analyzeSimilarityDistribution(pages: ModelYearPage[]): HistogramBucket[] {
  const buckets = [
    { min: 0, max: 0.05, count: 0 },
    { min: 0.05, max: 0.1, count: 0 },
    { min: 0.1, max: 0.15, count: 0 },
    { min: 0.15, max: 0.2, count: 0 },
    { min: 0.2, max: 1, count: 0 },
  ];
  const sets = pages.map((p) => blobToNGramSet(getComparisonBlob(p)));
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      const sim = jaccardSimilarity(sets[i], sets[j]);
      const b = buckets.find((x) => sim >= x.min && sim < x.max) ?? buckets[buckets.length - 1];
      b.count++;
    }
  }
  return buckets;
}

/**
 * Recommend thresholds based on histogram: set intra slightly above the bulk of the distribution.
 */
export function recommendThresholds(distribution: HistogramBucket[]): Partial<Thresholds> {
  const total = distribution.reduce((s, b) => s + b.count, 0);
  if (total === 0) return { intraBatch: 0.11, crossBrand: 0.08, siblingStore: 0.1 };
  let cum = 0;
  let p90Bucket = distribution[0];
  for (const b of distribution) {
    cum += b.count;
    if (cum / total >= 0.9) {
      p90Bucket = b;
      break;
    }
  }
  const suggestedIntra = Math.min(0.15, p90Bucket.max + 0.02);
  return {
    intraBatch: Math.round(suggestedIntra * 100) / 100,
    crossBrand: 0.08,
    siblingStore: 0.1,
  };
}

/**
 * Find optimal thresholds by comparing a set of pages against a corpus.
 */
export function findOptimalThresholds(
  corpus: Corpora,
  samplePages: ModelYearPage[],
  brand: string
): Partial<Thresholds> {
  const brandSet = corpus.byBrand.get(brand.toLowerCase());
  if (!brandSet || brandSet.size === 0) return { intraBatch: 0.11, crossBrand: 0.08, siblingStore: 0.1 };
  const scores: number[] = [];
  for (const page of samplePages) {
    const blob = getComparisonBlob(page);
    const ng = blobToNGramSet(blob);
    scores.push(jaccardSimilarity(ng, brandSet));
  }
  const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
  return {
    intraBatch: Math.min(0.15, maxScore + 0.03),
    crossBrand: 0.08,
    siblingStore: 0.1,
  };
}
