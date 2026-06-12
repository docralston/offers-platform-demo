/**
 * Estimated USD cost from token counts. Rates are **standard** API tier (not Batch / Flex / Priority).
 *
 * Sources (verify periodically):
 * - OpenAI: https://platform.openai.com/docs/pricing (Flagship models, Standard)
 * - Anthropic: https://docs.anthropic.com/en/docs/about-claude/pricing (Base input + output)
 *
 * Values are **USD per 1K tokens** = (price per 1M tokens) / 1000.
 */

/** Last manual pricing table review (displayed on /admin/ai-usage). */
export const PRICING_AS_OF = '2026-06-01';

/** OpenAI / Anthropic publish $ per 1M tokens; we store $ per 1K. */
function per1M(inputPerM: number, outputPerM: number): {
  input: number;
  output: number;
} {
  return { input: inputPerM / 1000, output: outputPerM / 1000 };
}

export const MODEL_PRICING_PER_1K: Record<string, { input: number; output: number }> = {
  // OpenAI — standard flagship (platform.openai.com/docs/pricing)
  "gpt-5.4": per1M(2.5, 15),
  "gpt-5.4-mini": per1M(0.75, 4.5),
  "gpt-5.4-nano": per1M(0.2, 1.25),
  "gpt-5.4-pro": per1M(30, 180),
  "gpt-5.2": per1M(1.75, 14),
  "gpt-5.2-pro": per1M(21, 168),
  "gpt-5.1": per1M(1.25, 10),
  "gpt-5": per1M(1.25, 10),
  "gpt-5-mini": per1M(0.25, 2),
  "gpt-5-nano": per1M(0.05, 0.4),
  "gpt-5-pro": per1M(15, 120),
  "gpt-4.1": per1M(2, 8),
  "gpt-4.1-mini": per1M(0.4, 1.6),
  "gpt-4.1-nano": per1M(0.1, 0.4),
  "gpt-4o": per1M(2.5, 10),
  "gpt-4o-2024-05-13": per1M(5, 15),
  "gpt-4o-mini": per1M(0.15, 0.6),
  o1: per1M(15, 60),
  "o1-mini": per1M(1.1, 4.4),
  o3: per1M(2, 8),
  "o3-mini": per1M(1.1, 4.4),
  "o3-pro": per1M(20, 80),
  "o4-mini": per1M(1.1, 4.4),

  // Anthropic — base input + output (docs.anthropic.com pricing table)
  "claude-haiku-4-5": per1M(1, 5),
  "claude-3-5-haiku-latest": per1M(0.8, 4),
  "claude-3-5-haiku": per1M(0.8, 4),
  "claude-3-5-sonnet-latest": per1M(3, 15),
  "claude-3-5-sonnet": per1M(3, 15),
  "claude-sonnet-4-6": per1M(3, 15),
  "claude-sonnet-4-5": per1M(3, 15),
  "claude-sonnet-4": per1M(3, 15),
  "claude-opus-4-6": per1M(5, 25),
  "claude-opus-4-5": per1M(5, 25),
  "claude-opus-4-1": per1M(15, 75),
  "claude-opus-4": per1M(15, 75),
  "claude-haiku-3": per1M(0.25, 1.25),
};

function lookupPricingTable(model: string): { input: number; output: number } | null {
  return MODEL_PRICING_PER_1K[model] ?? null;
}

/**
 * Resolve vendor model id (including dated snapshots) to a pricing row.
 */
export function resolveLlmPricing(
  model: string
): { input: number; output: number } | null {
  const raw = model.trim();
  if (!raw) return null;

  const direct = lookupPricingTable(raw);
  if (direct) return direct;

  const lower = raw.toLowerCase();

  // OpenAI dated snapshots: gpt-5-mini-2025-08-07
  const openaiUndated = lower.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  if (openaiUndated !== lower) {
    const p = lookupPricingTable(openaiUndated);
    if (p) return p;
  }

  // Anthropic dated snapshots: claude-haiku-4-5-20251001
  const anthropicUndated = lower.replace(/-\d{8}$/, "");
  if (anthropicUndated !== lower) {
    const p = lookupPricingTable(anthropicUndated);
    if (p) return p;
  }

  // Longest-prefix match for OpenAI gpt-5.* / gpt-4.*
  const openaiPrefixes = [
    "gpt-5.4-mini",
    "gpt-5.4-nano",
    "gpt-5.4-pro",
    "gpt-5.4",
    "gpt-5.2-pro",
    "gpt-5.2",
    "gpt-5.1",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-5-pro",
    "gpt-5",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4.1",
    "gpt-4o-mini",
    "gpt-4o",
  ] as const;
  for (const prefix of openaiPrefixes) {
    if (lower === prefix || lower.startsWith(`${prefix}-`)) {
      const p = lookupPricingTable(prefix);
      if (p) return p;
    }
  }

  // Anthropic: family patterns (API ids vary)
  if (lower.includes("haiku") && /4[-_.]?5|4_5/.test(lower)) {
    return lookupPricingTable("claude-haiku-4-5");
  }
  if (
    lower.includes("haiku") &&
    (lower.includes("3-5") || lower.includes("3_5") || lower.includes("haiku-3"))
  ) {
    return lookupPricingTable("claude-3-5-haiku-latest");
  }
  if (lower.includes("sonnet") && lower.includes("4-6")) {
    return lookupPricingTable("claude-sonnet-4-6");
  }
  if (lower.includes("sonnet") && lower.includes("4-5")) {
    return lookupPricingTable("claude-sonnet-4-5");
  }
  if (lower.includes("sonnet") && lower.includes("3.7")) {
    return lookupPricingTable("claude-sonnet-4");
  }
  if (lower.includes("sonnet") && /sonnet[-_]4/.test(lower)) {
    return lookupPricingTable("claude-sonnet-4");
  }
  if (lower.includes("3-5-sonnet") || lower.includes("3_5_sonnet")) {
    return lookupPricingTable("claude-3-5-sonnet-latest");
  }
  if (lower.includes("opus") && lower.includes("4-6")) {
    return lookupPricingTable("claude-opus-4-6");
  }
  if (lower.includes("opus") && lower.includes("4-5")) {
    return lookupPricingTable("claude-opus-4-5");
  }
  if (lower.includes("opus") && lower.includes("4-1")) {
    return lookupPricingTable("claude-opus-4-1");
  }
  if (lower.includes("opus") && /opus[-_]4/.test(lower)) {
    return lookupPricingTable("claude-opus-4");
  }

  return null;
}

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = resolveLlmPricing(model);
  if (!pricing) return 0;
  const inCost = (inputTokens / 1000) * pricing.input;
  const outCost = (outputTokens / 1000) * pricing.output;
  return inCost + outCost;
}

/** True if {@link estimateCostUsd} can return a non-zero cost for some non-zero token counts. */
export function canEstimateModelCost(model: string): boolean {
  return resolveLlmPricing(model) != null;
}
