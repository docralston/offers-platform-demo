import type { ModelYearPage } from "./schema";

/**
 * Deeply replaces the discontinued BMW acronym `SAV` with `SUV`.
 * Also handles the plural form: `SAVs` -> `SUVs`.
 */
export function sanitizeBmwSAVToSUV<T>(input: T): T {
  const re = /\bSAV(s)?\b/gi;

  const replaceInString = (s: string) =>
    s.replace(re, (_match, plural?: string) => (plural ? "SUVs" : "SUV"));

  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return replaceInString(value);
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = walk(v);
      }
      return out;
    }
    return value;
  };

  return walk(input) as T;
}

export function sanitizeBmwModelPageSAVToSUV(page: ModelYearPage): ModelYearPage {
  return sanitizeBmwSAVToSUV(page);
}

