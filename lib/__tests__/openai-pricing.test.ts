import { describe, expect, test } from "vitest";
import { estimateCostUsd, resolveLlmPricing } from "@/lib/openai-pricing";

describe("resolveLlmPricing", () => {
  test("OpenAI gpt-5-mini (standard table)", () => {
    const p = resolveLlmPricing("gpt-5-mini");
    expect(p).not.toBeNull();
    expect(p!.input).toBeCloseTo(0.25 / 1000, 10);
    expect(p!.output).toBeCloseTo(2 / 1000, 10);
  });

  test("OpenAI dated snapshot strips suffix", () => {
    expect(resolveLlmPricing("gpt-5-mini-2025-08-07")).toEqual(
      resolveLlmPricing("gpt-5-mini")
    );
  });

  test("Anthropic Haiku 4.5 base rates", () => {
    const p = resolveLlmPricing("claude-haiku-4-5");
    expect(p).not.toBeNull();
    expect(p!.input).toBeCloseTo(1 / 1000, 10);
    expect(p!.output).toBeCloseTo(5 / 1000, 10);
  });

  test("Anthropic Haiku 4.5 dated id", () => {
    expect(resolveLlmPricing("claude-haiku-4-5-20251001")).toEqual(
      resolveLlmPricing("claude-haiku-4-5")
    );
  });
});

describe("estimateCostUsd", () => {
  test("1M in + 1M out on gpt-5-mini matches published $/MTok", () => {
    const usd = estimateCostUsd("gpt-5-mini", 1_000_000, 1_000_000);
    expect(usd).toBeCloseTo(0.25 + 2, 6);
  });
});
