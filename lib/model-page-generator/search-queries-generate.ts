/**
 * Generate search-query .txt files via Anthropic (Claude).
 * Used by CLI backfill and admin refreshSearchQueries.
 */

import * as fs from "fs";
import * as path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { resolveModelPagerMaxOutputTokens } from "./llm-client";
import { normalizeSearchQueryLines } from "./search-queries";
import { prisma } from "@/lib/prisma";
import { estimateCostUsd } from "@/lib/openai-pricing";

const DEFAULT_MODEL =
  process.env.ANTHROPIC_MODEL_QUERIES ?? "claude-haiku-4-5";

export interface GenerateSearchQueriesFileParams {
  configsDir: string;
  brandSlug: string;
  year: number;
  slug: string;
  displayName: string;
  make: string;
  /** Optional vehicle category for richer queries (e.g. electric, luxury-suv). */
  category?: string;
  /** Override Anthropic model id. */
  model?: string;
}

let _anthropic: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error("ANTHROPIC_API_KEY is required to generate search queries");
  }
  if (_anthropic == null) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

function buildUserPrompt(params: {
  brandSlug: string;
  year: number;
  make: string;
  displayName: string;
  category?: string;
}): string {
  const cat =
    params.category && params.category.trim()
      ? ` Vehicle category: ${params.category}.`
      : "";
  const brand = params.brandSlug.toLowerCase();
  const brandGuidance =
    brand === "bmw"
      ? `Brand tuning (BMW):
- Prioritize performance-luxury shopping intent: trims/packages, xDrive vs RWD, M Sport/performance variants, handling, tech features, lease specials.
- Comparison queries should often include key luxury/performance rivals (e.g., Audi, Mercedes-Benz, Porsche where relevant).
- NEVER compare BMW against Lexus or Toyota.
- Use premium-performance language naturally, but keep it query-like, not ad copy.`
      : brand === "lexus"
        ? `Brand tuning (Lexus):
- Prioritize refinement/reliability intent: hybrid efficiency, comfort/quiet ride, ownership cost, safety/tech, trim value.
- Comparison queries should often include luxury rivals with reliability/value framing (e.g., Acura, Mercedes-Benz, Genesis, Volvo where relevant).
- NEVER compare Lexus against BMW or Toyota.
- Use calm premium language naturally, but keep it as realistic shopper search phrasing.`
        : `Brand tuning (Toyota):
- Prioritize practical value intent: reliability, MPG/hybrid range, family utility, AWD/winter use, resale value, financing and monthly payment searches.
- Comparison queries should often include mainstream rivals by segment (e.g., Honda, Hyundai, Kia, Nissan, Subaru where relevant).
- NEVER compare Toyota against BMW or Lexus.
- Keep language practical and transactional, matching real high-volume shopper phrasing.`;

  return `You help SEO researchers for a car dealer. Output realistic, high-intent Google-style search queries that shoppers type for THIS exact model-year.

Model: ${params.year} ${params.make} ${params.displayName}.${cat}

${brandGuidance}

Rules:
- Output ONLY plain text: one query per line, no numbering, no bullets, no markdown, no commentary.
- Write exactly 15 lines.
- Every line must clearly reference this exact model or model-year phrase (not generic brand-only queries).
- Include the year naturally in most lines (e.g. "2026 ${params.make.toLowerCase()} ...").
- Mix intents with strong commercial coverage:
  - 4-5 transactional queries (price, lease, finance, APR, incentives, payment, deals, for sale, inventory)
  - 3-4 comparison queries (vs specific competitors in the same class)
  - 3-4 feature/use-case queries (MPG/range, charging, cargo, AWD/snow, reliability, tech/safety)
  - 2-3 trim/spec queries
- Include "near me" or local-intent phrasing in 3-5 lines, but do not repeat the same local pattern every time.
- Keep query lengths varied (about 4-12 words) and phrasing diverse.
- Do not include dealer names, URLs, or punctuation-heavy gimmicks.
- No duplicates or near-duplicates.`;
}

/**
 * Call Claude and return normalized query lines (does not write disk).
 */
export async function generateSearchQueriesLines(
  params: GenerateSearchQueriesFileParams
): Promise<string[]> {
  const model = params.model ?? DEFAULT_MODEL;
  const prompt = buildUserPrompt({
    brandSlug: params.brandSlug,
    year: params.year,
    make: params.make,
    displayName: params.displayName,
    category: params.category,
  });

  const startedAt = Date.now();
  let message: Awaited<ReturnType<Anthropic["messages"]["create"]>>;
  try {
    message = await getClient().messages.create({
      model,
      max_tokens: resolveModelPagerMaxOutputTokens(2048),
      messages: [{ role: "user", content: prompt }],
    });
  } catch (error) {
    try {
      await prisma.openAIRequestLog.create({
        data: {
          model,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          durationMs: Date.now() - startedAt,
          estimatedCostUsd: 0,
          status: "error",
          errorText: String(error).slice(0, 2000),
          tags: {
            feature: "model-page-search-queries",
            provider: "anthropic",
            apiPath: "anthropic-messages",
            brand: params.brandSlug,
            year: params.year,
            slug: params.slug,
            model: params.displayName,
          } as any,
        },
      });
    } catch {
      // Ignore logging failures; preserve original error.
    }
    throw error;
  }

  const inputTokens = (message as any).usage?.input_tokens ?? 0;
  const outputTokens = (message as any).usage?.output_tokens ?? 0;
  const totalTokens = inputTokens + outputTokens;
  const durationMs = Date.now() - startedAt;
  const estimatedCostUsd = estimateCostUsd(model, inputTokens, outputTokens);
  try {
    await prisma.openAIRequestLog.create({
      data: {
        model,
        inputTokens,
        outputTokens,
        totalTokens,
        durationMs,
        estimatedCostUsd,
        status: "success",
        openaiResponseId: (message as any).id ?? null,
        tags: {
          feature: "model-page-search-queries",
          provider: "anthropic",
          apiPath: "anthropic-messages",
          brand: params.brandSlug,
          year: params.year,
          slug: params.slug,
          model: params.displayName,
        } as any,
      },
    });
  } catch {
    // Ignore logging failures.
  }

  const parts: string[] = [];
  for (const block of message.content) {
    if (block.type === "text" && "text" in block) {
      parts.push(block.text);
    }
  }
  const raw = parts.join("\n");
  return normalizeSearchQueryLines(raw);
}

/**
 * Writes search-queries/<brand>/<year>/<slug>.txt (UTF-8). Creates parent dirs.
 */
export async function generateAndWriteSearchQueriesFile(
  params: GenerateSearchQueriesFileParams
): Promise<{ filePath: string; lineCount: number }> {
  const brand = params.brandSlug.toLowerCase();
  const slug = params.slug.toLowerCase().replace(/\.json$/, "");
  const lines = await generateSearchQueriesLines({ ...params, slug });
  if (lines.length < 5) {
    throw new Error(
      `Model returned too few search queries (${lines.length}); expected at least 5`
    );
  }

  const dir = path.join(params.configsDir, "search-queries", brand, String(params.year));
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${slug}.txt`);
  const body = lines.join("\n") + "\n";
  fs.writeFileSync(filePath, body, "utf8");
  return { filePath, lineCount: lines.length };
}
