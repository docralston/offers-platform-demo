/**
 * Meta title and description clamping for SEO (max 60 / 158 chars).
 */

const TITLE_MAX = 60;
const DESC_MAX = 158;

/**
 * Clamp title to maxLength (default 60). Prefer removing dealership suffix first, then truncate at word boundary.
 */
export function clampTitle(title: string, maxLength: number = TITLE_MAX): string {
  let s = String(title ?? "").trim();
  if (s.length <= maxLength) return s;
  const pipeIndex = s.lastIndexOf("|");
  if (pipeIndex > 0) {
    const withoutSuffix = s.slice(0, pipeIndex).trim();
    if (withoutSuffix.length <= maxLength) return withoutSuffix;
    s = withoutSuffix;
  }
  if (s.length <= maxLength) return s;
  s = s.slice(0, maxLength);
  const lastSpace = s.lastIndexOf(" ");
  if (lastSpace > maxLength * 0.6) {
    s = s.slice(0, lastSpace);
  }
  return s.trim();
}

/**
 * Clamp description: keep CTA intact, shorten base if needed. Total <= maxLength (default 158).
 */
export function clampDescription(
  desc: string,
  cta: string,
  maxLength: number = DESC_MAX
): string {
  const base = String(desc ?? "").trim();
  const ctaPart = String(cta ?? "").trim();
  if (!ctaPart) return clampDescriptionBase(base, maxLength);
  const withCta = base.endsWith(ctaPart) ? base : `${base} ${ctaPart}`.trim();
  if (withCta.length <= maxLength) return withCta;
  const baseMax = maxLength - ctaPart.length - 1;
  const shortened = clampDescriptionBase(base, baseMax);
  return `${shortened} ${ctaPart}`.trim();
}

function clampDescriptionBase(s: string, maxLength: number): string {
  s = String(s ?? "").trim();
  if (s.length <= maxLength) return s;

  // First, hard clamp to maxLength and then back up to a word boundary when possible.
  s = s.slice(0, maxLength);
  const lastSpace = s.lastIndexOf(" ");
  if (lastSpace > maxLength * 0.5) {
    s = s.slice(0, lastSpace);
  }

  // Then, prefer ending on the last full sentence if there is one well inside the limit.
  const lastPeriod = s.lastIndexOf(".");
  const lastExcl = s.lastIndexOf("!");
  const lastQ = s.lastIndexOf("?");
  const lastPunct = Math.max(lastPeriod, lastExcl, lastQ);
  if (lastPunct > maxLength * 0.5) {
    s = s.slice(0, lastPunct + 1);
  }

  return s.trim();
}

export { TITLE_MAX, DESC_MAX };
