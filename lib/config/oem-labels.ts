/**
 * Human-readable OEM names for admin UI, renderers, and CLI (slug → label).
 */

const UPPERCASE_ACRONYMS = new Set(["bmw"]);

/**
 * Display label for a lower-case brand slug (e.g. toyota → Toyota, bmw → BMW).
 */
export function formatOemBrandLabel(brandSlug: string): string {
  const s = brandSlug.trim().toLowerCase();
  if (!s) return brandSlug;
  if (UPPERCASE_ACRONYMS.has(s)) return s.toUpperCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
