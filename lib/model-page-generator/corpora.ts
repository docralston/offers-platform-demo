/**
 * Build corpora from existing JSON configs for uniqueness comparison.
 * Extracts comparison blobs (seo, hero, whyBullets, trims, FAQs 1-3) and builds n-gram sets.
 */

import * as fs from "fs";
import * as path from "path";
import { extractNGrams } from "./similarity";
import type { ModelYearPage } from "./schema";

export interface Corpora {
  /** N-gram sets per brand (union of all stores). */
  byBrand: Map<string, Set<string>>;
  /**
   * Per brand, per storeKey n-gram sets. Used to penalize similarity to sibling stores
   * (same OEM, different dealer JSON scope). Keys are lower-case storeKey; missing key uses "_".
   */
  byBrandStore: Map<string, Map<string, Set<string>>>;
}

/** Build a single comparison blob string from a page (excludes 4th maintenance FAQ). */
export function getComparisonBlob(page: ModelYearPage): string {
  const parts: string[] = [
    page.seo?.title ?? "",
    page.seo?.metaDescription ?? "",
    page.heroSubhead ?? "",
    ...(Array.isArray(page.whyBullets) ? page.whyBullets : []),
    page.trims?.intro ?? "",
  ];
  if (page.trims?.sections) {
    for (const sec of page.trims.sections) {
      parts.push(sec.title ?? "");
      for (const item of sec.items ?? []) {
        parts.push(item.label ?? "", item.note ?? "");
      }
    }
  }
  if (Array.isArray(page.contentSections)) {
    for (const sec of page.contentSections) {
      parts.push(sec.title ?? "", sec.bodyHtml ?? "", sec.intent ?? "");
    }
  }
  if (page.localSeoSummary) {
    parts.push(page.localSeoSummary);
  }
  const faqs = page.faqs ?? [];
  for (let i = 0; i < Math.min(3, faqs.length); i++) {
    parts.push(faqs[i].q ?? "", faqs[i].a ?? "");
  }
  return parts.filter(Boolean).join(" ");
}

/** Build n-gram set (3-gram) from blob text. */
export function blobToNGramSet(blob: string): Set<string> {
  return extractNGrams(blob, 3);
}

/** Merge n-gram sets (union). */
function mergeNGramSets(sets: Set<string>[]): Set<string> {
  const out = new Set<string>();
  for (const s of sets) {
    for (const x of s) out.add(x);
  }
  return out;
}

/**
 * Load all page JSON files from a directory (recursive), excluding *-models-*.json.
 */
function loadPageJsonsFromDir(dir: string): ModelYearPage[] {
  const pages: ModelYearPage[] = [];
  if (!fs.existsSync(dir)) return pages;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      pages.push(...loadPageJsonsFromDir(full));
    } else if (
      ent.isFile() &&
      ent.name.toLowerCase().endsWith(".json") &&
      !/^[a-z]+-models-\d+\.json$/i.test(ent.name)
    ) {
      try {
        const raw = fs.readFileSync(full, "utf8");
        const data = JSON.parse(raw) as ModelYearPage;
        if (data && data.storeKey != null) pages.push(data);
      } catch {
        // skip invalid or non-page JSON
      }
    }
  }
  return pages;
}

function storeKeyForPage(page: ModelYearPage): string {
  const sk = page.storeKey;
  if (sk == null || String(sk).trim() === "") return "_";
  return String(sk).trim().toLowerCase();
}

/**
 * Build corpora from a configs/pages root (e.g. configs/pages).
 * Scans <brand>/<year>/ and <brand>/<year>/<store>/ for page JSONs.
 */
export function loadCorporaFromDirectory(pagesDir: string): Corpora {
  const byBrand = new Map<string, Set<string>>();
  const blobsByBrandStore = new Map<string, Map<string, string[]>>();

  if (!fs.existsSync(pagesDir)) {
    return {
      byBrand,
      byBrandStore: new Map(),
    };
  }

  const brands = fs
    .readdirSync(pagesDir, { withFileTypes: true })
    .filter((e: fs.Dirent) => e.isDirectory())
    .map((e: fs.Dirent) => e.name);

  for (const brand of brands) {
    const brandLower = brand.toLowerCase();
    const brandPath = path.join(pagesDir, brand);
    const yearDirs = fs
      .readdirSync(brandPath, { withFileTypes: true })
      .filter((e: fs.Dirent) => e.isDirectory())
      .map((e: fs.Dirent) => e.name);
    const allBlobs: string[] = [];
    for (const year of yearDirs) {
      const yearPath = path.join(brandPath, year);
      const pages = loadPageJsonsFromDir(yearPath);
      for (const page of pages) {
        const blob = getComparisonBlob(page);
        if (!blob) continue;
        allBlobs.push(blob);
        const sk = storeKeyForPage(page);
        let perStore = blobsByBrandStore.get(brandLower);
        if (!perStore) {
          perStore = new Map();
          blobsByBrandStore.set(brandLower, perStore);
        }
        const arr = perStore.get(sk) ?? [];
        arr.push(blob);
        perStore.set(sk, arr);
      }
    }
    if (allBlobs.length > 0) {
      byBrand.set(brandLower, mergeNGramSets(allBlobs.map(blobToNGramSet)));
    }
  }

  const byBrandStore = new Map<string, Map<string, Set<string>>>();
  for (const [b, perStore] of blobsByBrandStore) {
    const inner = new Map<string, Set<string>>();
    for (const [sk, blobs] of perStore) {
      inner.set(sk, mergeNGramSets(blobs.map(blobToNGramSet)));
    }
    byBrandStore.set(b, inner);
  }

  return {
    byBrand,
    byBrandStore,
  };
}

/**
 * Add a single page's n-grams to an existing corpus (mutates the set).
 * Used during batch generation to maintain intra-batch corpus.
 */
export function addPageToCorpusSet(page: ModelYearPage, corpusSet: Set<string>): void {
  const blob = getComparisonBlob(page);
  const ngrams = blobToNGramSet(blob);
  for (const ng of ngrams) corpusSet.add(ng);
}
