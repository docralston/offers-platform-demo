/**
 * Subset-aware runner for model-page generation.
 * Loads store and model list from configRoot; optionally filters to modelSlugs; caps at maxPerRun (default 10).
 */

import * as fs from "fs";
import * as path from "path";
import type { StoreConfig, ModelSpec, ModelYearPage } from "./schema";
import type { GateResult } from "./uniqueness-gate";
import {
  generatePageContent,
  loadCorpora,
  type GenerationOptions,
  generateFaqsOnly,
  applyGeneratedFaqsToPage,
} from "./generator";
import {
  injectInternalLinks,
  applyLinkedSectionsToPage,
  withInternalLinkTargetSnapshot,
} from "./internal-links";
import { generatePage, normalizePunctuation } from "./index";
import { slugify } from "./slug";
import { getBrandTuning } from "./brand-tuning";
import { loadStore } from "./store-loader";
import { modelListFilenameCandidates } from "./model-list-paths";
import { sanitizeBmwModelPageSAVToSUV } from "./bmw-acronym-sanitizer";

export { loadStore } from "./store-loader";

function loadJson<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as T;
}

function loadModelList(configRoot: string, brand: string, year: number): ModelSpec[] {
  const pagesDir = path.join(configRoot, "pages");
  const yearDir = path.join(pagesDir, brand.toLowerCase(), String(year));
  const candidates = modelListFilenameCandidates(yearDir, brand, year);
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const data = loadJson<{ models: ModelSpec[] } | ModelSpec[]>(p);
      return Array.isArray(data) ? data : data.models;
    }
  }
  throw new Error(`No model list found; expected one of: ${candidates.join(", ")}`);
}

export interface RunOptions {
  brand: string;
  year: number;
  storeKey?: string | null;
  /** If provided, only generate for these model slugs (subset). Original indices from full list are preserved. */
  modelSlugs?: string[] | null;
  /** Max models to run in this batch (default 10). */
  maxPerRun?: number;
  /** Use LLM generation (true) or template-only (false). */
  useLlm?: boolean;
  /** Override max regeneration attempts per model. */
  maxAttempts?: number;
  /** Optional: perform internal-link injection pass after FAQs. */
  injectLinks?: boolean;
  /** Optional exact SEO title to forbid in generated output. */
  forbiddenSeoTitle?: string;
  /** Optional exact SEO description to forbid in generated output. */
  forbiddenSeoDescription?: string;
}

export interface RunResult {
  pages: ModelYearPage[];
  gateResults: GateResult[];
  attemptCounts: number[];
  totalElapsedMs: number;
  perPageElapsedMs: Array<{ slug: string; elapsedMs: number }>;
}

/**
 * Run generation for the given brand/year/store and optional model subset.
 * If modelSlugs is provided, only those models are generated; original indices from the full list are used for uniqueness/CTA ordering.
 * Caps at maxPerRun (default 10) models per call.
 */
export async function runGeneration(
  configRoot: string,
  options: RunOptions
): Promise<RunResult> {
  const runStartedAt = Date.now();
  const {
    brand,
    year,
    storeKey = null,
    modelSlugs = null,
    maxPerRun = 10,
    useLlm = true,
    maxAttempts,
    injectLinks = true,
    forbiddenSeoTitle,
    forbiddenSeoDescription,
  } = options;

  const brandSlug = brand.toLowerCase();
  const store = loadStore(configRoot, brandSlug, storeKey ?? null);
  const fullModelList = loadModelList(configRoot, brandSlug, year);

  let specsToRun: { spec: ModelSpec; modelIndex: number }[];
  if (modelSlugs && modelSlugs.length > 0) {
    const slugSet = new Set(modelSlugs.map((s) => s.toLowerCase().replace(/\.json$/, "")));
    specsToRun = fullModelList
      .map((spec, i) => ({ spec, modelIndex: i }))
      .filter(({ spec }) => slugSet.has(slugify(spec.displayName)));
    if (specsToRun.length > maxPerRun) {
      specsToRun = specsToRun.slice(0, maxPerRun);
    }
  } else {
    specsToRun = fullModelList
      .map((spec, i) => ({ spec, modelIndex: i }))
      .slice(0, maxPerRun);
  }

  const make =
    store.brand?.trim() ||
    (brandSlug.charAt(0).toUpperCase() + brandSlug.slice(1));

  const pagesDir = path.join(configRoot, "pages");
  const pages: ModelYearPage[] = [];
  const gateResults: GateResult[] = [];
  const attemptCounts: number[] = [];
  const perPageElapsedMs: Array<{ slug: string; elapsedMs: number }> = [];

  if (useLlm) {
    const corpora = loadCorpora(pagesDir);
    const acceptedBatchNGrams = new Set<string>();
    const usedSentences = new Set<string>();
    const usedSignaturePhrases = new Set<string>();
    const tuning = getBrandTuning(configRoot, brandSlug);
    const brandMaxAttempts = maxAttempts ?? tuning.maxRegenerationAttempts;

    const genOptions: GenerationOptions = {
      make,
      year,
      brandSlug,
      existingCorpora: corpora,
      acceptedBatchNGrams,
      usedSentences,
      usedSignaturePhrases,
      maxAttempts: brandMaxAttempts,
      configsDir: configRoot,
      forbiddenSeoTitle,
      forbiddenSeoDescription,
    };

    for (const { spec, modelIndex } of specsToRun) {
      const pageStartedAt = Date.now();
      const result = await generatePageContent(store, spec, modelIndex, genOptions);
      let normalized = normalizePunctuation(result.page) as ModelYearPage;
      try {
        const contentFaqs = await generateFaqsOnly(store, spec, {
          make,
          year,
          brandSlug,
          configsDir: configRoot,
        });
        const updated = applyGeneratedFaqsToPage(
          normalized,
          store,
          spec,
          contentFaqs
        );
        normalized = normalizePunctuation(updated) as ModelYearPage;
      } catch {
        // If FAQ generation fails for a page, keep whatever FAQs we have.
      }

      if (injectLinks) {
        try {
          const linked = await injectInternalLinks(normalized, store, spec, {
            brandSlug,
          });
          normalized = withInternalLinkTargetSnapshot(
            applyLinkedSectionsToPage(normalized, linked) as ModelYearPage,
            store,
            brandSlug
          );
        } catch (e) {
          console.error("injectInternalLinks failed:", e);
          // If link injection fails for a page, keep the original sections/FAQs.
        }
      }

      if (brandSlug === "bmw") {
        normalized = sanitizeBmwModelPageSAVToSUV(normalized);
      }

      normalized = normalizePunctuation(normalized) as ModelYearPage;

      pages.push(normalized);
      gateResults.push(result.gateResult);
      attemptCounts.push(result.attempts);
      perPageElapsedMs.push({
        slug: slugify(spec.displayName),
        elapsedMs: Date.now() - pageStartedAt,
      });
    }
  } else {
    const buildOptions = { make, year, brandSlug };
    for (const { spec, modelIndex } of specsToRun) {
      const pageStartedAt = Date.now();
      let page = generatePage(store, spec, modelIndex, buildOptions);
      if (injectLinks) {
        try {
          const linked = await injectInternalLinks(page, store, spec, {
            brandSlug,
          });
          page = withInternalLinkTargetSnapshot(
            applyLinkedSectionsToPage(page, linked) as ModelYearPage,
            store,
            brandSlug
          );
        } catch (e) {
          console.error("injectInternalLinks failed:", e);
          // If link injection fails for a page, keep the original sections/FAQs.
        }
      }

      if (brandSlug === "bmw") {
        page = sanitizeBmwModelPageSAVToSUV(page);
      }

      page = normalizePunctuation(page) as ModelYearPage;

      pages.push(page);
      gateResults.push({ passed: true, failures: [], scores: {} });
      attemptCounts.push(1);
      perPageElapsedMs.push({
        slug: slugify(spec.displayName),
        elapsedMs: Date.now() - pageStartedAt,
      });
    }
  }

  return {
    pages,
    gateResults,
    attemptCounts,
    totalElapsedMs: Date.now() - runStartedAt,
    perPageElapsedMs,
  };
}
