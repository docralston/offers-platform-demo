/**
 * Returns true when url is a non-empty https URL with no javascript/data schemes.
 */
export function isSafeHttpsUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

import { isDemoMode } from '@/lib/config/demo';

/**
 * Returns true when true, offer card/button links should not navigate (embed preview or demo).
 */
export function shouldDisableOfferCtas(inactive?: boolean): boolean {
  return isDemoMode() || inactive === true;
}

/** Use in href attributes; returns `#` in demo mode or embed preview. */
export function resolveOfferCtaHref(
  url: string | null | undefined,
  options?: { inactive?: boolean; fallback?: string },
): string {
  if (shouldDisableOfferCtas(options?.inactive)) return '#';
  const trimmed = url?.trim();
  if (trimmed?.startsWith('#') && trimmed.length > 1) return trimmed;
  return safeHrefUrl(url, options?.fallback ?? '#');
}

/** Use in href/src attributes; falls back when url is missing or unsafe. */
export function safeHrefUrl(url: string | null | undefined, fallback = '#'): string {
  return isSafeHttpsUrl(url) ? url!.trim() : fallback;
}
