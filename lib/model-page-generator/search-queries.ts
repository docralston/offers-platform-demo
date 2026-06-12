import * as fs from "fs";
import * as path from "path";

const MAX_QUERIES_LOAD = 15;

/**
 * Normalize raw LLM or file text into trimmed, de-duplicated query lines (cap 15).
 */
export function normalizeSearchQueryLines(raw: string): string[] {
  const queries = raw
    .split(/\r?\n/)
    .map((q) => q.trim())
    .filter((q) => q.length > 0);
  const deduped = Array.from(new Set(queries));
  return deduped.slice(0, MAX_QUERIES_LOAD);
}

/**
 * Resolved path for the search-queries file the loader would use (txt preferred over json).
 */
export function resolveSearchQueriesFilePath(
  configsDir: string,
  brandSlug: string,
  year: number,
  modelSlug: string
): { filePath: string; kind: "txt" | "json" } | null {
  const brand = brandSlug.toLowerCase();
  const slug = modelSlug.toLowerCase().replace(/\.json$/, "");
  const baseDir = path.join(configsDir, "search-queries", brand, String(year));

  if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
    return null;
  }

  const txtPath = path.join(baseDir, `${slug}.txt`);
  const jsonPath = path.join(baseDir, `${slug}.json`);

  if (fs.existsSync(txtPath) && fs.statSync(txtPath).isFile()) {
    return { filePath: txtPath, kind: "txt" };
  }
  if (fs.existsSync(jsonPath) && fs.statSync(jsonPath).isFile()) {
    return { filePath: jsonPath, kind: "json" };
  }
  return null;
}

/**
 * Last modification time of the active search-queries source file for this model, or null.
 */
export function getSearchQueriesFileMtime(
  configsDir: string,
  brandSlug: string,
  year: number,
  modelSlug: string
): Date | null {
  const resolved = resolveSearchQueriesFilePath(
    configsDir,
    brandSlug,
    year,
    modelSlug
  );
  if (!resolved) return null;
  try {
    const st = fs.statSync(resolved.filePath);
    return st.mtime;
  } catch {
    return null;
  }
}

/**
 * Read full text of the active search-queries file (txt or json as raw text).
 */
export function readSearchQueriesFileRaw(
  configsDir: string,
  brandSlug: string,
  year: number,
  modelSlug: string
): string | null {
  const resolved = resolveSearchQueriesFilePath(
    configsDir,
    brandSlug,
    year,
    modelSlug
  );
  if (!resolved) return null;
  try {
    return fs.readFileSync(resolved.filePath, "utf8");
  } catch {
    return null;
  }
}

/**
 * Load high-intent search queries for a specific model-year.
 * Looks under: configs/search-queries/<brand>/<year>/<slug>.{txt,json}
 *
 * - TXT: one query per line.
 * - JSON: either string[] or { queries: string[] }.
 *
 * Returns a de-duplicated, trimmed list (up to 15 items).
 */
export function loadSearchQueriesForModel(
  configsDir: string,
  brandSlug: string,
  year: number,
  modelSlug: string
): string[] {
  const brand = brandSlug.toLowerCase();
  const slug = modelSlug.toLowerCase().replace(/\.json$/, "");
  const baseDir = path.join(configsDir, "search-queries", brand, String(year));

  if (!fs.existsSync(baseDir) || !fs.statSync(baseDir).isDirectory()) {
    return [];
  }

  const txtPath = path.join(baseDir, `${slug}.txt`);
  const jsonPath = path.join(baseDir, `${slug}.json`);

  let queries: string[] = [];

  if (fs.existsSync(txtPath) && fs.statSync(txtPath).isFile()) {
    try {
      const raw = fs.readFileSync(txtPath, "utf8");
      queries = raw
        .split(/\r?\n/)
        .map((q) => q.trim())
        .filter((q) => q.length > 0);
    } catch {
      // Ignore file read/parse errors and fall through to JSON.
    }
  } else if (fs.existsSync(jsonPath) && fs.statSync(jsonPath).isFile()) {
    try {
      const raw = fs.readFileSync(jsonPath, "utf8");
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        queries = data
          .map((q) => String(q ?? "").trim())
          .filter((q) => q.length > 0);
      } else if (Array.isArray((data as any).queries)) {
        queries = (data as any).queries
          .map((q: unknown) => String(q ?? "").trim())
          .filter((q: string) => q.length > 0);
      }
    } catch {
      // Ignore invalid JSON and return empty list.
    }
  }

  if (!queries.length) return [];

  return normalizeSearchQueryLines(queries.join("\n"));
}

