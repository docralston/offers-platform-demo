import * as path from "path";

/**
 * Filename prefix for `<prefix>-models-<year>.json` under pages/<brand>/<year>/.
 * Single source for list.ts and run.ts.
 */
export const BRAND_MODEL_LIST_PREFIX: Record<string, string> = {
  toyota: "toy",
  bmw: "bmw",
  lexus: "lex",
};

export function modelListFilenameCandidates(
  yearDir: string,
  brandSlug: string,
  year: number
): string[] {
  const prefix = BRAND_MODEL_LIST_PREFIX[brandSlug.toLowerCase()];
  return [
    ...(prefix
      ? [path.join(yearDir, `${prefix}-models-${year}.json`)]
      : []),
    path.join(yearDir, `models-${year}.json`),
    path.join(yearDir, "models.json"),
  ];
}
