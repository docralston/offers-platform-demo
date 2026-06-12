/**
 * Forbidden Unicode punctuation (smart quotes, em/en dash).
 * Validation fails if any of these appear in output.
 */
export const FORBIDDEN_PUNCTUATION = [
  "\u201c", // "
  "\u201d", // "
  "\u2018", // '
  "\u2019", // '
  "\u2014", // em dash
  "\u2013", // en dash
];

/**
 * Recursively normalize string values in an object:
 * - Smart quotes -> straight quotes
 * - Em/en dash -> ", " (comma space)
 * Mutates the object in place and returns it.
 */
export function normalizePunctuation<T>(obj: T): T {
  if (typeof obj === "string") {
    return normalizeString(obj) as T;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      obj[i] = normalizePunctuation(obj[i]);
    }
    return obj;
  }
  if (obj !== null && typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      (obj as Record<string, unknown>)[key] = normalizePunctuation(
        (obj as Record<string, unknown>)[key]
      );
    }
    return obj;
  }
  return obj;
}

function normalizeString(s: string): string {
  return s
    .replace(/\u201c/g, '"')
    .replace(/\u201d/g, '"')
    .replace(/\u2018/g, "'")
    .replace(/\u2019/g, "'")
    .replace(/\u2014/g, ", ")
    .replace(/\u2013/g, ", ");
}

/**
 * Check if a string contains any forbidden punctuation.
 */
export function hasForbiddenPunctuation(s: string): boolean {
  return FORBIDDEN_PUNCTUATION.some((c) => s.includes(c));
}

/**
 * Recursively find any string in obj that contains forbidden punctuation.
 * Returns an array of paths (e.g. ["seo.title", "faqs[2].a"]).
 */
export function findForbiddenPunctuationPaths(
  obj: unknown,
  path = ""
): string[] {
  const out: string[] = [];
  if (typeof obj === "string") {
    if (hasForbiddenPunctuation(obj)) out.push(path || "(root)");
    return out;
  }
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      out.push(
        ...findForbiddenPunctuationPaths(obj[i], path ? `${path}[${i}]` : `[${i}]`)
      );
    }
    return out;
  }
  if (obj !== null && typeof obj === "object") {
    for (const key of Object.keys(obj)) {
      const nextPath = path ? `${path}.${key}` : key;
      out.push(
        ...findForbiddenPunctuationPaths(
          (obj as Record<string, unknown>)[key],
          nextPath
        )
      );
    }
    return out;
  }
  return out;
}
