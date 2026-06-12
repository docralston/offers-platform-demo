/**
 * LLM API client wrapper (OpenAI + Anthropic).
 *
 * Provider/model defaults are resolved from env on each call:
 * - `LLM_PROVIDER=anthropic` -> ANTHROPIC_* models
 * - otherwise -> OPENAI_* models
 */

import { AsyncLocalStorage } from "async_hooks";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { estimateCostUsd } from "@/lib/openai-pricing";
import { isDemoMode } from "@/lib/config/demo";

export type LlmApiKeyOverride = {
  openaiApiKey?: string;
  anthropicApiKey?: string;
};

/** Per-request BYOK keys (demo deploy only; set from API route). */
export const llmApiKeyOverride = new AsyncLocalStorage<LlmApiKeyOverride>();

function assertLlmAllowedInDemo(): void {
  if (!isDemoMode()) return;
  const override = llmApiKeyOverride.getStore();
  if (override?.openaiApiKey?.trim() || override?.anthropicApiKey?.trim()) return;
  throw new Error(
    "LLM calls are disabled on the demo site. Add your own API key on Model Pages (browser-only BYOK)."
  );
}

const defaultModel = process.env.OPENAI_MODEL ?? "gpt-4.1";
const skeletonModelOpenAI =
  process.env.OPENAI_MODEL_SKELETON ?? defaultModel;
const faqsModel = process.env.OPENAI_MODEL_FAQS ?? "gpt-4o-mini";
const localModel = process.env.OPENAI_MODEL_LOCAL ?? defaultModel;
const metaModel = process.env.OPENAI_MODEL_META ?? faqsModel;
const anthropicDefaultModel =
  process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";
/** Two-step page flow: skeleton JSON (no local sections); falls back to `ANTHROPIC_MODEL`. */
const anthropicSkeletonModel =
  process.env.ANTHROPIC_MODEL_SKELETON ?? anthropicDefaultModel;
const anthropicFaqsModel = process.env.ANTHROPIC_MODEL_FAQS ?? anthropicDefaultModel;
const anthropicLocalModel =
  process.env.ANTHROPIC_MODEL_LOCAL ?? anthropicDefaultModel;
const anthropicMetaModel =
  process.env.ANTHROPIC_MODEL_META ?? anthropicFaqsModel;
const anthropicFallbackModel =
  process.env.ANTHROPIC_MODEL_FALLBACK ?? "claude-sonnet-4-6";

function resolveLlmProvider(): "openai" | "anthropic" {
  return (process.env.LLM_PROVIDER ?? "openai").toLowerCase() === "anthropic"
    ? "anthropic"
    : "openai";
}

export interface GenerateContentOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "json_object" | "text";
  tags?: Record<string, unknown>;
  /** Optional logical content type hint (e.g. "skeleton", "faqs", "local", "meta"). */
  contentType?: "skeleton" | "faqs" | "local" | "meta" | "default";
  /** Disable error-row persistence for callers that aggregate failures themselves. */
  suppressErrorLog?: boolean;
}

/**
 * Default output ceiling for model-page LLM calls (~$0.10 at $15/M output if fully used, plus buffer).
 * Billed on actual usage, not on the cap.
 */
export function defaultModelPagerMaxOutputTokens(): number {
  const tenCentsOutput = Math.floor((0.1 / 15) * 1_000_000);
  return Math.max(8192, tenCentsOutput + 3072);
}

/**
 * Global output budget: `LLM_MAX_OUTPUT_TOKENS`, else legacy `INTERNAL_LINKS_MAX_OUTPUT_TOKENS`.
 * If unset, uses `max(perCall, defaultModelPagerMaxOutputTokens())` so page / FAQ / local / links
 * all share the same floor; search-query generation uses the same resolver.
 */
/** Avoid provider 4xx from absurd caps while still allowing Sonnet-class large outputs. */
const MODEL_PAGER_MAX_OUTPUT_HARD_CAP = 32_768;

export function resolveModelPagerMaxOutputTokens(perCall?: number): number {
  const fromEnv =
    parseInt(process.env.LLM_MAX_OUTPUT_TOKENS ?? "", 10) ||
    parseInt(process.env.INTERNAL_LINKS_MAX_OUTPUT_TOKENS ?? "", 10);
  let resolved: number;
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    resolved = fromEnv;
  } else {
    const floor = defaultModelPagerMaxOutputTokens();
    if (perCall != null && Number.isFinite(perCall) && perCall > 0) {
      resolved = Math.max(perCall, floor);
    } else {
      resolved = floor;
    }
  }
  return Math.min(resolved, MODEL_PAGER_MAX_OUTPUT_HARD_CAP);
}

let _openai: OpenAI | null = null;
let _anthropic: Anthropic | null = null;

type TokenUsage = {
  input_tokens?: number;
  output_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type AnthropicMessageLike = {
  usage?: { input_tokens?: number; output_tokens?: number };
  stop_reason?: unknown;
  id?: unknown;
};

function toJsonTags(
  tags: Record<string, unknown>,
  apiPath: string,
  provider: "openai" | "anthropic"
): Prisma.InputJsonValue {
  return {
    ...tags,
    apiPath,
    provider,
  } as Prisma.InputJsonValue;
}

/** Models that have already returned temperature-unsupported; use default (1) from the start. */
const modelsRequiringDefaultTemperature = new Set<string>();

interface LLMTextResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number;
  responseId: string | null;
  finishReason?: string;
  apiPath: "responses" | "chat" | "anthropic-messages";
  provider: "openai" | "anthropic";
  modelUsed: string;
}

function isGpt5FamilyModel(model: string): boolean {
  const m = model.toLowerCase();
  return m.startsWith("gpt-5");
}

function extractContentText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  const parts: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const asRecord = part as { type?: unknown; text?: unknown };
    // Handle common Chat Completions content-part shapes.
    if (typeof asRecord.text === "string") {
      parts.push(asRecord.text);
      continue;
    }
    if (asRecord.type === "text") {
      const textObj = asRecord.text as { value?: unknown } | undefined;
      if (textObj && typeof textObj.value === "string") {
        parts.push(textObj.value);
      }
    }
  }
  return parts.join("\n").trim();
}

function extractResponsesText(response: unknown): string {
  if (!response || typeof response !== "object") return "";
  const r = response as { output_text?: unknown; output?: unknown };
  if (typeof r.output_text === "string" && r.output_text.trim()) {
    return r.output_text.trim();
  }
  if (!Array.isArray(r.output)) return "";

  const parts: string[] = [];
  for (const item of r.output) {
    if (!item || typeof item !== "object") continue;
    const itemRecord = item as { content?: unknown };
    if (!Array.isArray(itemRecord.content)) continue;
    for (const part of itemRecord.content) {
      if (!part || typeof part !== "object") continue;
      const p = part as {
        type?: unknown;
        text?: unknown;
      };
      if (typeof p.text === "string") {
        parts.push(p.text);
        continue;
      }
      if (p.type === "output_text") {
        const t = p.text as { value?: unknown } | undefined;
        if (t && typeof t.value === "string") {
          parts.push(t.value);
        }
      }
    }
  }
  return parts.join("\n").trim();
}

async function createWithResponsesApi(args: {
  model: string;
  prompt: string;
  temperature: number;
  useDefaultTemperature: boolean;
  maxTokens: number;
  responseFormat?: "json_object" | "text";
}): Promise<LLMTextResult> {
  const startedAt = Date.now();
  const params: Record<string, unknown> = {
    model: args.model,
    input: args.prompt,
    max_output_tokens: args.maxTokens,
    ...(args.useDefaultTemperature
      ? { temperature: 1 }
      : { temperature: args.temperature }),
    // Favor direct text emission over long hidden reasoning when strict JSON is required.
    reasoning: { effort: "minimal" },
  };
  if (args.responseFormat === "json_object") {
    params.text = { format: { type: "json_object" } };
  }
  const rawResponse = await getOpenAI().responses.create(
    params as OpenAI.Responses.ResponseCreateParams
  );
  if (rawResponse && typeof rawResponse === "object" && Symbol.asyncIterator in rawResponse) {
    throw new Error("OpenAI responses API returned a stream; this path expects a full response object.");
  }
  const response = rawResponse as {
    usage?: TokenUsage;
    status?: string | null;
    id?: string | null;
  };
  const usage = (response.usage ?? {}) as TokenUsage;
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const totalTokens =
    usage.total_tokens ?? inputTokens + outputTokens;
  const content = extractResponsesText(rawResponse);
  const finishReason =
    response.status != null
      ? String(response.status)
      : undefined;
  return {
    content,
    inputTokens,
    outputTokens,
    totalTokens,
    durationMs: Date.now() - startedAt,
    responseId: response.id ?? null,
    finishReason,
    apiPath: "responses",
    provider: "openai",
    modelUsed: args.model,
  };
}

async function createWithChatCompletions(args: {
  model: string;
  prompt: string;
  temperature: number;
  useDefaultTemperature: boolean;
  maxTokens: number;
  responseFormat?: "json_object" | "text";
}): Promise<LLMTextResult> {
  const startedAt = Date.now();
  const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
    model: args.model,
    messages: [{ role: "user", content: args.prompt }],
    ...(args.useDefaultTemperature
      ? { temperature: 1 }
      : { temperature: args.temperature }),
    max_completion_tokens: args.maxTokens,
  };
  if (args.responseFormat === "json_object") {
    params.response_format = { type: "json_object" };
  }
  const completion = await getOpenAI().chat.completions.create(params);
  const usage = (completion.usage ?? {}) as TokenUsage;
  const inputTokens =
    usage.input_tokens ??
    usage.prompt_tokens ??
    0;
  const outputTokens =
    usage.output_tokens ??
    usage.completion_tokens ??
    0;
  const totalTokens =
    usage.total_tokens ?? inputTokens + outputTokens;
  const firstChoice = completion.choices[0] as
    | { message?: unknown; finish_reason?: unknown }
    | undefined;
  const content = extractContentText(firstChoice?.message);
  const finishReason =
    firstChoice?.finish_reason != null
      ? String(firstChoice.finish_reason)
      : undefined;
  return {
    content,
    inputTokens,
    outputTokens,
    totalTokens,
    durationMs: Date.now() - startedAt,
    responseId: completion.id ?? null,
    finishReason,
    apiPath: "chat",
    provider: "openai",
    modelUsed: args.model,
  };
}

function getOpenAI(): OpenAI {
  const overrideKey = llmApiKeyOverride.getStore()?.openaiApiKey?.trim();
  if (overrideKey) {
    return new OpenAI({ apiKey: overrideKey });
  }
  if (_openai == null) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

function getAnthropic(): Anthropic {
  const overrideKey = llmApiKeyOverride.getStore()?.anthropicApiKey?.trim();
  if (overrideKey) {
    return new Anthropic({ apiKey: overrideKey });
  }
  if (_anthropic == null) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

function extractAnthropicText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const m = message as { content?: unknown };
  if (!Array.isArray(m.content)) return "";
  const parts: string[] = [];
  for (const part of m.content) {
    if (!part || typeof part !== "object") continue;
    const p = part as { type?: unknown; text?: unknown };
    if (p.type === "text" && typeof p.text === "string") {
      parts.push(p.text);
    }
  }
  return parts.join("\n").trim();
}

async function createWithAnthropicMessages(args: {
  model: string;
  prompt: string;
  maxTokens: number;
  responseFormat?: "json_object" | "text";
}): Promise<LLMTextResult> {
  const startedAt = Date.now();
  const systemPrompt =
    args.responseFormat === "json_object"
      ? "Return only valid JSON. Do not wrap in markdown fences."
      : undefined;
  const stream = getAnthropic().messages.stream({
    model: args.model,
    max_tokens: args.maxTokens,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    messages: [{ role: "user", content: args.prompt }],
  });
  const message = await stream.finalMessage();
  const typedMessage = message as AnthropicMessageLike;
  const inputTokens = typedMessage.usage?.input_tokens ?? 0;
  const outputTokens = typedMessage.usage?.output_tokens ?? 0;
  const totalTokens = inputTokens + outputTokens;
  const content = extractAnthropicText(message);
  const finishReason =
    typedMessage.stop_reason != null
      ? String(typedMessage.stop_reason)
      : undefined;
  return {
    content,
    inputTokens,
    outputTokens,
    totalTokens,
    durationMs: Date.now() - startedAt,
    responseId: typedMessage.id != null ? String(typedMessage.id) : null,
    finishReason,
    apiPath: "anthropic-messages",
    provider: "anthropic",
    modelUsed: args.model,
  };
}

function isTemperatureUnsupportedError(err: unknown): boolean {
  const msg =
    err && typeof err === "object" && "message" in err
      ? String((err as { message: unknown }).message)
      : String(err);
  return (
    msg.includes("temperature") &&
    (msg.includes("does not support") || msg.includes("Only the default"))
  );
}

/**
 * Call configured LLM provider. Returns assistant text content.
 * For JSON mode, parses out JSON from code blocks if present.
 * Uses requested temperature when the model supports it; falls back to 1 when not.
 */
export async function generateContent(
  prompt: string,
  options: GenerateContentOptions = {}
): Promise<string> {
  assertLlmAllowedInDemo();
  const provider = resolveLlmProvider();
  let model: string;
  if (provider === "anthropic") {
    model = options.model ?? anthropicDefaultModel;
    if (!options.model && options.contentType === "skeleton" && anthropicSkeletonModel) {
      model = anthropicSkeletonModel;
    } else if (!options.model && options.contentType === "faqs" && anthropicFaqsModel) {
      model = anthropicFaqsModel;
    } else if (!options.model && options.contentType === "local" && anthropicLocalModel) {
      model = anthropicLocalModel;
    } else if (!options.model && options.contentType === "meta" && anthropicMetaModel) {
      model = anthropicMetaModel;
    }
  } else {
    model = options.model ?? defaultModel;
    if (!options.model && options.contentType === "skeleton" && skeletonModelOpenAI) {
      model = skeletonModelOpenAI;
    } else if (!options.model && options.contentType === "faqs" && faqsModel) {
      model = faqsModel;
    } else if (!options.model && options.contentType === "local" && localModel) {
      model = localModel;
    } else if (!options.model && options.contentType === "meta" && metaModel) {
      model = metaModel;
    }
  }
  const temperature = options.temperature ?? 0.7;
  const maxTokens = resolveModelPagerMaxOutputTokens(options.maxTokens);
  const responseFormat = options.responseFormat;

  const maxRetries = 2;
  let lastError: Error | null = null;
  let useDefaultTemperature = modelsRequiringDefaultTemperature.has(model);
  const preferResponsesApi = provider === "openai" && isGpt5FamilyModel(model);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const isLastAttempt = attempt === maxRetries - 1;
      const createArgs = {
        model,
        prompt,
        temperature,
        useDefaultTemperature,
        maxTokens,
        responseFormat,
      } as const;
      let result: LLMTextResult;
      if (provider === "anthropic") {
        try {
          result = await createWithAnthropicMessages({
            model,
            prompt,
            maxTokens,
            responseFormat,
          });
        } catch (primaryErr) {
          const shouldFallbackModel =
            anthropicFallbackModel &&
            anthropicFallbackModel !== model &&
            !options.model;
          if (!shouldFallbackModel) throw primaryErr;
          result = await createWithAnthropicMessages({
            model: anthropicFallbackModel,
            prompt,
            maxTokens,
            responseFormat,
          });
        }
      } else if (preferResponsesApi) {
        try {
          result = await createWithResponsesApi(createArgs);
        } catch (primaryErr) {
          // Safety fallback for transient compatibility issues.
          result = await createWithChatCompletions(createArgs);
          if (!result.content) throw primaryErr;
        }
      } else {
        result = await createWithChatCompletions(createArgs);
      }
      const { content, inputTokens, outputTokens, totalTokens, durationMs, responseId } =
        result;
      const estimatedCostUsd = estimateCostUsd(
        result.modelUsed,
        inputTokens,
        outputTokens,
      );

      if (!content) {
        const finishReason =
          result.finishReason != null ? String(result.finishReason) : "unknown";
        const error = new Error(
          `Empty response from LLM (finish_reason=${finishReason}, model=${model}, provider=${provider})`
        );
        lastError = error;
        // Treat an empty response as a failed attempt. Only log an error row
        // on the final failed attempt to avoid flooding the log when a retry
        // later succeeds.
        if (isLastAttempt && !options.suppressErrorLog) {
          try {
            await prisma.openAIRequestLog.create({
              data: {
                model,
                inputTokens,
                outputTokens,
                totalTokens,
                durationMs,
                estimatedCostUsd,
                status: "error",
                openaiResponseId: responseId,
                errorText: String(error).slice(0, 2000),
                tags: toJsonTags(
                  (options.tags ?? {
                    feature: "model-page-generator",
                  }) as Record<string, unknown>,
                  result.apiPath,
                  result.provider
                ),
              },
            });
          } catch {
            // Ignore logging failures
          }
        }
        if (!isLastAttempt) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw error;
      }

      try {
        await prisma.openAIRequestLog.create({
          data: {
            model: result.modelUsed,
            inputTokens,
            outputTokens,
            totalTokens,
            durationMs,
            estimatedCostUsd,
            status: "success",
            openaiResponseId: responseId,
            tags: toJsonTags(
              (options.tags ?? { feature: "model-page-generator" }) as Record<string, unknown>,
              result.apiPath,
              result.provider
            ),
          },
        });
      } catch (logErr) {
        console.error("openAIRequestLog.create (success) failed:", logErr);
      }

      return content;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (
        !useDefaultTemperature &&
        isTemperatureUnsupportedError(err)
      ) {
        modelsRequiringDefaultTemperature.add(model);
        useDefaultTemperature = true;
        // Retry immediately with default temperature (no backoff)
        attempt--;
        continue;
      }
      const isLastAttempt = attempt === maxRetries - 1;
      try {
        // Only persist an error row on the final failed attempt. Earlier
        // failures that later succeed on retry should not pollute the log.
        if (isLastAttempt && !options.suppressErrorLog) {
          await prisma.openAIRequestLog.create({
            data: {
              model,
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
                durationMs: 0,
              estimatedCostUsd: 0,
              status: "error",
              errorText: String(err).slice(0, 2000),
              tags: toJsonTags(
                (options.tags ?? {
                  feature: "model-page-generator",
                }) as Record<string, unknown>,
                provider === "anthropic"
                  ? "anthropic-messages"
                  : preferResponsesApi
                    ? "responses"
                    : "chat",
                provider
              ),
            },
          });
        }
      } catch {
        // Swallow logging errors to avoid masking the original OpenAI error
      }
      if (!isLastAttempt) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError ?? new Error("LLM request failed");
}

/**
 * Dedicated LLM call for the internal-link injection rewrite pass.
 *
 * Honors `LLM_PROVIDER`:
 * - `anthropic`: uses ANTHROPIC_MODEL_LINKS (or ANTHROPIC_MODEL), requires ANTHROPIC_API_KEY.
 * - `openai`: uses OPENAI_MODEL_LINKS (or OPENAI_MODEL).
 */
export async function callInternalLinksLlm(
  prompt: string,
  options: {
    temperature?: number;
    maxTokens?: number;
    tags?: Record<string, unknown>;
  } = {}
): Promise<string> {
  assertLlmAllowedInDemo();
  const maxTokens = resolveModelPagerMaxOutputTokens(options.maxTokens);
  const provider = resolveLlmProvider();
  const primaryAnthropicModel =
    process.env.ANTHROPIC_MODEL_LINKS ??
    process.env.ANTHROPIC_MODEL ??
    "claude-sonnet-4-6";
  const anthropicKey =
    llmApiKeyOverride.getStore()?.anthropicApiKey?.trim() ||
    process.env.ANTHROPIC_API_KEY?.trim();
  const logTags = {
    feature: "model-page-generator-internal-links",
    ...(options.tags ?? {}),
  } as Record<string, unknown>;

  if (provider === "anthropic") {
    if (!anthropicKey) {
      throw new Error(
        "LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is missing; cannot run internal-link injection."
      );
    }
    let lastError: Error | null = null;
    const modelsToTry = [
      primaryAnthropicModel,
      ...(anthropicFallbackModel &&
      anthropicFallbackModel !== primaryAnthropicModel
        ? [anthropicFallbackModel]
        : []),
    ];
    for (const model of modelsToTry) {
      try {
        const result = await createWithAnthropicMessages({
          model,
          prompt,
          maxTokens,
          responseFormat: "json_object",
        });
        const estimatedCostUsd = estimateCostUsd(
          result.modelUsed,
          result.inputTokens,
          result.outputTokens,
        );
        if (result.content?.trim()) {
          try {
            await prisma.openAIRequestLog.create({
              data: {
                model: result.modelUsed,
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
                totalTokens: result.totalTokens,
                durationMs: result.durationMs,
                estimatedCostUsd,
                status: "success",
                openaiResponseId: result.responseId,
                tags: toJsonTags(logTags, result.apiPath, result.provider),
              },
            });
          } catch (logErr) {
            console.error("openAIRequestLog.create (internal-links success) failed:", logErr);
          }
          return result.content;
        }
        const emptyErr = new Error(
          `Internal-links model returned empty content (model=${model})`
        );
        lastError = emptyErr;
        try {
          await prisma.openAIRequestLog.create({
            data: {
              model,
              inputTokens: result.inputTokens,
              outputTokens: result.outputTokens,
              totalTokens: result.totalTokens,
              durationMs: result.durationMs,
              estimatedCostUsd,
              status: "error",
              openaiResponseId: result.responseId,
              errorText: String(emptyErr).slice(0, 2000),
              tags: toJsonTags(logTags, result.apiPath, result.provider),
            },
          });
        } catch (logErr) {
          console.error("openAIRequestLog.create (internal-links empty) failed:", logErr);
        }
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
        try {
          await prisma.openAIRequestLog.create({
            data: {
              model,
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              durationMs: 0,
              estimatedCostUsd: 0,
              status: "error",
              errorText: String(lastError).slice(0, 2000),
              tags: toJsonTags(logTags, "anthropic-messages", "anthropic"),
            },
          });
        } catch (logErr) {
          console.error("openAIRequestLog.create (internal-links error) failed:", logErr);
        }
      }
    }
    throw lastError ?? new Error("Internal-links Anthropic request failed");
  }

  const openaiModel =
    process.env.OPENAI_MODEL_LINKS ??
    process.env.OPENAI_MODEL ??
    "gpt-4.1";

  return generateContent(prompt, {
    model: openaiModel,
    temperature: options.temperature ?? 0.3,
    maxTokens,
    responseFormat: "json_object",
    tags: logTags,
  });
}

/**
 * Extract JSON from response. Handles markdown code blocks (```json ... ```).
 */
export function extractJsonFromResponse(response: string): string {
  const trimmed = response.trim();
  // Case 1: whole response is a single ```json code block
  const fullBlock = /^```(?:json)?\s*([\s\S]*?)```\s*$/;
  const mFull = trimmed.match(fullBlock);
  if (mFull) return mFull[1].trim();

  // Case 2: response contains a fenced json block somewhere inside
  const innerBlock = /```(?:json)?\s*([\s\S]*?)```/;
  const mInner = trimmed.match(innerBlock);
  if (mInner) return mInner[1].trim();

  // Case 3: best-effort extraction of the first balanced JSON object
  let start = -1;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (start === -1) {
      if (ch === "{") {
        start = i;
        depth = 1;
      }
      continue;
    }
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const candidate = trimmed.slice(start, i + 1).trim();
          return candidate;
        }
      }
    }
  }

  // Fallback: return the raw trimmed string (should already be plain JSON when
  // response_format: "json_object" is respected by the model).
  return trimmed;
}
