import { describe, expect, test } from "vitest";
import { LEGACY_OPENAI_DEFAULT_API_PATH, resolveAiUsageProviderForDisplay } from "@/lib/ai-usage-display";

describe("resolveAiUsageProviderForDisplay", () => {
  test("keeps real Anthropic rows as Anthropic (even for older timestamps)", () => {
    const r = resolveAiUsageProviderForDisplay(
      new Date("2026-03-01T12:00:00Z"),
      { provider: "anthropic", apiPath: "anthropic-messages" },
      new Date("2026-03-25T12:00:00Z"),
    );

    expect(r.provider).toBe("anthropic");
    expect(r.apiPath).toBe("anthropic-messages");
  });

  test("treats unknown provider + anthropic-messages as legacy OpenAI grouping", () => {
    const r = resolveAiUsageProviderForDisplay(
      new Date("2026-03-01T12:00:00Z"),
      { provider: "unknown", apiPath: "anthropic-messages" },
      new Date("2026-03-25T12:00:00Z"),
    );

    expect(r.provider).toBe("openai");
    expect(r.apiPath).toBe(LEGACY_OPENAI_DEFAULT_API_PATH);
  });

  test("defaults unknown apiPath for OpenAI to chat", () => {
    const r = resolveAiUsageProviderForDisplay(
      new Date("2026-03-25T12:00:00Z"),
      { provider: "openai", apiPath: "unknown" },
      new Date("2026-03-25T12:00:00Z"),
    );

    expect(r.provider).toBe("openai");
    expect(r.apiPath).toBe(LEGACY_OPENAI_DEFAULT_API_PATH);
  });

  test("defaults unknown apiPath for Anthropic to anthropic-messages", () => {
    const r = resolveAiUsageProviderForDisplay(
      new Date("2026-03-25T12:00:00Z"),
      { provider: "anthropic", apiPath: "unknown" },
      new Date("2026-03-25T12:00:00Z"),
    );

    expect(r.provider).toBe("anthropic");
    expect(r.apiPath).toBe("anthropic-messages");
  });
});

