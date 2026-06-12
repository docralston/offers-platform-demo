'use server';

import * as fs from 'fs';
import * as path from 'path';
import { requireAdmin, requireUserId } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { getModelPageConfigRoot } from '@/lib/model-page-generator/config-path';
import {
  getListMeta,
  listModelsForYear,
  type ListMetaResult,
  type ModelWithSlug,
} from '@/lib/model-page-generator/list';
import {
  joinModelPagerPagesDir,
  modelPagerPageMatchesStoreScope,
} from '@/lib/model-page-generator/paths';
import {
  getModelPagerPageJsonPath as getPageFilePath,
  persistModelYearPage,
} from '@/lib/model-page-generator/persist-model-page';
import { isDemoMode } from '@/lib/config/demo';
import { demoModelPageAssetBaseUrl, rewriteProdAssetPathForDemo } from '@/lib/demo/model-page-assets';
import { runGeneration, loadStore } from '@/lib/model-page-generator/run';
import { writeModelYearDistHtml } from '@/lib/model-page-generator/dist-writer';
import {
  generatePage,
  normalizePunctuation,
  slugify,
  validatePage,
  type ModelYearPage,
} from '@/lib/model-page-generator';
import { clampDescription, clampTitle } from '@/lib/model-page-generator/meta';
import {
  generateFaqsOnly,
  applyGeneratedFaqsToPage,
  generateWhyBulletsOnly,
  generateLocalSectionsOnly,
  applyGeneratedLocalSectionsToPage,
} from '@/lib/model-page-generator/generator';
import { extractJsonFromResponse, generateContent } from '@/lib/model-page-generator/llm-client';
import {
  injectInternalLinks,
  applyLinkedSectionsToPage,
  withInternalLinkTargetSnapshot,
} from '@/lib/model-page-generator/internal-links';
import {
  getSearchQueriesFileMtime,
  readSearchQueriesFileRaw,
} from '@/lib/model-page-generator/search-queries';
import { generateAndWriteSearchQueriesFile } from '@/lib/model-page-generator/search-queries-generate';
import {
  resolveModelYearTemplatePath,
  resolveBrandLineupTemplatePath,
} from '@/lib/model-page-generator/template-registry';
import type { GateResult } from '@/lib/model-page-generator/uniqueness-gate';

/** Resolve the approved-example path: approved-examples/{brand}/{slug}.json */
function getApprovedFilePath(configRoot: string, brand: string, slug: string): string {
  const brandSlug = brand.toLowerCase();
  const slugNorm = slug.toLowerCase().replace(/\.json$/, '');
  return path.join(configRoot, 'approved-examples', brandSlug, `${slugNorm}.json`);
}

export type ModelPagesListRow = {
  slug: string;
  model: string;
  url: string;
  title: string;
  description: string;
  /** ISO mtime of page JSON, or null if no file */
  pageUpdatedAt: string | null;
  searchQueriesGatheredAt: string | null;
  hasApprovedExample: boolean;
  /** True when catalog lists this model but no page JSON exists */
  missingPage: boolean;
};

function isoOrNull(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function fileMtime(filePath: string): Date | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.statSync(filePath).mtime;
  } catch {
    return null;
  }
}

/**
 * List page files in scope (merged with catalog). Includes models with no JSON yet.
 */
export async function listPagesInScope(
  brand: string,
  year: number,
  storeKey: string | null
): Promise<ModelPagesActionResult<ModelPagesListRow[]>> {
  try {
    await requireAdmin();
    const configRoot = getModelPageConfigRoot();
    const brandSlug = brand.toLowerCase();
    const dir = joinModelPagerPagesDir(configRoot, brandSlug, year, storeKey);
    const catalog = listModelsForYear(configRoot, brandSlug, year);
    const catalogBySlug = new Map(catalog.map((m) => [m.slug, m]));

    const onDiskParsed = new Map<
      string,
      { page: ModelYearPage & { pageType?: string }; filePath: string }
    >();

    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.includes('-models-'));
      for (const f of files) {
        const slug = f.replace(/\.json$/, '');
        const filePath = path.join(dir, f);
        try {
          const raw = fs.readFileSync(filePath, 'utf8');
          const page = JSON.parse(raw) as ModelYearPage & { pageType?: string };
          if (page.pageType && page.pageType !== 'model-year') continue;
          onDiskParsed.set(slug, { page, filePath });
        } catch {
          onDiskParsed.set(slug, {
            page: {
              pageType: 'model-year',
              model: slug,
              pagePath: '',
              seo: { title: '', metaDescription: '' },
            } as ModelYearPage,
            filePath,
          });
        }
      }
    }

    const seen = new Set<string>();
    const data: ModelPagesListRow[] = [];

    for (const m of catalog) {
      const slug = m.slug;
      seen.add(slug);
      const disk = onDiskParsed.get(slug);
      const filePath = getPageFilePath(configRoot, brand, year, storeKey, slug);
      const mt = fileMtime(filePath);
      const sqMt = getSearchQueriesFileMtime(configRoot, brandSlug, year, slug);
      const approvedPath = getApprovedFilePath(configRoot, brand, slug);

      if (disk) {
        const page = disk.page;
        data.push({
          slug,
          model: page.model ?? slug,
          url: page.pagePath ?? '',
          title: page.seo?.title ?? '',
          description: page.seo?.metaDescription ?? '',
          pageUpdatedAt: isoOrNull(mt),
          searchQueriesGatheredAt: isoOrNull(sqMt),
          hasApprovedExample: fs.existsSync(approvedPath),
          missingPage: false,
        });
      } else {
        data.push({
          slug,
          model: m.displayName,
          url: '',
          title: '',
          description: '',
          pageUpdatedAt: null,
          searchQueriesGatheredAt: isoOrNull(sqMt),
          hasApprovedExample: fs.existsSync(approvedPath),
          missingPage: true,
        });
      }
    }

    for (const [slug, { page, filePath }] of onDiskParsed) {
      if (seen.has(slug)) continue;
      const mt = fileMtime(filePath);
      const sqMt = getSearchQueriesFileMtime(configRoot, brandSlug, year, slug);
      const approvedPath = getApprovedFilePath(configRoot, brand, slug);
      data.push({
        slug,
        model: page.model ?? slug,
        url: page.pagePath ?? '',
        title: page.seo?.title ?? '',
        description: page.seo?.metaDescription ?? '',
        pageUpdatedAt: isoOrNull(mt),
        searchQueriesGatheredAt: isoOrNull(sqMt),
        hasApprovedExample: fs.existsSync(approvedPath),
        missingPage: !catalogBySlug.has(slug),
      });
    }

    data.sort((a, b) => a.model.localeCompare(b.model));
    return { success: true, data };
  } catch (error) {
    console.error('listPagesInScope:', error);
    return {
      success: false,
      errors: [{ field: 'general', message: (error as Error).message }],
    };
  }
}

export interface ModelPagesActionResult<T = void> {
  success: boolean;
  errors?: Array<{ field: string; message: string }>;
  data?: T;
}

export async function getModelPagesMeta(): Promise<ModelPagesActionResult<ListMetaResult>> {
  try {
    await requireAdmin();
    const configRoot = getModelPageConfigRoot();
    const data = getListMeta(configRoot);
    return { success: true, data };
  } catch (error) {
    console.error('getModelPagesMeta:', error);
    return {
      success: false,
      errors: [{ field: 'general', message: (error as Error).message }],
    };
  }
}

export async function getModelsForYear(
  brand: string,
  year: number
): Promise<ModelPagesActionResult<ModelWithSlug[]>> {
  try {
    await requireAdmin();
    const configRoot = getModelPageConfigRoot();
    const data = listModelsForYear(configRoot, brand.toLowerCase(), year);
    return { success: true, data };
  } catch (error) {
    console.error('getModelsForYear:', error);
    return {
      success: false,
      errors: [{ field: 'general', message: (error as Error).message }],
    };
  }
}

export async function getPageContent(
  brand: string,
  year: number,
  storeKey: string | null,
  slug: string
): Promise<ModelPagesActionResult<ModelYearPage>> {
  try {
    await requireAdmin();
    const configRoot = getModelPageConfigRoot();
    const filePath = getPageFilePath(configRoot, brand, year, storeKey, slug);
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        errors: [{ field: 'slug', message: 'Page not found' }],
      };
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw) as ModelYearPage;
    return { success: true, data };
  } catch (error) {
    console.error('getPageContent:', error);
    return {
      success: false,
      errors: [{ field: 'general', message: (error as Error).message }],
    };
  }
}

export async function getSearchQueriesText(
  brand: string,
  year: number,
  slug: string
): Promise<ModelPagesActionResult<string | null>> {
  try {
    await requireAdmin();
    const configRoot = getModelPageConfigRoot();
    const raw = readSearchQueriesFileRaw(
      configRoot,
      brand.toLowerCase(),
      year,
      slug.toLowerCase().replace(/\.json$/, '')
    );
    return { success: true, data: raw };
  } catch (error) {
    console.error('getSearchQueriesText:', error);
    return {
      success: false,
      errors: [{ field: 'general', message: (error as Error).message }],
    };
  }
}

export async function refreshSearchQueries(
  brand: string,
  year: number,
  storeKey: string | null,
  slug: string,
  options?: { previousLineCount?: number; previousFirstLine?: string }
): Promise<
  ModelPagesActionResult<{
    searchQueriesGatheredAt: string;
    lineCount: number;
    previousLineCount?: number;
    lineCountDelta?: number;
    firstLineChanged?: boolean;
  }>
> {
  try {
    await requireAdmin();
    const configRoot = getModelPageConfigRoot();
    const brandSlug = brand.toLowerCase();
    const normalizedSlug = slug.toLowerCase().replace(/\.json$/, '');
    const store = loadStore(configRoot, brandSlug, storeKey ?? null);
    const make =
      store.brand?.trim() ||
      brandSlug.charAt(0).toUpperCase() + brandSlug.slice(1);

    const filePath = getPageFilePath(configRoot, brand, year, storeKey, normalizedSlug);
    let displayName: string | undefined;
    let category: string | undefined;

    if (fs.existsSync(filePath)) {
      const page = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ModelYearPage;
      displayName = page.model;
    }
    if (!displayName) {
      const models = listModelsForYear(configRoot, brandSlug, year);
      const spec = models.find((m) => m.slug === normalizedSlug);
      displayName = spec?.displayName ?? normalizedSlug;
      category = spec?.category;
    } else {
      const models = listModelsForYear(configRoot, brandSlug, year);
      category = models.find((m) => m.slug === normalizedSlug)?.category;
    }

    const prevRaw = readSearchQueriesFileRaw(configRoot, brandSlug, year, normalizedSlug);
    const prevLines = prevRaw
      ? prevRaw.split(/\r?\n/).filter((l) => l.trim().length > 0).length
      : undefined;
    const prevFirst = prevRaw
      ? prevRaw.split(/\r?\n/).find((l) => l.trim().length > 0)
      : undefined;

    const { lineCount } = await generateAndWriteSearchQueriesFile({
      configsDir: configRoot,
      brandSlug,
      year,
      slug: normalizedSlug,
      displayName,
      make,
      category,
    });

    const mt = getSearchQueriesFileMtime(configRoot, brandSlug, year, normalizedSlug);
    const newRaw = readSearchQueriesFileRaw(configRoot, brandSlug, year, normalizedSlug);
    const newFirst = newRaw
      ? newRaw.split(/\r?\n/).find((l) => l.trim().length > 0)
      : undefined;

    return {
      success: true,
      data: {
        searchQueriesGatheredAt: (mt ?? new Date()).toISOString(),
        lineCount,
        previousLineCount: options?.previousLineCount ?? prevLines,
        lineCountDelta:
          prevLines !== undefined ? lineCount - prevLines : undefined,
        firstLineChanged:
          prevFirst !== undefined && newFirst !== undefined
            ? prevFirst.trim() !== newFirst.trim()
            : undefined,
      },
    };
  } catch (error) {
    console.error('refreshSearchQueries:', error);
    return {
      success: false,
      errors: [{ field: 'general', message: (error as Error).message }],
    };
  }
}

export async function refreshAllSearchQueries(
  brand: string,
  year: number,
  storeKey: string | null
): Promise<
  ModelPagesActionResult<{
    total: number;
    updated: number;
    failed: number;
    failures: Array<{ slug: string; message: string }>;
  }>
> {
  try {
    await requireAdmin();
    const configRoot = getModelPageConfigRoot();
    const brandSlug = brand.toLowerCase();
    const models = listModelsForYear(configRoot, brandSlug, year);
    const store = loadStore(configRoot, brandSlug, storeKey ?? null);
    const make =
      store.brand?.trim() ||
      brandSlug.charAt(0).toUpperCase() + brandSlug.slice(1);

    let updated = 0;
    let failed = 0;
    const failures: Array<{ slug: string; message: string }> = [];

    for (const model of models) {
      try {
        await generateAndWriteSearchQueriesFile({
          configsDir: configRoot,
          brandSlug,
          year,
          slug: model.slug,
          displayName: model.displayName,
          make,
          category: model.category,
        });
        updated++;
      } catch (error) {
        failed++;
        failures.push({
          slug: model.slug,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      success: true,
      data: {
        total: models.length,
        updated,
        failed,
        failures,
      },
    };
  } catch (error) {
    console.error('refreshAllSearchQueries:', error);
    return {
      success: false,
      errors: [{ field: 'general', message: (error as Error).message }],
    };
  }
}

export async function approvePage(
  brand: string,
  year: number,
  storeKey: string | null,
  slug: string
): Promise<ModelPagesActionResult<void>> {
  try {
    await requireAdmin();
    const configRoot = getModelPageConfigRoot();
    const sourcePath = getPageFilePath(configRoot, brand, year, storeKey, slug);
    const destPath = getApprovedFilePath(configRoot, brand, slug);
    if (!fs.existsSync(sourcePath)) {
      return {
        success: false,
        errors: [{ field: 'slug', message: 'Page not found' }],
      };
    }
    const approvedDir = path.dirname(destPath);
    fs.mkdirSync(approvedDir, { recursive: true });
    fs.copyFileSync(sourcePath, destPath);
    return { success: true };
  } catch (error) {
    console.error('approvePage:', error);
    return {
      success: false,
      errors: [{ field: 'general', message: (error as Error).message }],
    };
  }
}

export async function savePage(
  brand: string,
  year: number,
  storeKey: string | null,
  slug: string,
  page: ModelYearPage
): Promise<ModelPagesActionResult<void>> {
  try {
    await requireAdmin();
    const configRoot = getModelPageConfigRoot();
    const result = persistModelYearPage(configRoot, brand, year, storeKey, slug, page);
    if (!result.success) {
      return { success: false, errors: result.errors };
    }
    return { success: true };
  } catch (error) {
    console.error('savePage:', error);
    return {
      success: false,
      errors: [{ field: 'general', message: (error as Error).message }],
    };
  }
}

export async function regenerateFaqs(
  brand: string,
  year: number,
  storeKey: string | null,
  slug: string
): Promise<ModelPagesActionResult<ModelYearPage>> {
  try {
    await requireAdmin();
    const configRoot = getModelPageConfigRoot();
    const brandSlug = brand.toLowerCase();
    const filePath = getPageFilePath(configRoot, brand, year, storeKey, slug);
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        errors: [{ field: 'slug', message: 'Page not found' }],
      };
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const existing = JSON.parse(raw) as ModelYearPage;

    const store = loadStore(configRoot, brandSlug, storeKey ?? null);
    const models = listModelsForYear(configRoot, brandSlug, year);
    const normalizedSlug = slug.toLowerCase().replace(/\.json$/, '');
    const spec =
      models.find((m) => slugify(m.displayName) === normalizedSlug) ??
      models.find((m) => m.displayName === existing.model);

    if (!spec) {
      return {
        success: false,
        errors: [
          {
            field: 'slug',
            message: 'Model spec not found for this page; cannot regenerate FAQs',
          },
        ],
      };
    }

    const make =
      store.brand?.trim() ||
      brandSlug.charAt(0).toUpperCase() + brandSlug.slice(1);

    const contentFaqs = await generateFaqsOnly(store, spec, {
      make,
      year,
      brandSlug,
      configsDir: configRoot,
    });

    const updated = applyGeneratedFaqsToPage(existing, store, spec, contentFaqs);

    const saveResult = await savePage(brand, year, storeKey, slug, updated);
    if (!saveResult.success) {
      return {
        success: false,
        errors: saveResult.errors,
      };
    }

    return { success: true, data: updated };
  } catch (error) {
    console.error('regenerateFaqs:', error);
    return {
      success: false,
      errors: [{ field: 'general', message: (error as Error).message }],
    };
  }
}

export async function regenerateWhyBullets(
  brand: string,
  year: number,
  storeKey: string | null,
  slug: string
): Promise<ModelPagesActionResult<ModelYearPage>> {
  try {
    await requireAdmin();
    const configRoot = getModelPageConfigRoot();
    const brandSlug = brand.toLowerCase();
    const filePath = getPageFilePath(configRoot, brand, year, storeKey, slug);
    if (!fs.existsSync(filePath)) {
      return { success: false, errors: [{ field: 'slug', message: 'Page not found' }] };
    }
    const existing = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ModelYearPage;
    const store = loadStore(configRoot, brandSlug, storeKey ?? null);
    const models = listModelsForYear(configRoot, brandSlug, year);
    const normalizedSlug = slug.toLowerCase().replace(/\.json$/, '');
    const spec =
      models.find((m) => slugify(m.displayName) === normalizedSlug) ??
      models.find((m) => m.displayName === existing.model);
    if (!spec) {
      return {
        success: false,
        errors: [{ field: 'slug', message: 'Model spec not found' }],
      };
    }
    const make =
      store.brand?.trim() ||
      brandSlug.charAt(0).toUpperCase() + brandSlug.slice(1);
    const bullets = await generateWhyBulletsOnly(store, spec, {
      make,
      year,
      brandSlug,
      configsDir: configRoot,
    });
    const updated = { ...existing, whyBullets: bullets };
    const saveResult = await savePage(brand, year, storeKey, slug, updated);
    if (!saveResult.success) {
      return { success: false, errors: saveResult.errors };
    }
    return { success: true, data: updated };
  } catch (error) {
    console.error('regenerateWhyBullets:', error);
    return {
      success: false,
      errors: [{ field: 'general', message: (error as Error).message }],
    };
  }
}

export async function regenerateLocalSections(
  brand: string,
  year: number,
  storeKey: string | null,
  slug: string
): Promise<ModelPagesActionResult<ModelYearPage>> {
  try {
    await requireAdmin();
    const configRoot = getModelPageConfigRoot();
    const brandSlug = brand.toLowerCase();
    const filePath = getPageFilePath(configRoot, brand, year, storeKey, slug);
    if (!fs.existsSync(filePath)) {
      return { success: false, errors: [{ field: 'slug', message: 'Page not found' }] };
    }
    const existing = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ModelYearPage;
    const store = loadStore(configRoot, brandSlug, storeKey ?? null);
    const models = listModelsForYear(configRoot, brandSlug, year);
    const normalizedSlug = slug.toLowerCase().replace(/\.json$/, '');
    const spec =
      models.find((m) => slugify(m.displayName) === normalizedSlug) ??
      models.find((m) => m.displayName === existing.model);
    if (!spec) {
      return {
        success: false,
        errors: [{ field: 'slug', message: 'Model spec not found' }],
      };
    }
    const make =
      store.brand?.trim() ||
      brandSlug.charAt(0).toUpperCase() + brandSlug.slice(1);
    const local = await generateLocalSectionsOnly(store, spec, {
      make,
      year,
      brandSlug,
      configsDir: configRoot,
    });
    const updated = applyGeneratedLocalSectionsToPage(existing, local);
    const linked = await injectInternalLinks(updated, store, spec, { brandSlug });
    const updatedWithLinks = withInternalLinkTargetSnapshot(
      applyLinkedSectionsToPage(updated, linked),
      store,
      brandSlug
    );
    const saveResult = await savePage(
      brand,
      year,
      storeKey,
      slug,
      updatedWithLinks
    );
    if (!saveResult.success) {
      return { success: false, errors: saveResult.errors };
    }
    return { success: true, data: updatedWithLinks };
  } catch (error) {
    console.error('regenerateLocalSections:', error);
    return {
      success: false,
      errors: [{ field: 'general', message: (error as Error).message }],
    };
  }
}

function regenerateSeoCandidatePage(
  response: string
): Record<string, unknown> | null {
  try {
    return JSON.parse(extractJsonFromResponse(response)) as Record<string, unknown>;
  } catch (error) {
    console.warn('[seo-regen] Failed to parse JSON response:', {
      error: error instanceof Error ? error.message : String(error),
      responsePreview: String(response ?? '').slice(0, 400),
    });
    return null;
  }
}

function stripCodeFences(text: string): string {
  return String(text ?? '')
    .replace(/^```(?:json|text)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

function extractSeoTitleFromCandidate(parsed: Record<string, unknown> | null): string {
  if (!parsed) return '';
  const direct = pickString(parsed, ['title', 'seoTitle', 'metaTitle']);
  if (direct) return direct;
  const seo = parsed.seo;
  if (seo && typeof seo === 'object') {
    return pickString(seo as Record<string, unknown>, ['title', 'seoTitle', 'metaTitle']);
  }
  return '';
}

function extractSeoDescriptionFromCandidate(parsed: Record<string, unknown> | null): string {
  if (!parsed) return '';
  const direct = pickString(parsed, [
    'description',
    'metaDescription',
    'seoDescription',
    'desc',
  ]);
  if (direct) return direct;
  const seo = parsed.seo;
  if (seo && typeof seo === 'object') {
    return pickString(seo as Record<string, unknown>, [
      'description',
      'metaDescription',
      'seoDescription',
      'desc',
    ]);
  }
  return '';
}

function extractSeoTitleFromRawResponse(raw: string): string {
  const cleaned = stripCodeFences(raw);
  if (!cleaned) return '';
  // Prefer explicit key-value patterns first.
  const keyPatterns = [
    /"title"\s*:\s*"([^"]+)"/i,
    /'title'\s*:\s*'([^']+)'/i,
    /title\s*:\s*(.+)/i,
  ];
  for (const re of keyPatterns) {
    const m = cleaned.match(re);
    if (m?.[1]) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  // Fallback: first non-empty line as title candidate.
  const firstLine = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  return firstLine ? firstLine.replace(/^[-*]\s*/, '').trim() : '';
}

function extractSeoDescriptionFromRawResponse(raw: string): string {
  const cleaned = stripCodeFences(raw);
  if (!cleaned) return '';
  const keyPatterns = [
    /"description"\s*:\s*"([^"]+)"/i,
    /"metaDescription"\s*:\s*"([^"]+)"/i,
    /'description'\s*:\s*'([^']+)'/i,
    /description\s*:\s*(.+)/i,
  ];
  for (const re of keyPatterns) {
    const m = cleaned.match(re);
    if (m?.[1]) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  // Fallback: join first two non-empty lines to tolerate wrapped prose.
  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2);
  return lines.join(' ').replace(/^[-*]\s*/, '').trim();
}

function includesAny(text: string, terms: string[]): boolean {
  const t = text.toLowerCase();
  return terms.some((term) => term && t.includes(term.toLowerCase()));
}

function seoTitleQualityIssues(input: {
  title: string;
  year: number;
  modelName: string;
  city: string;
  county?: string;
}): string[] {
  const issues: string[] = [];
  const title = input.title.trim();
  if (title.length < 45 || title.length > 60) {
    issues.push('title length should be 45-60 chars');
  }
  const modelLower = input.modelName.toLowerCase();
  if (!title.toLowerCase().includes(modelLower)) {
    issues.push('title should include the model name');
  }
  if (!title.includes(String(input.year))) {
    issues.push('title should include the model year');
  }
  const localityTerms = [input.city, input.county ?? ''].filter(Boolean);
  if (!includesAny(title, localityTerms)) {
    issues.push('title should include city or county');
  }
  return issues;
}

function seoDescriptionQualityIssues(input: {
  description: string;
  modelName: string;
  city: string;
  county?: string;
}): string[] {
  const issues: string[] = [];
  const d = input.description.trim();
  if (d.length < 145 || d.length > 158) {
    issues.push('description length should be 145-158 chars');
  }
  const localityTerms = [input.city, input.county ?? ''].filter(Boolean);
  if (!includesAny(d, localityTerms)) {
    issues.push('description should include city or county');
  }
  if (!d.toLowerCase().includes(input.modelName.toLowerCase())) {
    issues.push('description should include model name');
  }
  const ctaTerms = [
    'test drive',
    'schedule',
    'shop',
    'browse',
    'view',
    'contact',
    'explore inventory',
  ];
  if (!includesAny(d, ctaTerms)) {
    issues.push('description should include a clear CTA');
  }
  return issues;
}

function getComparisonGuardrailForBrand(brandSlug: string): string {
  const b = brandSlug.toLowerCase();
  if (b === 'toyota') {
    return 'Comparison guardrail: NEVER compare Toyota against BMW or Lexus. Use mainstream rivals like Honda/Subaru/Hyundai/Kia/Nissan where relevant.';
  }
  if (b === 'lexus') {
    return 'Comparison guardrail: NEVER compare Lexus against BMW or Toyota. Use luxury rivals like Acura/Mercedes-Benz/Audi/Genesis where relevant.';
  }
  if (b === 'bmw') {
    return 'Comparison guardrail: NEVER compare BMW against Lexus or Toyota. Use luxury performance rivals like Mercedes-Benz/Audi/Porsche where relevant.';
  }
  return 'Comparison guardrail: never compare Toyota, BMW, and Lexus against each other.';
}

async function generateSeoTitleTextFallback(input: {
  year: number;
  make: string;
  modelName: string;
  city: string;
  state: string;
  county?: string;
  evidence?: string[];
  currentTitle: string;
  rejectionReason?: string;
  fallbackReason?: string;
  brandSlug: string;
}): Promise<string> {
  const evidenceText =
    input.evidence && input.evidence.length > 0
      ? `\nGrounding facts (optional, use at most one naturally):\n- ${input.evidence.join('\n- ')}`
      : '';
  const comparisonGuardrail = getComparisonGuardrailForBrand(input.brandSlug);
  const prompt = `Write ONE SEO title line for a vehicle model page.

Context:
- Model: ${input.year} ${input.make} ${input.modelName}
- Dealer location: ${input.city}, ${input.state}${input.county ? ` (${input.county})` : ''}${evidenceText}
- ${comparisonGuardrail}

Rules:
- Output plain text only (no JSON, no markdown, no quotes).
- 50-60 characters preferred (hard max 60).
- Must include the exact model phrase "${input.year} ${input.make} ${input.modelName}" once.
- Must include local intent naturally (city or county once max).
- Be specific and search-intent oriented; avoid vague promo wording.
- Avoid filler words like "discover", "explore", "unleash", "elevate", "ultimate".
- Do NOT include dealership name.
- Must be materially different from this current title:
"${input.currentTitle}"${input.rejectionReason ? `\n- Previous candidate was rejected because: ${input.rejectionReason}` : ''}`;

  const response = await generateContent(prompt, {
    responseFormat: 'text',
    contentType: 'meta',
    temperature: 0.6,
    maxTokens: 90,
    tags: {
      feature: 'model-page-seo-regen',
      field: 'title-fallback',
      fallbackReason: input.fallbackReason ?? (input.rejectionReason ? 'quality_retry' : 'unknown'),
      qualityIssues: input.rejectionReason ?? undefined,
      brandSlug: input.brandSlug,
      year: input.year,
      model: input.modelName,
    },
  });
  return String(response ?? '').trim();
}

async function generateSeoDescriptionTextFallback(input: {
  year: number;
  make: string;
  modelName: string;
  city: string;
  state: string;
  county?: string;
  evidence?: string[];
  currentDescription: string;
  rejectionReason?: string;
  fallbackReason?: string;
  brandSlug: string;
}): Promise<string> {
  const evidenceText =
    input.evidence && input.evidence.length > 0
      ? `\nGrounding facts (optional, use 1 naturally):\n- ${input.evidence.join('\n- ')}`
      : '';
  const comparisonGuardrail = getComparisonGuardrailForBrand(input.brandSlug);
  const prompt = `Write ONE SEO meta description line for a vehicle model page.

Context:
- Model: ${input.year} ${input.make} ${input.modelName}
- Dealer location: ${input.city}, ${input.state}${input.county ? ` (${input.county})` : ''}${evidenceText}
- ${comparisonGuardrail}

Rules:
- Output plain text only (no JSON, no markdown, no quotes).
- 150-158 characters preferred (hard max 158).
- Mention 1 concrete, model-relevant strength (performance, tech, comfort, efficiency, cargo, etc.).
- Include local context naturally (city or county once max).
- Include a concise CTA at the end.
- Be specific and useful; avoid generic marketing fluff.
- Avoid filler words like "discover", "explore", "unleash", "elevate", "ultimate".
- Do NOT include dealership name.
- Must be materially different from this current description:
"${input.currentDescription}"${input.rejectionReason ? `\n- Previous candidate was rejected because: ${input.rejectionReason}` : ''}`;

  const response = await generateContent(prompt, {
    responseFormat: 'text',
    contentType: 'meta',
    temperature: 0.6,
    maxTokens: 130,
    tags: {
      feature: 'model-page-seo-regen',
      field: 'description-fallback',
      fallbackReason: input.fallbackReason ?? (input.rejectionReason ? 'quality_retry' : 'unknown'),
      qualityIssues: input.rejectionReason ?? undefined,
      brandSlug: input.brandSlug,
      year: input.year,
      model: input.modelName,
    },
  });
  return String(response ?? '').trim();
}

export async function regenerateSeoTitle(
  brand: string,
  year: number,
  storeKey: string | null,
  slug: string
): Promise<ModelPagesActionResult<{ title: string; description: string }>> {
  try {
    const debugEnabled = process.env.NODE_ENV !== 'production';
    const debugTrail: string[] = [];
    await requireAdmin();
    const configRoot = getModelPageConfigRoot();
    const filePath = getPageFilePath(configRoot, brand, year, storeKey, slug);
    if (!fs.existsSync(filePath)) {
      return { success: false, errors: [{ field: 'slug', message: 'Page not found' }] };
    }

    const existing = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ModelYearPage;
    const currentTitle = String(existing.seo?.title ?? '').trim();
    const brandSlug = brand.toLowerCase();
    const store = loadStore(configRoot, brandSlug, storeKey ?? null);
    const models = listModelsForYear(configRoot, brandSlug, year);
    const normalizedSlug = slug.toLowerCase().replace(/\.json$/, '');
    const spec =
      models.find((m) => slugify(m.displayName) === normalizedSlug) ??
      models.find((m) => m.displayName === existing.model);
    const make =
      store.brand?.trim() ||
      brandSlug.charAt(0).toUpperCase() + brandSlug.slice(1);
    const city = store.location?.city ?? 'Demotown';
    const state = store.location?.state ?? 'PA';
    const modelName = spec?.displayName ?? existing.model ?? normalizedSlug;
    const county = store.location?.county ?? '';
    const seoEvidence = (existing.whyBullets ?? [])
      .map((x) => String(x ?? '').trim())
      .filter(Boolean)
      .slice(0, 2);
    const comparisonGuardrail = getComparisonGuardrailForBrand(brandSlug);

    const prompt = `Return only valid JSON.
{
  "title": "..."
}

Write ONE SEO title for a vehicle model page.

Context:
- Model: ${year} ${make} ${modelName}
- Dealer location: ${city}, ${state}${county ? ` (${county})` : ''}
- Optional grounding points (use at most one naturally): ${seoEvidence.join(' | ') || 'N/A'}
- ${comparisonGuardrail}

Rules:
- 50-60 characters preferred (hard max 60).
- Must include the exact model phrase "${year} ${make} ${modelName}" once.
- Must include local intent naturally (city or county once max).
- Be specific and search-intent oriented; avoid vague promo wording.
- Avoid filler words like "discover", "explore", "unleash", "elevate", "ultimate".
- Do NOT include dealership name.
- Must be materially different from this current title:
"${currentTitle}"
- Do not copy the current title text.
- Plain ASCII punctuation only.`;

    const response = await generateContent(prompt, {
      responseFormat: 'json_object',
      contentType: 'meta',
      temperature: 0.6,
      maxTokens: 120,
      tags: {
        feature: 'model-page-seo-regen',
        field: 'title',
        brandSlug,
        year,
        model: modelName,
      },
    });
    const parsed = regenerateSeoCandidatePage(response);
    let nextTitle = clampTitle(extractSeoTitleFromCandidate(parsed));
    if (!nextTitle) {
      // Looser extraction: tolerate plain-text or JSON-ish responses.
      nextTitle = clampTitle(extractSeoTitleFromRawResponse(response));
    }
    if (!nextTitle) {
      debugTrail.push('json_missing_title');
      console.warn('[seo-regen] Title candidate missing after JSON parse; using text fallback.', {
        brand,
        year,
        storeKey,
        slug,
        parsedKeys: parsed ? Object.keys(parsed) : [],
        responsePreview: String(response ?? '').slice(0, 400),
      });
      nextTitle = clampTitle(
        await generateSeoTitleTextFallback({
          year,
          make,
          modelName,
          city,
          state,
          county,
          evidence: seoEvidence,
          currentTitle,
          fallbackReason: 'json_missing_title',
          brandSlug,
        })
      );
    }
    const titleIssues = seoTitleQualityIssues({
      title: nextTitle,
      year,
      modelName,
      city,
      county,
    });
    if (nextTitle && titleIssues.length > 0) {
      debugTrail.push(`quality_retry:${titleIssues.join('|')}`);
      console.warn('[seo-regen] Title candidate failed quality gate; retrying once with rejection reason.', {
        brand,
        year,
        storeKey,
        slug,
        titleIssues,
        candidateTitle: nextTitle,
      });
      nextTitle = clampTitle(
        await generateSeoTitleTextFallback({
          year,
          make,
          modelName,
          city,
          state,
          county,
          evidence: seoEvidence,
          currentTitle,
          rejectionReason: titleIssues.join('; '),
          fallbackReason: 'quality_retry',
          brandSlug,
        })
      );
    }
    if (!nextTitle) {
      const debugSuffix =
        debugEnabled && debugTrail.length > 0 ? ` [debug: ${debugTrail.join(' > ')}]` : '';
      console.warn('[seo-regen] Title generation failed: no usable title from JSON or fallback.', {
        brand,
        year,
        storeKey,
        slug,
      });
      return {
        success: false,
        errors: [{ field: 'title', message: `No title returned from SEO regeneration.${debugSuffix}` }],
      };
    }
    if (nextTitle === currentTitle) {
      debugTrail.push('candidate_equals_current');
      const debugSuffix =
        debugEnabled && debugTrail.length > 0 ? ` [debug: ${debugTrail.join(' > ')}]` : '';
      console.warn('[seo-regen] Title generation failed: candidate equals current title.', {
        brand,
        year,
        storeKey,
        slug,
        currentTitle,
        candidateTitle: nextTitle,
      });
      return {
        success: false,
        errors: [
          {
            field: 'title',
            message: `Generated title matched existing text. Try regenerate again.${debugSuffix}`,
          },
        ],
      };
    }

    const updated: ModelYearPage = {
      ...existing,
      seo: {
        title: nextTitle,
        metaDescription: existing.seo?.metaDescription ?? '',
      },
    };
    const saveResult = await savePage(brand, year, storeKey, slug, updated);
    if (!saveResult.success) return { success: false, errors: saveResult.errors };

    return {
      success: true,
      data: {
        title: updated.seo?.title ?? '',
        description: updated.seo?.metaDescription ?? '',
      },
    };
  } catch (error) {
    console.error('regenerateSeoTitle:', error);
    const debugEnabled = process.env.NODE_ENV !== 'production';
    return {
      success: false,
      errors: [
        {
          field: 'general',
          message: debugEnabled
            ? `[debug:${(error as Error).name}] ${(error as Error).message}`
            : (error as Error).message,
        },
      ],
    };
  }
}

export async function regenerateSeoDescription(
  brand: string,
  year: number,
  storeKey: string | null,
  slug: string
): Promise<ModelPagesActionResult<{ title: string; description: string }>> {
  try {
    const debugEnabled = process.env.NODE_ENV !== 'production';
    const debugTrail: string[] = [];
    await requireAdmin();
    const configRoot = getModelPageConfigRoot();
    const filePath = getPageFilePath(configRoot, brand, year, storeKey, slug);
    if (!fs.existsSync(filePath)) {
      return { success: false, errors: [{ field: 'slug', message: 'Page not found' }] };
    }

    const existing = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ModelYearPage;
    const currentDescription = String(existing.seo?.metaDescription ?? '').trim();
    const brandSlug = brand.toLowerCase();
    const store = loadStore(configRoot, brandSlug, storeKey ?? null);
    const models = listModelsForYear(configRoot, brandSlug, year);
    const normalizedSlug = slug.toLowerCase().replace(/\.json$/, '');
    const spec =
      models.find((m) => slugify(m.displayName) === normalizedSlug) ??
      models.find((m) => m.displayName === existing.model);
    const make =
      store.brand?.trim() ||
      brandSlug.charAt(0).toUpperCase() + brandSlug.slice(1);
    const city = store.location?.city ?? 'Demotown';
    const state = store.location?.state ?? 'PA';
    const modelName = spec?.displayName ?? existing.model ?? normalizedSlug;
    const county = store.location?.county ?? '';
    const seoEvidence = (existing.whyBullets ?? [])
      .map((x) => String(x ?? '').trim())
      .filter(Boolean)
      .slice(0, 2);
    const comparisonGuardrail = getComparisonGuardrailForBrand(brandSlug);

    const prompt = `Return only valid JSON.
{
  "description": "..."
}

Write ONE SEO meta description for a vehicle model page.

Context:
- Model: ${year} ${make} ${modelName}
- Dealer location: ${city}, ${state}${county ? ` (${county})` : ''}
- Optional grounding points (use one naturally): ${seoEvidence.join(' | ') || 'N/A'}
- ${comparisonGuardrail}

Rules:
- 150-158 characters preferred (hard max 158).
- Mention 1 concrete, model-relevant strength (performance, tech, comfort, efficiency, cargo, etc.).
- Include local context naturally (city or county once max).
- Include a concise CTA at the end.
- Be specific and useful; avoid generic marketing fluff.
- Avoid filler words like "discover", "explore", "unleash", "elevate", "ultimate".
- Do NOT include dealership name.
- Must be materially different from this current description:
"${currentDescription}"
- Do not copy the current description text.
- Plain ASCII punctuation only.`;

    const response = await generateContent(prompt, {
      responseFormat: 'json_object',
      contentType: 'meta',
      temperature: 0.6,
      maxTokens: 180,
      tags: {
        feature: 'model-page-seo-regen',
        field: 'description',
        brandSlug,
        year,
        model: modelName,
      },
    });
    const parsed = regenerateSeoCandidatePage(response);
    let nextDescription = clampDescription(extractSeoDescriptionFromCandidate(parsed), '');
    if (!nextDescription) {
      // Looser extraction: tolerate plain-text or JSON-ish responses.
      nextDescription = clampDescription(extractSeoDescriptionFromRawResponse(response), '');
    }
    if (!nextDescription) {
      debugTrail.push('json_missing_description');
      console.warn('[seo-regen] Description candidate missing after JSON parse; using text fallback.', {
        brand,
        year,
        storeKey,
        slug,
        parsedKeys: parsed ? Object.keys(parsed) : [],
        responsePreview: String(response ?? '').slice(0, 400),
      });
      nextDescription = clampDescription(
        await generateSeoDescriptionTextFallback({
          year,
          make,
          modelName,
          city,
          state,
          county,
          evidence: seoEvidence,
          currentDescription,
          fallbackReason: 'json_missing_description',
          brandSlug,
        }),
        ''
      );
    }
    const descriptionIssues = seoDescriptionQualityIssues({
      description: nextDescription,
      modelName,
      city,
      county,
    });
    if (nextDescription && descriptionIssues.length > 0) {
      debugTrail.push(`quality_retry:${descriptionIssues.join('|')}`);
      console.warn('[seo-regen] Description candidate failed quality gate; retrying once with rejection reason.', {
        brand,
        year,
        storeKey,
        slug,
        descriptionIssues,
        candidateDescription: nextDescription.slice(0, 220),
      });
      nextDescription = clampDescription(
        await generateSeoDescriptionTextFallback({
          year,
          make,
          modelName,
          city,
          state,
          county,
          evidence: seoEvidence,
          currentDescription,
          rejectionReason: descriptionIssues.join('; '),
          fallbackReason: 'quality_retry',
          brandSlug,
        }),
        ''
      );
    }
    if (!nextDescription) {
      const debugSuffix =
        debugEnabled && debugTrail.length > 0 ? ` [debug: ${debugTrail.join(' > ')}]` : '';
      console.warn('[seo-regen] Description generation failed: no usable description from JSON or fallback.', {
        brand,
        year,
        storeKey,
        slug,
      });
      return {
        success: false,
        errors: [
          {
            field: 'description',
            message: `No description returned from SEO regeneration.${debugSuffix}`,
          },
        ],
      };
    }
    if (nextDescription === currentDescription) {
      debugTrail.push('candidate_equals_current');
      const debugSuffix =
        debugEnabled && debugTrail.length > 0 ? ` [debug: ${debugTrail.join(' > ')}]` : '';
      console.warn('[seo-regen] Description generation failed: candidate equals current description.', {
        brand,
        year,
        storeKey,
        slug,
        currentDescriptionPreview: currentDescription.slice(0, 220),
        candidateDescriptionPreview: nextDescription.slice(0, 220),
      });
      return {
        success: false,
        errors: [
          {
            field: 'description',
            message: `Generated description matched existing text. Try regenerate again.${debugSuffix}`,
          },
        ],
      };
    }

    const updated: ModelYearPage = {
      ...existing,
      seo: {
        title: existing.seo?.title ?? '',
        metaDescription: nextDescription,
      },
    };
    const saveResult = await savePage(brand, year, storeKey, slug, updated);
    if (!saveResult.success) return { success: false, errors: saveResult.errors };

    return {
      success: true,
      data: {
        title: updated.seo?.title ?? '',
        description: updated.seo?.metaDescription ?? '',
      },
    };
  } catch (error) {
    console.error('regenerateSeoDescription:', error);
    const debugEnabled = process.env.NODE_ENV !== 'production';
    return {
      success: false,
      errors: [
        {
          field: 'general',
          message: debugEnabled
            ? `[debug:${(error as Error).name}] ${(error as Error).message}`
            : (error as Error).message,
        },
      ],
    };
  }
}

export async function injectPageInternalLinks(
  brand: string,
  year: number,
  storeKey: string | null,
  slug: string
): Promise<ModelPagesActionResult<ModelYearPage>> {
  try {
    await requireAdmin();
    const configRoot = getModelPageConfigRoot();
    const brandSlug = brand.toLowerCase();
    const filePath = getPageFilePath(configRoot, brand, year, storeKey, slug);
    if (!fs.existsSync(filePath)) {
      return { success: false, errors: [{ field: 'slug', message: 'Page not found' }] };
    }

    const existing = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ModelYearPage;
    const store = loadStore(configRoot, brandSlug, storeKey ?? null);
    const models = listModelsForYear(configRoot, brandSlug, year);
    const normalizedSlug = slug.toLowerCase().replace(/\.json$/, '');
    const spec =
      models.find((m) => slugify(m.displayName) === normalizedSlug) ??
      models.find((m) => m.displayName === existing.model);

    if (!spec) {
      return {
        success: false,
        errors: [{ field: 'slug', message: 'Model spec not found' }],
      };
    }

    const linked = await injectInternalLinks(existing, store, spec, { brandSlug });
    const updated = withInternalLinkTargetSnapshot(
      applyLinkedSectionsToPage(existing, linked),
      store,
      brandSlug
    );

    const saveResult = await savePage(brand, year, storeKey, slug, updated);
    if (!saveResult.success) {
      return { success: false, errors: saveResult.errors };
    }

    return { success: true, data: updated };
  } catch (error) {
    console.error('injectPageInternalLinks:', error);
    return {
      success: false,
      errors: [{ field: 'general', message: (error as Error).message }],
    };
  }
}

export async function discardPage(
  brand: string,
  year: number,
  storeKey: string | null,
  slug: string
): Promise<ModelPagesActionResult<void>> {
  try {
    await requireAdmin();
    const configRoot = getModelPageConfigRoot();
    const filePath = getPageFilePath(configRoot, brand, year, storeKey, slug);
    if (!fs.existsSync(filePath)) {
      return { success: true };
    }
    fs.unlinkSync(filePath);
    return { success: true };
  } catch (error) {
    console.error('discardPage:', error);
    return {
      success: false,
      errors: [{ field: 'general', message: (error as Error).message }],
    };
  }
}

export async function getPageHtml(
  brand: string,
  year: number,
  storeKey: string | null,
  slug: string
): Promise<ModelPagesActionResult<string>> {
  try {
    await requireAdmin();
    const contentResult = await getPageContent(brand, year, storeKey, slug);
    if (!contentResult.success || !contentResult.data) {
      return {
        success: false,
        errors: contentResult.errors ?? [{ field: 'general', message: 'Page not found' }],
      };
    }
    const configRoot = getModelPageConfigRoot();
    const store = loadStore(configRoot, brand.toLowerCase(), storeKey);
    const brandSlug = brand.toLowerCase();
    const templatePath = resolveModelYearTemplatePath(brandSlug);
    const templateHtml = fs.readFileSync(templatePath, 'utf8');

    const renderModule = require('@/lab/modelpager/scripts/render-model-page') as {
      renderModelYearPage: (template: string, store: unknown, page: unknown) => string;
      renderBrandLineupPage: (template: string, store: unknown, page: unknown, modelPages: unknown[]) => string;
    };

    const pageData = { ...contentResult.data } as Record<string, unknown>;
    let storeForRender: Record<string, unknown> = { ...store } as Record<string, unknown>;

    if (isDemoMode()) {
      storeForRender = {
        ...storeForRender,
        assets: { r2BaseUrl: demoModelPageAssetBaseUrl() },
      };
      const images = pageData.images as
        | { hero?: { path?: string }; vehicleJellybean?: { path?: string } }
        | undefined;
      if (images?.hero?.path) {
        images.hero.path = rewriteProdAssetPathForDemo(images.hero.path);
      }
      if (images?.vehicleJellybean?.path) {
        images.vehicleJellybean.path = rewriteProdAssetPathForDemo(images.vehicleJellybean.path);
      }
    }

    const html = renderModule.renderModelYearPage(templateHtml, storeForRender, pageData);
    return { success: true, data: html };
  } catch (error) {
    console.error('getPageHtml:', error);
    return {
      success: false,
      errors: [{ field: 'general', message: (error as Error).message }],
    };
  }
}

export async function getLineupSummary(
  brand: string,
  year: number,
  storeKey: string | null
): Promise<
  ModelPagesActionResult<
    { slug: string; url: string; title: string; description: string } | null
  >
> {
  try {
    await requireAdmin();
    const configRoot = getModelPageConfigRoot();
    const brandSlug = brand.toLowerCase();
    const dir = joinModelPagerPagesDir(configRoot, brandSlug, year, storeKey);
    if (!fs.existsSync(dir)) {
      return { success: true, data: null };
    }
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.includes('-models-'));
    for (const f of files) {
      const slug = f.replace(/\.json$/, '');
      const filePath = path.join(dir, f);
      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const page = JSON.parse(raw) as ModelYearPage & { pageType?: string; storeKey?: string | null };
        if (page.pageType !== 'brand-lineup') continue;
        if (
          !modelPagerPageMatchesStoreScope(configRoot, brandSlug, storeKey, page.storeKey)
        ) {
          continue;
        }
        return {
          success: true,
          data: {
            slug,
            url: page.pagePath ?? '',
            title: page.seo?.title ?? '',
            description: page.seo?.metaDescription ?? '',
          },
        };
      } catch {
        continue;
      }
    }
    return { success: true, data: null };
  } catch (error) {
    console.error('getLineupSummary:', error);
    return {
      success: false,
      errors: [{ field: 'general', message: (error as Error).message }],
    };
  }
}

type BrandLineupPage = ModelYearPage & {
  pageType?: string;
  brand?: string;
  heroFine?: string;
  models?: string[];
  modelsIntro?: string;
  cards?: Record<string, { teaserOverride?: string; ctaLabelOverride?: string }>;
};

function normalizeBrandDisplay(brandRaw: string): string {
  const slug = String(brandRaw || '').trim().toLowerCase();
  if (slug === 'bmw') return 'BMW';
  if (slug === 'lexus') return 'Lexus';
  if (slug === 'toyota') return 'Toyota';
  return slug ? slug.charAt(0).toUpperCase() + slug.slice(1) : '';
}

function findLineupPageInScope(
  configRoot: string,
  brand: string,
  year: number,
  storeKey: string | null
): { slug: string; filePath: string; page: BrandLineupPage } | null {
  const brandSlug = brand.toLowerCase();
  const dir = joinModelPagerPagesDir(configRoot, brandSlug, year, storeKey);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.includes('-models-'));
  for (const f of files) {
    const slug = f.replace(/\.json$/, '');
    const filePath = path.join(dir, f);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const page = JSON.parse(raw) as BrandLineupPage & { storeKey?: string | null };
      if (page.pageType !== 'brand-lineup') continue;
      if (!modelPagerPageMatchesStoreScope(configRoot, brandSlug, storeKey, page.storeKey)) {
        continue;
      }
      return { slug, filePath, page };
    } catch {
      continue;
    }
  }
  return null;
}

function writeLineupPage(filePath: string, page: BrandLineupPage): void {
  fs.writeFileSync(filePath, JSON.stringify(normalizePunctuation(page), null, 2) + '\n', 'utf8');
}

export async function regenerateLineupSeoTitle(
  brand: string,
  year: number,
  storeKey: string | null
): Promise<ModelPagesActionResult<{ slug: string; title: string; description: string }>> {
  try {
    await requireAdmin();
    const configRoot = getModelPageConfigRoot();
    const found = findLineupPageInScope(configRoot, brand, year, storeKey);
    if (!found) {
      return {
        success: false,
        errors: [{ field: 'general', message: 'No lineup page found for this scope' }],
      };
    }

    const brandSlug = brand.toLowerCase();
    const store = loadStore(configRoot, brandSlug, storeKey ?? null);
    const city = store.location?.city ?? 'Demotown';
    const state = store.location?.state ?? 'PA';
    const county = store.location?.county ?? '';
    const brandDisplay = normalizeBrandDisplay(found.page.brand ?? found.page.make ?? brandSlug);
    const currentTitle = String(found.page.seo?.title ?? '').trim();
    const currentDescription = String(found.page.seo?.metaDescription ?? '').trim();
    const modelCount = Array.isArray(found.page.models) ? found.page.models.length : 0;

    const prompt = `Return only valid JSON.
{
  "title": "..."
}

Write ONE SEO title for a model-lineup page.

Context:
- Page type: model lineup
- Brand: ${brandDisplay}
- Year: ${year}
- Local market: ${city}, ${state}${county ? ` (${county})` : ''}
- Models listed: ${modelCount > 0 ? `${modelCount} models` : 'full lineup'}

Rules:
- 50-60 characters preferred (hard max 60).
- Must include "${year} ${brandDisplay}" and "Lineup" once.
- Include local intent naturally (city or county once max).
- Do NOT include dealership name.
- Must be materially different from this current title:
"${currentTitle}"
- Output JSON only.`;

    const response = await generateContent(prompt, {
      responseFormat: 'json_object',
      contentType: 'meta',
      temperature: 0.55,
      maxTokens: 110,
      tags: {
        feature: 'model-lineup-seo-regen',
        field: 'title',
        brandSlug,
        year,
      },
    });
    const parsed = regenerateSeoCandidatePage(response);
    let title = clampTitle(extractSeoTitleFromCandidate(parsed));
    if (!title) {
      title = clampTitle(extractSeoTitleFromRawResponse(response));
    }
    if (!title) {
      return { success: false, errors: [{ field: 'title', message: 'No title returned' }] };
    }
    if (title === currentTitle) {
      return {
        success: false,
        errors: [{ field: 'title', message: 'Generated title matched existing text. Try again.' }],
      };
    }

    const updated: BrandLineupPage = {
      ...found.page,
      seo: {
        ...(found.page.seo ?? { title: '', metaDescription: '' }),
        title,
        metaDescription: currentDescription,
      },
    };
    writeLineupPage(found.filePath, updated);
    return {
      success: true,
      data: {
        slug: found.slug,
        title: updated.seo?.title ?? '',
        description: updated.seo?.metaDescription ?? '',
      },
    };
  } catch (error) {
    console.error('regenerateLineupSeoTitle:', error);
    return {
      success: false,
      errors: [{ field: 'general', message: (error as Error).message }],
    };
  }
}

export async function regenerateLineupSeoDescription(
  brand: string,
  year: number,
  storeKey: string | null
): Promise<ModelPagesActionResult<{ slug: string; title: string; description: string }>> {
  try {
    await requireAdmin();
    const configRoot = getModelPageConfigRoot();
    const found = findLineupPageInScope(configRoot, brand, year, storeKey);
    if (!found) {
      return {
        success: false,
        errors: [{ field: 'general', message: 'No lineup page found for this scope' }],
      };
    }

    const brandSlug = brand.toLowerCase();
    const store = loadStore(configRoot, brandSlug, storeKey ?? null);
    const city = store.location?.city ?? 'Demotown';
    const state = store.location?.state ?? 'PA';
    const county = store.location?.county ?? '';
    const brandDisplay = normalizeBrandDisplay(found.page.brand ?? found.page.make ?? brandSlug);
    const currentTitle = String(found.page.seo?.title ?? '').trim();
    const currentDescription = String(found.page.seo?.metaDescription ?? '').trim();

    const prompt = `Return only valid JSON.
{
  "description": "..."
}

Write ONE SEO meta description for a model-lineup page.

Context:
- Page type: ${year} ${brandDisplay} model lineup
- Local market: ${city}, ${state}${county ? ` (${county})` : ''}

Rules:
- 145-158 characters preferred (hard max 158).
- Mention lineup breadth (cars, SUVs, EVs, performance models, or trims) in natural language.
- Include local context once (city or county).
- End with a short CTA.
- Do NOT include dealership name.
- Must be materially different from this current description:
"${currentDescription}"
- Output JSON only.`;

    const response = await generateContent(prompt, {
      responseFormat: 'json_object',
      contentType: 'meta',
      temperature: 0.6,
      maxTokens: 170,
      tags: {
        feature: 'model-lineup-seo-regen',
        field: 'description',
        brandSlug,
        year,
      },
    });
    const parsed = regenerateSeoCandidatePage(response);
    let description = clampDescription(extractSeoDescriptionFromCandidate(parsed), '');
    if (!description) {
      description = clampDescription(extractSeoDescriptionFromRawResponse(response), '');
    }
    if (!description) {
      return {
        success: false,
        errors: [{ field: 'description', message: 'No description returned' }],
      };
    }

    if (description === currentDescription) {
      const retryPrompt = `Write ONE alternate SEO meta description for this lineup page.

Context:
- Page: ${year} ${brandDisplay} model lineup
- Local market: ${city}, ${state}${county ? ` (${county})` : ''}

Rules:
- Plain text only.
- 145-158 characters preferred (hard max 158).
- Must be materially different from this exact existing description:
"${currentDescription}"
- Mention lineup breadth in natural language and end with a short CTA.
- Do NOT include dealership name.`;

      const retry = await generateContent(retryPrompt, {
        responseFormat: 'text',
        contentType: 'meta',
        temperature: 0.75,
        maxTokens: 150,
        tags: {
          feature: 'model-lineup-seo-regen',
          field: 'description-retry',
          brandSlug,
          year,
        },
      });
      description = clampDescription(extractSeoDescriptionFromRawResponse(String(retry ?? '')), '');
    }

    if (description === currentDescription) {
      return {
        success: false,
        errors: [
          {
            field: 'description',
            message: 'Generated description matched existing text. Try again.',
          },
        ],
      };
    }

    const updated: BrandLineupPage = {
      ...found.page,
      seo: {
        ...(found.page.seo ?? { title: '', metaDescription: '' }),
        title: currentTitle,
        metaDescription: description,
      },
    };
    writeLineupPage(found.filePath, updated);
    return {
      success: true,
      data: {
        slug: found.slug,
        title: updated.seo?.title ?? '',
        description: updated.seo?.metaDescription ?? '',
      },
    };
  } catch (error) {
    console.error('regenerateLineupSeoDescription:', error);
    return {
      success: false,
      errors: [{ field: 'general', message: (error as Error).message }],
    };
  }
}

export async function getLineupHtml(
  brand: string,
  year: number,
  storeKey: string | null
): Promise<ModelPagesActionResult<string>> {
  try {
    await requireAdmin();
    const configRoot = getModelPageConfigRoot();
    const brandSlug = brand.toLowerCase();
    const dir = joinModelPagerPagesDir(configRoot, brandSlug, year, storeKey);
    if (!fs.existsSync(dir)) {
      return {
        success: false,
        errors: [{ field: 'general', message: 'No pages directory for this scope' }],
      };
    }
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.includes('-models-'));
    let lineupPage: (ModelYearPage & { pageType?: string }) | null = null;
    const modelPages: ModelYearPage[] = [];
    for (const f of files) {
      const filePath = path.join(dir, f);
      const raw = fs.readFileSync(filePath, 'utf8');
      const page = JSON.parse(raw) as ModelYearPage & { pageType?: string; storeKey?: string | null };
      if (page.pageType === 'brand-lineup') {
        if (lineupPage) continue;
        if (
          !modelPagerPageMatchesStoreScope(configRoot, brandSlug, storeKey, page.storeKey)
        ) {
          continue;
        }
        lineupPage = page;
      } else {
        if (
          !modelPagerPageMatchesStoreScope(configRoot, brandSlug, storeKey, page.storeKey)
        ) {
          continue;
        }
        if (!page.canonicalUrl && page.pagePath) {
          const storeUrlBase =
            (loadStore(configRoot, brandSlug, storeKey ?? null).siteUrl as string | undefined) ?? '';
          page.canonicalUrl = storeUrlBase ? new URL(page.pagePath, storeUrlBase).toString() : page.pagePath;
        }
        modelPages.push(page);
      }
    }
    if (!lineupPage) {
      return {
        success: false,
        errors: [{ field: 'general', message: 'No lineup page found for this scope' }],
      };
    }

    const store = loadStore(configRoot, brandSlug, storeKey ?? null);
    const templatePath = resolveBrandLineupTemplatePath(brandSlug);
    const templateHtml = fs.readFileSync(templatePath, 'utf8');

    const renderModule = require('@/lab/modelpager/scripts/render-model-page') as {
      renderBrandLineupPage: (
        template: string,
        store: unknown,
        lineupPage: unknown,
        modelPages: unknown[]
      ) => string;
    };
    const html = renderModule.renderBrandLineupPage(templateHtml, store, lineupPage, modelPages);
    return { success: true, data: html };
  } catch (error) {
    console.error('getLineupHtml:', error);
    return {
      success: false,
      errors: [{ field: 'general', message: (error as Error).message }],
    };
  }
}

export type GenerationWriteDiagnostics = {
  gateResults: GateResult[];
  attemptCounts: number[];
  validationWarnings: { slug: string; messages: string[] }[];
};

export async function runGenerationAndWrite(
  brand: string,
  year: number,
  storeKey: string | null,
  modelSlugs: string[] | null,
  options?: { maxPerRun?: number; useLlm?: boolean }
): Promise<
  ModelPagesActionResult<
    { pages: ModelYearPage[]; written: number } & GenerationWriteDiagnostics
  >
> {
  try {
    await requireAdmin();
    const configRoot = getModelPageConfigRoot();
    const { pages, gateResults, attemptCounts } = await runGeneration(configRoot, {
      brand: brand.toLowerCase(),
      year,
      storeKey: storeKey ?? undefined,
      modelSlugs: modelSlugs ?? undefined,
      maxPerRun: options?.maxPerRun ?? 10,
      useLlm: options?.useLlm ?? true,
    });

    const store = loadStore(configRoot, brand.toLowerCase(), storeKey ?? null);
    const cityRaw = store.location?.city ?? 'Demotown';
    const city = cityRaw.toLowerCase().replace(/\s+/g, '-');
    const state = (store.location?.state ?? 'PA').toLowerCase();
    const brandSlug = brand.toLowerCase();
    const outDir = joinModelPagerPagesDir(configRoot, brandSlug, year, storeKey);
    fs.mkdirSync(outDir, { recursive: true });

    const normalizedPages = pages.map((page) => normalizePunctuation(page));
    let written = 0;
    const validationWarnings: { slug: string; messages: string[] }[] = [];
    for (const page of normalizedPages) {
      const expectedSlug = slugify(page.model);
      const errors = validatePage(page, {
        expectedSlug,
        expectedPagePath: `/new-${brandSlug}/${year}-${brandSlug}-${expectedSlug}-${city}-${state}.htm`,
        brand: brandSlug,
      });
      if (errors.length > 0) {
        validationWarnings.push({
          slug: expectedSlug,
          messages: errors.map((e) => e.message),
        });
        console.warn(
          `Page validation errors for ${expectedSlug}:`,
          errors.map((e) => e.message).join('; ')
        );
      }
    }

    if (validationWarnings.length > 0) {
      return {
        success: false,
        errors: [
          {
            field: 'general',
            message: `Page validation failed for ${validationWarnings.length} model(s); no files were written.`,
          },
        ],
      };
    }

    for (const page of normalizedPages) {
      const expectedSlug = slugify(page.model);
      const filePath = path.join(outDir, `${expectedSlug}.json`);
      fs.writeFileSync(filePath, JSON.stringify(page, null, 2) + '\n', 'utf8');
      writeModelYearDistHtml(configRoot, brandSlug, store, page);
      written++;
    }

    return {
      success: true,
      data: {
        pages: normalizedPages,
        written,
        gateResults,
        attemptCounts,
        validationWarnings,
      },
    };
  } catch (error) {
    console.error('runGenerationAndWrite:', error);
    return {
      success: false,
      errors: [{ field: 'general', message: (error as Error).message }],
    };
  }
}

export async function generateMissingModelPageConfig(
  brand: string,
  year: number,
  model: string,
): Promise<ModelPagesActionResult<{ writtenPaths: string[] }>> {
  try {
    await requireAdmin();

    const brandSlug = brand.toLowerCase().trim();
    const modelName = model.trim();
    if (!brandSlug || !modelName || !Number.isFinite(year)) {
      return {
        success: false,
        errors: [{ field: 'general', message: 'Missing or invalid brand, year, or model.' }],
      };
    }

    const configRoot = getModelPageConfigRoot();
    const storeKeys: Array<string | null> =
      brandSlug === 'lexus' ? ['lexdt', 'lexwg'] : [null];
    const slug = slugify(modelName);
    const writtenPaths: string[] = [];

    for (const storeKey of storeKeys) {
      const store = loadStore(configRoot, brandSlug, storeKey);
      const make =
        store.brand?.trim() ||
        (brandSlug.charAt(0).toUpperCase() + brandSlug.slice(1));

      // Default category keeps generated structure valid; can be refined later in model-page editor.
      const page = generatePage(
        store,
        {
          displayName: modelName,
          category: 'default',
        },
        0,
        { make, year, brandSlug },
      );

      const persistResult = persistModelYearPage(
        configRoot,
        brandSlug,
        year,
        storeKey,
        slug,
        page,
      );
      if (!persistResult.success) {
        return {
          success: false,
          errors: persistResult.errors ?? [
            { field: 'general', message: `Failed to persist config for ${modelName}.` },
          ],
        };
      }

      writtenPaths.push(
        getPageFilePath(configRoot, brandSlug, year, storeKey, slug),
      );
    }

    revalidatePath('/admin');
    revalidatePath('/admin/model-pages');

    return { success: true, data: { writtenPaths } };
  } catch (error) {
    console.error('generateMissingModelPageConfig:', error);
    return {
      success: false,
      errors: [{ field: 'general', message: (error as Error).message }],
    };
  }
}
