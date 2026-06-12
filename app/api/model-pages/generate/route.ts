import * as fs from 'fs';
import * as path from 'path';
import { NextResponse } from 'next/server';
import { requireAdmin, requireUserId } from '@/lib/auth';
import { isDemoMode } from '@/lib/config/demo';
import {
  checkDemoLlmRateLimit,
  DEMO_LLM_KEY_REQUIRED_CODE,
  demoLlmKeyRequiredMessage,
  isDemoLlmByokEnabled,
  resolveDemoByokApiKey,
} from '@/lib/config/demo-llm';
import { getModelPageConfigRoot } from '@/lib/model-page-generator/config-path';
import { joinModelPagerPagesDir } from '@/lib/model-page-generator/paths';
import { runGeneration, loadStore } from '@/lib/model-page-generator/run';
import { normalizePunctuation, slugify, validatePage } from '@/lib/model-page-generator';
import { writeModelYearDistHtml } from '@/lib/model-page-generator/dist-writer';
import { llmApiKeyOverride } from '@/lib/model-page-generator/llm-client';

const DEFAULT_MAX_PER_RUN = 10;

/** Allow long LLM runs (per-model content + internal-link passes) on Vercel. */
export const maxDuration = 300;

export async function POST(request: Request) {
  if (isDemoMode()) {
    if (!isDemoLlmByokEnabled()) {
      return NextResponse.json(
        { error: 'Model page generation is disabled in demo mode' },
        { status: 403 },
      );
    }
    const byokKey = resolveDemoByokApiKey(request);
    if (!byokKey) {
      return NextResponse.json(
        {
          error: demoLlmKeyRequiredMessage(),
          code: DEMO_LLM_KEY_REQUIRED_CODE,
        },
        { status: 403 },
      );
    }
    let userId: string;
    try {
      userId = await requireUserId();
    } catch {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const rate = checkDemoLlmRateLimit(userId, request);
    if (!rate.ok) {
      return NextResponse.json(
        { error: 'Demo LLM rate limit exceeded', retryAfterSec: rate.retryAfterSec },
        { status: 429 },
      );
    }
    const provider = (process.env.LLM_PROVIDER ?? 'anthropic').toLowerCase();
    const override =
      provider === 'openai'
        ? { openaiApiKey: byokKey }
        : { anthropicApiKey: byokKey };
    return llmApiKeyOverride.run(override, () => handleGenerate(request));
  }

  let userId: string;
  try {
    userId = await requireAdmin();
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  void userId;
  return handleGenerate(request);
}

async function handleGenerate(request: Request) {
  let body: {
    brand: string;
    year: number;
    storeKey?: string | null;
    modelSlugs?: string[] | null;
    maxPerRun?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { brand, year, storeKey = null, modelSlugs = null, maxPerRun } = body;
  if (!brand || typeof year !== 'number') {
    return NextResponse.json(
      { error: 'Missing or invalid brand or year' },
      { status: 400 }
    );
  }

  const cap =
    typeof maxPerRun === 'number' && maxPerRun > 0 && maxPerRun <= 50
      ? maxPerRun
      : DEFAULT_MAX_PER_RUN;

  try {
    const configRoot = getModelPageConfigRoot();
    const { pages, gateResults, attemptCounts, totalElapsedMs, perPageElapsedMs } = await runGeneration(configRoot, {
      brand: brand.toLowerCase(),
      year,
      storeKey: storeKey ?? undefined,
      modelSlugs: modelSlugs ?? undefined,
      maxPerRun: cap,
      useLlm: true,
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
      return NextResponse.json(
        {
          error: 'Page validation failed; no files were written.',
          validationWarnings,
        },
        { status: 422 }
      );
    }

    for (const page of normalizedPages) {
      const expectedSlug = slugify(page.model);
      const filePath = path.join(outDir, `${expectedSlug}.json`);
      fs.writeFileSync(filePath, JSON.stringify(page, null, 2) + '\n', 'utf8');
      writeModelYearDistHtml(configRoot, brandSlug, store, page);
      written++;
    }

    return NextResponse.json({
      success: true,
      pages: pages.length,
      written,
      slugs: normalizedPages.map((p) => slugify(p.model)),
      gateSummary: gateResults.map((g, i) => ({
        slug: normalizedPages[i] ? slugify(normalizedPages[i]!.model) : '',
        passed: g.passed,
        failures: g.failures,
        attempts: attemptCounts[i] ?? 0,
      })),
      totalElapsedMs,
      perPageElapsedMs,
      validationWarnings,
    });
  } catch (error) {
    console.error('POST /api/model-pages/generate:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
