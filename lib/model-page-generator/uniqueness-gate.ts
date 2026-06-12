/**
 * Uniqueness gate: blacklist, n-gram similarity, sentence collision, signature phrase.
 */

import type { ModelYearPage } from "./schema";
import type { Corpora } from "./corpora";
import type { Thresholds } from "./config";
import { DEFAULT_THRESHOLDS } from "./config";
import { checkPageBlacklist } from "./blacklist";
import { getComparisonBlob, blobToNGramSet } from "./corpora";
import { computeSimilarity, jaccardSimilarity, extractSentences, normalizeSentence } from "./similarity";

function mergeNGramSetsUnion(sets: Set<string>[]): Set<string> {
  const out = new Set<string>();
  for (const s of sets) {
    for (const x of s) out.add(x);
  }
  return out;
}

export interface GateResult {
  passed: boolean;
  failures: string[];
  scores: Record<string, number>;
}

export interface UniquenessGateOptions {
  /** N-grams from pages already accepted in this batch. */
  acceptedBatchNGrams?: Set<string>;
  /** Normalized sentences already used in this batch. */
  usedSentences?: Set<string>;
  /** Brand slug (toyota, lexus, bmw). */
  brand: string;
  /** Store key (e.g. lexdt, lexwg) for sibling-store corpus comparison. */
  storeKey?: string;
  /** At least one of these phrases must appear in hero/trims intro. */
  requiredSignaturePhrases?: string[];
  /** Override default thresholds. */
  thresholds?: Partial<Thresholds>;
}

/**
 * Run full uniqueness gate on a candidate page.
 * Returns GateResult with passed, failures, and similarity scores.
 */
export function checkUniqueness(
  candidate: ModelYearPage,
  corpora: Corpora,
  options: UniquenessGateOptions
): GateResult {
  const failures: string[] = [];
  const scores: Record<string, number> = {};
  const thresholds: Thresholds = {
    ...DEFAULT_THRESHOLDS,
    ...options.thresholds,
    siblingStore:
      options.thresholds?.siblingStore ??
      options.thresholds?.lexusStore ??
      DEFAULT_THRESHOLDS.siblingStore,
  };
  const brand = options.brand?.toLowerCase() ?? "";

  // 1. Blacklist
  const blacklistResults = checkPageBlacklist(candidate, brand);
  if (blacklistResults.length > 0) {
    for (const { path, violations } of blacklistResults) {
      failures.push(`Blacklist (${path}): ${violations.join(", ")}`);
    }
  }

  const blob = getComparisonBlob(candidate);
  const candidateNGrams = blobToNGramSet(blob);

  // 2. Intra-batch similarity
  if (options.acceptedBatchNGrams && options.acceptedBatchNGrams.size > 0) {
    const intraScore = jaccardSimilarity(candidateNGrams, options.acceptedBatchNGrams);
    scores.intraBatch = intraScore;
    if (intraScore > thresholds.intraBatch) {
      failures.push(`Intra-batch similarity ${(intraScore * 100).toFixed(2)}% > ${thresholds.intraBatch * 100}%`);
    }
  }

  // 3. Cross-brand similarity
  for (const [otherBrand, otherSet] of corpora.byBrand) {
    if (otherBrand === brand) continue;
    if (otherSet.size === 0) continue;
    const crossScore = computeSimilarity(blob, otherSet);
    scores[`crossBrand_${otherBrand}`] = crossScore;
    if (crossScore > thresholds.crossBrand) {
      failures.push(`Cross-brand (${otherBrand}) similarity ${(crossScore * 100).toFixed(2)}% > ${thresholds.crossBrand * 100}%`);
    }
  }

  // 4. Same-brand corpus (historical)
  const sameBrandSet = corpora.byBrand.get(brand);
  if (sameBrandSet && sameBrandSet.size > 0) {
    const intraCorpusScore = computeSimilarity(blob, sameBrandSet);
    scores.sameBrandCorpus = intraCorpusScore;
    if (intraCorpusScore > thresholds.intraBatch) {
      failures.push(`Same-brand corpus similarity ${(intraCorpusScore * 100).toFixed(2)}% > ${thresholds.intraBatch * 100}%`);
    }
  }

  // 5. Sibling stores (same brand, different storeKey), e.g. Lexus lexdt vs lexwg
  const perStore = corpora.byBrandStore.get(brand);
  const scopeKey = options.storeKey?.trim().toLowerCase();
  if (scopeKey && perStore && perStore.size > 1) {
    const otherNgrams: Set<string>[] = [];
    for (const [sk, set] of perStore) {
      if (sk === scopeKey) continue;
      if (set.size > 0) otherNgrams.push(set);
    }
    if (otherNgrams.length > 0) {
      const mergedOther = mergeNGramSetsUnion(otherNgrams);
      const siblingScore = computeSimilarity(blob, mergedOther);
      scores.siblingOtherStore = siblingScore;
      if (siblingScore > thresholds.siblingStore) {
        failures.push(
          `Sibling-store similarity ${(siblingScore * 100).toFixed(2)}% > ${thresholds.siblingStore * 100}%`
        );
      }
    }
  }

  // 6. Sentence collision
  if (options.usedSentences && options.usedSentences.size > 0) {
    const sentenceSources = [
      candidate.seo?.metaDescription ?? "",
      candidate.heroSubhead ?? "",
      candidate.trims?.intro ?? "",
      candidate.localSeoSummary ?? "",
      ...(candidate.contentSections ?? []).flatMap((sec) => [
        sec.title ?? "",
        sec.bodyHtml ?? "",
      ]),
      ...(candidate.faqs ?? []).slice(0, 3).flatMap((f) => [f.q ?? "", f.a ?? ""]),
    ].join(" ");
    const sentences = extractSentences(sentenceSources);
    const collisions = sentences.filter((s) => options.usedSentences!.has(normalizeSentence(s)));
    if (collisions.length > 0) {
      failures.push(`Sentence collision: ${collisions.length} duplicate sentence(s)`);
    }
  }

  // 7. Signature phrase
  if (options.requiredSignaturePhrases && options.requiredSignaturePhrases.length > 0) {
    const searchText = [
      candidate.heroSubhead ?? "",
      candidate.trims?.intro ?? "",
    ].join(" ").toLowerCase();
    const hasPhrase = options.requiredSignaturePhrases.some((p) =>
      searchText.includes(p.toLowerCase())
    );
    if (!hasPhrase) {
      failures.push("Missing required model signature phrase in hero/trims intro");
    }
  }

  return {
    passed: failures.length === 0,
    failures,
    scores,
  };
}
