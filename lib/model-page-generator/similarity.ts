/**
 * N-gram extraction, Jaccard similarity, text normalization for uniqueness gating.
 */

import { STOPWORDS, GLOBAL_IGNORE_WORDS } from "./config";

/** Normalize string for comparison: smart quotes/dashes to ASCII, collapse whitespace, lowercase. */
export function normalizeTextForSimilarity(s: string): string {
  return (
    String(s ?? "")
      .replace(/\u201c/g, '"')
      .replace(/\u201d/g, '"')
      .replace(/\u2018/g, "'")
      .replace(/\u2019/g, "'")
      .replace(/\u2014/g, ", ")
      .replace(/\u2013/g, ", ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
  );
}

/** Tokenize into words (lowercase, strip punctuation). Optionally remove stopwords and ignore words. */
export function tokenize(
  text: string,
  options: { removeStopwords?: boolean; removeIgnoreWords?: boolean } = {}
): string[] {
  const normalized = normalizeTextForSimilarity(text);
  const words = normalized
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
  let out = words;
  if (options.removeStopwords !== false) {
    out = out.filter((w) => !STOPWORDS.has(w));
  }
  if (options.removeIgnoreWords !== false) {
    out = out.filter((w) => !GLOBAL_IGNORE_WORDS.has(w));
  }
  return out;
}

/** Build n-grams (contiguous word sequences of length n). */
export function extractNGrams(text: string, n: number): Set<string> {
  const tokens = tokenize(text);
  const set = new Set<string>();
  for (let i = 0; i <= tokens.length - n; i++) {
    set.add(tokens.slice(i, i + n).join(" "));
  }
  return set;
}

/** Jaccard similarity: |A ∩ B| / |A ∪ B|. */
export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const x of setA) {
    if (setB.has(x)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Compute 3-gram Jaccard similarity between candidate text and a corpus n-gram set. */
export function computeSimilarity(candidate: string, corpusNGrams: Set<string>): number {
  const candidateNGrams = extractNGrams(candidate, 3);
  return jaccardSimilarity(candidateNGrams, corpusNGrams);
}

/** Extract sentences (split on . ! ?). */
export function extractSentences(text: string): string[] {
  const normalized = normalizeTextForSimilarity(text);
  return normalized
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Normalize a single sentence for collision check (same as normalizeTextForSimilarity). */
export function normalizeSentence(s: string): string {
  return normalizeTextForSimilarity(s);
}
