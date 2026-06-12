/**
 * Main LLM generation loop with uniqueness gating and regeneration.
 */

import * as fs from "fs";
import * as path from "path";
import { isDemoMode } from "@/lib/config/demo";
import { demoModelPageImagePath } from "@/lib/demo/model-page-assets";
import type { StoreConfig, ModelSpec, ModelYearPage } from "./schema";
import type { Corpora } from "./corpora";
import { slugify } from "./slug";
import { getWarrantyFaq, normalizeBrandWarranty, type BrandWarranty } from "./warranty-faqs";
import { loadCorporaFromDirectory, addPageToCorpusSet } from "./corpora";
import { checkUniqueness, type GateResult } from "./uniqueness-gate";
import type { Thresholds } from "./config";
import { extractSentences, normalizeSentence } from "./similarity";
import { generateContent, extractJsonFromResponse } from "./llm-client";
import {
  buildGenerationPrompt,
  buildWhyBulletsOnlyPrompt,
  buildFaqsOnlyPrompt,
  buildLocalSectionsPrompt,
} from "./prompts";
import { getApprovedExcerpts, getBrandPromptDoc } from "./approved-examples";
import { loadSearchQueriesForModel } from "./search-queries";
import { parseLlmJson, tryParseLlmJson } from "./parse-llm-json";
import { getSpecsBlock } from "./specs";
import { selectSignaturePhrase, getSignaturePhrases } from "./model-signatures";
import { getBrandTuning } from "./brand-tuning";
import { clampTitle, clampDescription } from "./meta";
import { normalizePunctuation } from "./punctuation";
import { buildInventoryUrl } from "@/lib/utils/inventory-url";
import { prisma } from "@/lib/prisma";

export interface GenerationOptions {
  make: string;
  year: number;
  brandSlug: string;
  /** Corpora from existing pages (for cross-brand / same-brand comparison). */
  existingCorpora: Corpora;
  /** N-grams from pages already accepted in this batch (mutate as we accept). */
  acceptedBatchNGrams: Set<string>;
  /** Normalized sentences already used in this batch (mutate as we accept). */
  usedSentences: Set<string>;
  /** Used signature phrases this batch (to avoid repetition). */
  usedSignaturePhrases: Set<string>;
  /** Optional: pages directory to (re)load corpora from. */
  pagesDir?: string;
  /** Optional: max regeneration attempts override. */
  maxAttempts?: number;
  /** Optional: override default uniqueness thresholds. */
  thresholds?: Partial<Thresholds>;
  /** Optional: configs root (e.g. configs dir) for loading approved-examples and specs. */
  configsDir?: string;
  /** Optional exact SEO title string to avoid in a one-off regeneration. */
  forbiddenSeoTitle?: string;
  /** Optional exact SEO description string to avoid in a one-off regeneration. */
  forbiddenSeoDescription?: string;
}

/** Towns to avoid in "Why the X fits Y" and in local references for Toyota. */
function getNearbyTowns(
  store: StoreConfig,
  modelIndex: number,
  count: number = 5,
  excludeLowercase: string[] = []
): string[] {
  const area = store.seo?.serviceArea ?? [];
  const exclude = (store.location?.city ?? "").trim().toLowerCase();
  let towns = area.filter((t) => String(t).trim().toLowerCase() !== exclude);
  if (excludeLowercase.length > 0 && towns.length > 0) {
    const drop = new Set(excludeLowercase.map((t) => t.trim().toLowerCase()));
    towns = towns.filter((t) => !drop.has(String(t).trim().toLowerCase()));
  }
  if (towns.length === 0) return [];
  const n = Math.min(count, Math.max(3, towns.length));
  const start = modelIndex % towns.length;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(towns[(start + i) % towns.length]);
  }
  return out;
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = path.replace(/^\/+/, "/");
  return b + p;
}

type ContentSection = NonNullable<ModelYearPage["contentSections"]>[number];

function pickString(
  obj: Record<string, unknown> | undefined,
  keys: string[]
): string {
  if (!obj) return "";
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function extractSeoFieldFromRaw(raw: string, key: "title" | "description"): string {
  const cleaned = String(raw ?? "")
    .replace(/^```(?:json|text)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  if (!cleaned) return "";
  const patterns =
    key === "title"
      ? [
          /"title"\s*:\s*"([^"]+)"/i,
          /'title'\s*:\s*'([^']+)'/i,
          /\btitle\s*:\s*(.+)/i,
        ]
      : [
          /"metaDescription"\s*:\s*"([^"]+)"/i,
          /"description"\s*:\s*"([^"]+)"/i,
          /'metaDescription'\s*:\s*'([^']+)'/i,
          /'description'\s*:\s*'([^']+)'/i,
          /\bmetaDescription\s*:\s*(.+)/i,
          /\bdescription\s*:\s*(.+)/i,
        ];
  for (const re of patterns) {
    const m = cleaned.match(re);
    if (m?.[1]) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return "";
}

/** Parse LLM JSON into content parts; validate and coerce to schema shape. */
function parseLLMContent(
  raw: string,
  store: StoreConfig,
  spec: ModelSpec,
  options: { make: string; year: number }
): Partial<ModelYearPage> {
  const json = extractJsonFromResponse(raw);
  // Debug: write raw and extracted JSON for inspection.
  try {
    const debugDir = path.join(
      process.cwd(),
      "artifacts",
      "modelpager-debug"
    );
    fs.mkdirSync(debugDir, { recursive: true });
    const baseName = `${options.year}-${options.make}-${slugify(
      spec.displayName
    )}`;
    fs.writeFileSync(
      path.join(debugDir, `${baseName}-raw.txt`),
      raw,
      "utf8"
    );
    fs.writeFileSync(
      path.join(debugDir, `${baseName}-json.txt`),
      json,
      "utf8"
    );
  } catch {
    // Ignore debug write failures
  }
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(json) as Record<string, unknown>;
  } catch {
    // Best-effort salvage: try to recover a valid prefix of the JSON up to
    // the last complete closing brace/bracket. This helps when the model
    // response is truncated mid-field (e.g. inside bodyHtml) but earlier
    // fields like seo, hero, trims, and FAQs are intact.
    let salvaged: Record<string, unknown> | null = null;
    for (let i = json.length - 1; i >= 0 && i >= json.length - 4000; i--) {
      const ch = json[i];
      if (ch === "}" || ch === "]") {
        const candidate = json.slice(0, i + 1).trim();
        try {
          salvaged = JSON.parse(candidate) as Record<string, unknown>;
          break;
        } catch {
          // keep trying with a shorter prefix
        }
      }
    }
    if (salvaged) {
      data = salvaged;
    } else {
      try {
        data = parseLlmJson<Record<string, unknown>>(json);
      } catch {
        // Treat fully unparseable JSON as a generation failure so callers can retry.
        // Returning empty content can silently degrade output quality.
        console.warn(
          "[parseLLMContent] Failed to parse LLM JSON; triggering retry."
        );
        throw new Error("Failed to parse LLM JSON response");
      }
    }
  }
  const seo = data.seo as Record<string, unknown> | undefined;
  let title =
    pickString(seo, ["title", "seoTitle", "metaTitle"]) ||
    pickString(data, ["title", "seoTitle", "metaTitle"]);
  let metaDescription =
    pickString(seo, ["metaDescription", "description", "seoDescription", "desc"]) ||
    pickString(data, ["metaDescription", "description", "seoDescription", "desc"]);
  // Looser SEO-only recovery so full generation is less brittle while other
  // structured fields (hero/trims/sections) still require valid parsed JSON.
  if (!title) {
    title = extractSeoFieldFromRaw(raw, "title");
  }
  if (!metaDescription) {
    metaDescription = extractSeoFieldFromRaw(raw, "description");
  }
  const heroSubhead = typeof data.heroSubhead === "string" ? data.heroSubhead : "";
  const whyBulletsRaw = data.whyBullets;
  const whyBulletsList = Array.isArray(whyBulletsRaw) ? whyBulletsRaw : [];
  const whyBulletsArr = whyBulletsList
    .filter((b: unknown): b is string => typeof b === "string")
    .slice(0, 3);
  while (whyBulletsArr.length < 3) {
    whyBulletsArr.push("");
  }
  const trims = data.trims as { intro?: string; sections?: Array<{ title?: string; items?: Array<{ label?: string; note?: string }> }> } | undefined;
  const intro = typeof trims?.intro === "string" ? trims.intro : "";
  const sections = Array.isArray(trims?.sections) ? trims.sections.slice(0, 2) : [];
  // FAQs are generated in a separate FAQ-only pass to avoid token waste and
  // because link injection needs the final FAQ HTML.
  const faqs: Array<{ q: string; a: string }> = [];

  const trimsObj = {
    intro,
    sections: sections.map((s) => ({
      title: typeof s.title === "string" ? s.title : "",
      items: Array.isArray(s.items) ? s.items.map((i) => ({ label: String(i?.label ?? ""), note: String(i?.note ?? "") })) : [],
    })),
  };
  // Apply punctuation rules (no em/en dash, no smart quotes) so Trims always comply.
  const trimsNormalized = normalizePunctuation(trimsObj) as typeof trimsObj;

  // Optional long-form local content sections.
  const rawSections = (data as Record<string, unknown>).contentSections;
  const contentSections =
    Array.isArray(rawSections)
      ? rawSections
          .map((s, idx): ContentSection | null => {
            if (!s || typeof s !== "object") return null;
            const section = s as {
              id?: unknown;
              title?: unknown;
              intent?: unknown;
              bodyHtml?: unknown;
            };
            const title =
              typeof section.title === "string" ? section.title.trim() : "";
            const bodyHtml =
              typeof section.bodyHtml === "string"
                ? section.bodyHtml.trim()
                : "";
            if (!title || !bodyHtml) return null;
            const intent =
              typeof section.intent === "string"
                ? section.intent.trim()
                : undefined;
            let id =
              typeof section.id === "string" ? section.id.trim() : "";
            if (!id) {
              // Derive a stable-ish id from model, year, title, and index.
              id = slugify(
                `${options.year}-${options.make}-${spec.displayName}-${title}-${idx}`
              );
            }
            const sectionObj: ContentSection = {
              id,
              title,
              bodyHtml,
            };
            if (intent) {
              sectionObj.intent = intent;
            }
            return sectionObj;
          })
          .filter((s): s is ContentSection => s !== null)
          .slice(0, 3)
      : undefined;

  const localSeoSummaryRaw = (data as Record<string, unknown>).localSeoSummary;
  const localSeoSummary =
    typeof localSeoSummaryRaw === "string"
      ? localSeoSummaryRaw.trim()
      : undefined;

  return {
    seo: { title, metaDescription },
    heroSubhead,
    whyBullets: whyBulletsArr as [string, string, string],
    trims: trimsNormalized,
    faqs,
    contentSections,
    localSeoSummary,
  };
}

export interface GeneratePageResult {
  page: ModelYearPage;
  gateResult: GateResult;
  attempts: number;
}

/**
 * Generate one model-year page via LLM with uniqueness gating and regeneration.
 */
export async function generatePageContent(
  store: StoreConfig,
  spec: ModelSpec,
  modelIndex: number,
  options: GenerationOptions
): Promise<GeneratePageResult> {
  const slug = slugify(spec.displayName);
  const city = store.location?.city ?? "Demotown";
  const state = store.location?.state ?? "PA";
  const siteUrl = store.siteUrl ?? "";
  const citySlug = city.toLowerCase().replace(/\s+/g, "-");
  const pagePath = `/new-${options.brandSlug}/${options.year}-${options.brandSlug}-${slug}-${citySlug}-${state.toLowerCase()}.htm`;
  const canonicalUrl = joinUrl(siteUrl, pagePath);
  const assetSlug = slug;
  const heroPath = isDemoMode()
    ? demoModelPageImagePath(options.brandSlug, options.year, assetSlug, "hero")
    : `/assets/${options.brandSlug}/${options.year}/${assetSlug}/${options.year}-${options.brandSlug}-${assetSlug}-hero.webp`;
  const jellyPath = isDemoMode()
    ? demoModelPageImagePath(options.brandSlug, options.year, assetSlug, "jellybean")
    : `/assets/${options.brandSlug}/${options.year}/${assetSlug}/${options.year}-${options.brandSlug}-${assetSlug}-jellybean.webp`;
  const inventoryBase = store.links?.newInventory?.replace(/\/+$/, "") ?? "/new-inventory/index.htm";
  const inventoryHref = buildInventoryUrl({
    baseUrl: inventoryBase,
    format: "dealer_com",
    models: [spec.inventoryModelOverride ?? spec.displayName],
  });
  const county = store.location?.county ?? "Demo County";
  const make = options.make;
  const tags = [make, spec.displayName, `${options.year} ${make} ${spec.displayName}`, spec.category, `${city} PA`, county];

  const tuning = getBrandTuning(options.configsDir, options.brandSlug);
  const maxAttempts = options.maxAttempts ?? tuning.maxRegenerationAttempts;
  let bestCandidate: ModelYearPage | null = null;
  let bestGateResult: GateResult | null = null;
  let bestFailuresLength = Infinity;
  let towns = getNearbyTowns(
    store,
    modelIndex,
    5,
    tuning.nearbyTownsExcludeLowercase
  );
  let signaturePhrase = selectSignaturePhrase(spec.category, modelIndex, options.usedSignaturePhrases);

  const currentSlug = slugify(spec.displayName);
  const approvedExcerpts =
    options.configsDir != null
      ? getApprovedExcerpts(options.configsDir, options.brandSlug, modelIndex, currentSlug)
      : [];
  const searchQueries =
    options.configsDir != null
      ? loadSearchQueriesForModel(options.configsDir, options.brandSlug, options.year, currentSlug)
      : [];
  if (options.configsDir && searchQueries.length === 0) {
    console.warn(
      `[generatePageContent] No search-queries file for ${spec.displayName} (${options.brandSlug}/${options.year}, slug ${currentSlug}); using generic FAQ/content themes.`
    );
  }
  const brandPromptExcerpt =
    options.configsDir != null
      ? getBrandPromptDoc(options.configsDir, options.brandSlug) ?? undefined
      : undefined;
  const specsBlock = getSpecsBlock(spec, {
    year: options.year,
    brandSlug: options.brandSlug,
    configsDir: options.configsDir,
  });
  let finalGenerationError: Error | null = null;

  /** Two-step generation: skeleton (ANTHROPIC_MODEL) then local blocks (ANTHROPIC_MODEL_LOCAL). Set MODEL_PAGE_MONOLITH_LOCAL=1 to restore a single combined LLM call. */
  const splitLocalPass = process.env.MODEL_PAGE_MONOLITH_LOCAL !== "1";
  const skeletonMaxTokens = Math.min(tuning.maxTokensPage, 2600);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const promptOptions = {
      make: options.make,
      year: options.year,
      brandSlug: options.brandSlug,
      configsDir: options.configsDir,
      attemptNumber: attempt,
      rejectionReason: undefined as string | undefined,
      forbiddenSentences: undefined as string[] | undefined,
      requiredSignaturePhrase: signaturePhrase,
      localTowns: towns,
      approvedExcerpts: approvedExcerpts.length > 0 ? approvedExcerpts : undefined,
      specsBlock,
      brandPromptExcerpt,
      searchQueries: searchQueries.length > 0 ? searchQueries : undefined,
      forbiddenSeoTitle: options.forbiddenSeoTitle,
      forbiddenSeoDescription: options.forbiddenSeoDescription,
      skeletonPhase: splitLocalPass,
    };
    if (attempt > 1) {
      promptOptions.rejectionReason = `Similarity or sentence collision. Use different structure and phrasing.`;
      const sentenceSources = bestCandidate
        ? [
            bestCandidate.seo?.metaDescription ?? "",
            bestCandidate.heroSubhead ?? "",
            bestCandidate.trims?.intro ?? "",
            bestCandidate.localSeoSummary ?? "",
            ...(bestCandidate.contentSections ?? []).flatMap((sec) => [
              sec.title ?? "",
              sec.bodyHtml ?? "",
            ]),
            ...(bestCandidate.faqs ?? [])
              .slice(0, 3)
              .flatMap((f) => [f.q ?? "", f.a ?? ""]),
          ].join(" ")
        : "";
      promptOptions.forbiddenSentences = extractSentences(sentenceSources).map(normalizeSentence);
      towns = getNearbyTowns(
        store,
        modelIndex + attempt * 7,
        5,
        tuning.nearbyTownsExcludeLowercase
      );
      const phrases = getSignaturePhrases(spec.category);
      signaturePhrase = phrases[(modelIndex + attempt) % phrases.length];
    }

    const prompt = buildGenerationPrompt(store, spec, promptOptions);
    let content: Partial<ModelYearPage>;
    try {
      const response = await generateContent(prompt, {
        responseFormat: "json_object",
        temperature: 0.7,
        maxTokens: splitLocalPass ? skeletonMaxTokens : tuning.maxTokensPage,
        suppressErrorLog: true,
        contentType: splitLocalPass ? "skeleton" : undefined,
        tags: {
          feature: splitLocalPass ? "model-page-generator-skeleton" : "model-page-generator",
          brandSlug: options.brandSlug,
          make: options.make,
          year: options.year,
          model: spec.displayName,
        },
      });
      content = parseLLMContent(response, store, spec, { make: options.make, year: options.year });
    } catch (err) {
      finalGenerationError = err instanceof Error ? err : new Error(String(err));
      // If the final attempt fails but we already have a viable best candidate from a prior
      // attempt, break out of the loop so we can fall back to that candidate below instead
      // of surfacing an error and leaving the page JSON unchanged.
      if (attempt === maxAttempts && bestCandidate) {
         
        console.warn(
          `[generatePageContent] ${spec.displayName}: OpenAI error on final attempt; falling back to best candidate.`,
          err
        );
        break;
      }
      if (attempt === maxAttempts) throw err;
      continue;
    }

    const rawTitle = content.seo?.title ?? "";
    const rawDesc = content.seo?.metaDescription ?? "";
    const title = clampTitle(rawTitle);
    // Do not append or inject a separate CTA sentence; rely entirely on the
    // LLM-generated meta description and just clamp to the desired length.
    const metaDescription = clampDescription(rawDesc, "");

    const page: ModelYearPage = {
      pageType: "model-year",
      make,
      model: spec.displayName,
      year: options.year,
      pagePath,
      canonicalUrl,
      seo: { title, metaDescription },
      images: {
        hero: { alt: `${options.year} ${make} ${spec.displayName} in ${city}, ${state}`, path: heroPath },
        vehicleJellybean: { alt: `${options.year} ${make} ${spec.displayName} jellybean image`, path: jellyPath },
      },
      heroSubhead: content.heroSubhead ?? "",
      whyBullets: content.whyBullets ?? ["", "", ""],
      trims: content.trims ?? { intro: "", sections: [] },
      faqs: content.faqs ?? [],
      links: { inventoryHref },
      tags,
      vehicleSchema: spec.vehicleSchema,
      storeKey: store.storeKey,
      contentSections: splitLocalPass ? undefined : content.contentSections,
      localSeoSummary: splitLocalPass ? undefined : content.localSeoSummary,
    };

    let gateResult = checkUniqueness(page, options.existingCorpora, {
      brand: options.brandSlug,
      storeKey: store.storeKey,
      acceptedBatchNGrams: options.acceptedBatchNGrams,
      usedSentences: options.usedSentences,
      requiredSignaturePhrases: [signaturePhrase],
      thresholds: options.thresholds,
    });

    let finalPage: ModelYearPage = page;

    if (splitLocalPass && gateResult.passed) {
      const MAX_LOCAL_ATTEMPTS = 3;
      let mergedOk: ModelYearPage | null = null;
      let lastMergedAttempt: ModelYearPage | null = null;
      let lastMergedGate: GateResult | null = null;

      for (let li = 0; li < MAX_LOCAL_ATTEMPTS; li++) {
        const localBundle = await generateLocalSectionsOnly(store, spec, {
          make,
          year: options.year,
          brandSlug: options.brandSlug,
          configsDir: options.configsDir,
        });
        const hasSections =
          Array.isArray(localBundle.contentSections) &&
          localBundle.contentSections.length >= 2;
        const hasSummary =
          typeof localBundle.localSeoSummary === "string" &&
          localBundle.localSeoSummary.trim().length > 0;
        if (!hasSections || !hasSummary) {
          console.warn(
            `[generatePageContent] ${spec.displayName}: local pass incomplete (attempt ${li + 1}/${MAX_LOCAL_ATTEMPTS}).`
          );
          continue;
        }
        let mergedAttempt = applyGeneratedLocalSectionsToPage(page, localBundle);
        mergedAttempt = normalizePunctuation(mergedAttempt) as ModelYearPage;
        lastMergedAttempt = mergedAttempt;
        lastMergedGate = checkUniqueness(mergedAttempt, options.existingCorpora, {
          brand: options.brandSlug,
          storeKey: store.storeKey,
          acceptedBatchNGrams: options.acceptedBatchNGrams,
          usedSentences: options.usedSentences,
          requiredSignaturePhrases: [signaturePhrase],
          thresholds: options.thresholds,
        });
        if (lastMergedGate.passed) {
          mergedOk = mergedAttempt;
          break;
        }
      }

      if (mergedOk) {
        finalPage = mergedOk;
        gateResult = lastMergedGate!;
      } else {
        const fromGate =
          lastMergedGate && lastMergedGate.failures.length > 0
            ? lastMergedGate.failures
            : null;
        gateResult = {
          passed: false,
          failures:
            fromGate ?? ["Local SEO pass did not yield valid sections and summary."],
          scores: lastMergedGate?.scores ?? {},
        };
        finalPage = lastMergedAttempt ?? page;
      }
    }

    if (gateResult.passed) {
      addPageToCorpusSet(finalPage, options.acceptedBatchNGrams);
      const sentences = extractSentences(
        (finalPage.seo?.metaDescription ?? "") +
          (finalPage.heroSubhead ?? "") +
          (finalPage.trims?.intro ?? "") +
          (finalPage.localSeoSummary ?? "") +
          (finalPage.contentSections ?? [])
            .map((sec) => `${sec.title ?? ""} ${sec.bodyHtml ?? ""}`)
            .join(" ") +
          (finalPage.faqs ?? [])
            .slice(0, 3)
            .map((f) => f.q + " " + f.a)
            .join(" ")
      );
      for (const s of sentences) options.usedSentences.add(normalizeSentence(s));
      options.usedSignaturePhrases.add(signaturePhrase.toLowerCase());
      return { page: finalPage, gateResult, attempts: attempt };
    }

    if (gateResult.failures.length < bestFailuresLength) {
      bestFailuresLength = gateResult.failures.length;
      bestCandidate = finalPage;
      bestGateResult = gateResult;
    }
  }

  if (bestCandidate) {
    console.warn(
      `[generatePageContent] ${spec.displayName}: max attempts (${maxAttempts}) reached; returning best candidate with ${bestFailuresLength} gate failure(s).`
    );
    // Final fallback: clamp existing meta description without adding any CTA.
    bestCandidate.seo.metaDescription = clampDescription(bestCandidate.seo.metaDescription ?? "", "");
    bestCandidate.seo.title = clampTitle(bestCandidate.seo.title ?? "");
    addPageToCorpusSet(bestCandidate, options.acceptedBatchNGrams);
    const sentences = extractSentences(
      (bestCandidate.seo?.metaDescription ?? "") +
        (bestCandidate.heroSubhead ?? "") +
        (bestCandidate.trims?.intro ?? "") +
        (bestCandidate.localSeoSummary ?? "") +
        (bestCandidate.contentSections ?? [])
          .map((sec) => `${sec.title ?? ""} ${sec.bodyHtml ?? ""}`)
          .join(" ") +
        (bestCandidate.faqs ?? [])
          .slice(0, 3)
          .map((f) => f.q + " " + f.a)
          .join(" ")
    );
    for (const s of sentences) options.usedSentences.add(normalizeSentence(s));
    return { page: bestCandidate, gateResult: bestGateResult ?? checkUniqueness(bestCandidate, options.existingCorpora, { brand: options.brandSlug, storeKey: store.storeKey, thresholds: options.thresholds }), attempts: maxAttempts };
  }

  // Persist one error row per model page run (not per internal retry attempt).
  if (finalGenerationError) {
    try {
      await prisma.openAIRequestLog.create({
        data: {
          model:
            (process.env.LLM_PROVIDER ?? "openai").toLowerCase() ===
            "anthropic"
              ? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6"
              : process.env.OPENAI_MODEL ?? "gpt-4.1",
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          durationMs: 0,
          estimatedCostUsd: 0,
          status: "error",
          errorText: String(finalGenerationError).slice(0, 2000),
          tags: {
            feature: "model-page-generator",
            brandSlug: options.brandSlug,
            make: options.make,
            year: options.year,
            model: spec.displayName,
          } as any,
        },
      });
    } catch {
      // Ignore logging failures and preserve original error behavior.
    }
  }

  throw new Error(`Failed to generate content for ${spec.displayName} after ${maxAttempts} attempts`);
}

/**
 * Load corpora from a pages directory (e.g. configs/pages).
 */
export function loadCorpora(pagesDir: string): Corpora {
  return loadCorporaFromDirectory(pagesDir);
}

/**
 * Generate only the 3 why bullets for a model (for regenerating bullets on existing pages).
 * Returns [string, string, string] with model-specific, unique bullets.
 * Pass configsDir to inject brand prompt guide (e.g. bmw.md) when available.
 */
export async function generateWhyBulletsOnly(
  store: StoreConfig,
  spec: ModelSpec,
  options: { make: string; year: number; brandSlug: string; configsDir?: string }
): Promise<[string, string, string]> {
  const tuning = getBrandTuning(options.configsDir, options.brandSlug);
  const brandPromptExcerpt =
    options.configsDir != null
      ? getBrandPromptDoc(options.configsDir, options.brandSlug) ?? undefined
      : undefined;
  const prompt = buildWhyBulletsOnlyPrompt(store, spec, {
    ...options,
    brandPromptExcerpt,
    configsDir: options.configsDir,
  });
  const response = await generateContent(prompt, {
    responseFormat: "json_object",
    temperature: 0.7,
    maxTokens: Math.min(tuning.maxTokensFaqs, 800),
    tags: {
      feature: "model-page-generator-why-bullets",
      brandSlug: options.brandSlug,
      make: options.make,
      year: options.year,
      model: spec.displayName,
    },
  });
  const json = extractJsonFromResponse(response);
  let data: { whyBullets?: unknown };
  try {
    data = JSON.parse(json) as { whyBullets?: unknown };
  } catch {
    throw new Error("Invalid JSON from LLM (why bullets only)");
  }
  const raw = Array.isArray(data.whyBullets) ? data.whyBullets : [];
  const arr = raw
    .filter((b: unknown): b is string => typeof b === "string" && b.trim().length > 0)
    .slice(0, 3)
    .map((s) => s.trim());
  while (arr.length < 3) {
    arr.push("");
  }
  const bullets = arr.slice(0, 3) as [string, string, string];
  return normalizePunctuation(bullets) as [string, string, string];
}

/**
 * Generate only the first 4 FAQs for a model (content-only; 5th is brand maintenance, added by helpers).
 * Useful for regenerating FAQs without touching the rest of the page.
 * Pass configsDir to inject brand prompt guide (e.g. bmw.md) when available.
 */
export async function generateFaqsOnly(
  store: StoreConfig,
  spec: ModelSpec,
  options: { make: string; year: number; brandSlug: string; configsDir?: string }
): Promise<{ q: string; a: string }[]> {
  const tuning = getBrandTuning(options.configsDir, options.brandSlug);
  const brandPromptExcerpt =
    options.configsDir != null
      ? getBrandPromptDoc(options.configsDir, options.brandSlug) ?? undefined
      : undefined;
  const modelSlug = slugify(spec.displayName);
  const searchQueries =
    options.configsDir != null
      ? loadSearchQueriesForModel(options.configsDir, options.brandSlug, options.year, modelSlug)
      : [];
  const prompt = buildFaqsOnlyPrompt(store, spec, {
    ...options,
    brandPromptExcerpt,
    searchQueries: searchQueries.length > 0 ? searchQueries : undefined,
    configsDir: options.configsDir,
  });
  const response = await generateContent(prompt, {
    responseFormat: "json_object",
    contentType: "faqs",
    temperature: 0.7,
    maxTokens: tuning.maxTokensFaqs,
    tags: {
      feature: "model-page-generator-faqs-only",
      brandSlug: options.brandSlug,
      make: options.make,
      year: options.year,
      model: spec.displayName,
    },
  });
  const json = extractJsonFromResponse(response);
  const data = tryParseLlmJson<{ faqs?: unknown }>(json);
  if (!data) {
    console.warn("[generateFaqsOnly] Failed to parse LLM JSON; returning empty FAQ list.");
    return [];
  }
  const rawFaqs = Array.isArray(data.faqs) ? data.faqs : [];
  const faqs = rawFaqs
    .filter((f): f is { q?: unknown; a?: unknown } => !!f && typeof f === "object")
    .map((f) => ({
      q: String((f as any).q ?? "").trim(),
      a: String((f as any).a ?? "").trim(),
    }))
    .filter((f) => f.q && f.a)
    .slice(0, 4);
  return faqs;
}

/**
 * Generate only long-form local content sections and local SEO summary.
 * Pass configsDir to inject brand prompt guide (e.g. bmw.md) when available.
 */
export async function generateLocalSectionsOnly(
  store: StoreConfig,
  spec: ModelSpec,
  options: { make: string; year: number; brandSlug: string; configsDir?: string }
): Promise<{ contentSections?: ContentSection[]; localSeoSummary?: string }> {
  const tuning = getBrandTuning(options.configsDir, options.brandSlug);
  const brandPromptExcerpt =
    options.configsDir != null
      ? getBrandPromptDoc(options.configsDir, options.brandSlug) ?? undefined
      : undefined;
  const modelSlug = slugify(spec.displayName);
  const searchQueries =
    options.configsDir != null
      ? loadSearchQueriesForModel(
          options.configsDir,
          options.brandSlug,
          options.year,
          modelSlug
        )
      : [];
  const prompt = buildLocalSectionsPrompt(store, spec, {
    ...options,
    brandPromptExcerpt,
    searchQueries:
      searchQueries.length > 0 ? searchQueries : undefined,
    configsDir: options.configsDir,
  });
  const response = await generateContent(prompt, {
    responseFormat: "json_object",
    temperature: 0.7,
    maxTokens: tuning.maxTokensLocal,
    contentType: "local",
    tags: {
      feature: "model-page-generator-local-only",
      brandSlug: options.brandSlug,
      make: options.make,
      year: options.year,
      model: spec.displayName,
    },
  });
  const json = extractJsonFromResponse(response);
  const data = tryParseLlmJson<{
    contentSections?: unknown;
    localSeoSummary?: unknown;
  }>(json);
  if (!data) {
    console.warn("[generateLocalSectionsOnly] Failed to parse LLM JSON; returning empty local content.");
    return { contentSections: undefined, localSeoSummary: undefined };
  }
  const rawSections = data.contentSections;
  const localSeoSummary =
    typeof data.localSeoSummary === "string"
      ? data.localSeoSummary.trim()
      : undefined;

  let contentSections: ContentSection[] | undefined;
  if (Array.isArray(rawSections)) {
    contentSections = rawSections
      .map((s, idx): ContentSection | null => {
        if (!s || typeof s !== "object") return null;
        const section = s as {
          id?: unknown;
          title?: unknown;
          intent?: unknown;
          bodyHtml?: unknown;
        };
        const title =
          typeof section.title === "string" ? section.title.trim() : "";
        const bodyHtml =
          typeof section.bodyHtml === "string"
            ? section.bodyHtml.trim()
            : "";
        if (!title || !bodyHtml) return null;
        const intent =
          typeof section.intent === "string"
            ? section.intent.trim()
            : undefined;
        let id =
          typeof section.id === "string" ? section.id.trim() : "";
        if (!id) {
          id = slugify(
            `${options.year}-${options.make}-${spec.displayName}-${title}-${idx}`
          );
        }
        const sectionObj: ContentSection = {
          id,
          title,
          bodyHtml,
        };
        if (intent) {
          sectionObj.intent = intent;
        }
        return sectionObj;
      })
      .filter((s): s is ContentSection => s !== null)
      .slice(0, 3);
  }

  return { contentSections, localSeoSummary };
}

/**
 * Helper to merge freshly generated FAQs into an existing page, adding the brand warranty FAQ.
 * Does not alter any other page fields.
 */
export function applyGeneratedFaqsToPage(
  page: ModelYearPage,
  store: StoreConfig,
  spec: ModelSpec,
  contentFaqs: { q: string; a: string }[]
): ModelYearPage {
  const brandWarranty: BrandWarranty = normalizeBrandWarranty(store.brand);
  const warrantyFaq = getWarrantyFaq(brandWarranty, 0, spec.category);
  const normalizedFaqs = contentFaqs.map((f) => ({
    q: String(f.q ?? "").trim(),
    a: String(f.a ?? "").trim(),
  }));
  const faqs = [...normalizedFaqs, warrantyFaq];
  return {
    ...page,
    faqs,
  };
}

/**
 * Helper to merge freshly generated local sections into an existing page.
 * Does not alter SEO title/meta, hero, trims, or FAQs.
 */
export function applyGeneratedLocalSectionsToPage(
  page: ModelYearPage,
  local: { contentSections?: ContentSection[]; localSeoSummary?: string }
): ModelYearPage {
  return {
    ...page,
    contentSections: local.contentSections ?? page.contentSections,
    localSeoSummary: local.localSeoSummary ?? page.localSeoSummary,
  };
}
