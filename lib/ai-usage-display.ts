/** OpenAI Completions API — used as the assumed path for legacy rows without tags. */
export const LEGACY_OPENAI_DEFAULT_API_PATH = 'chat';

/**
 * Normalize provider/apiPath tags for display.
 *
 * Some legacy rows may have missing/unknown tags; in that case we fall back to
 * OpenAI + `chat` so UI grouping stays usable.
 *
 * Note: we intentionally do *not* coerce real `provider: "anthropic"` rows to
 * OpenAI based on timestamp (month-to-date is expected to include Anthropic).
 */
export function resolveAiUsageProviderForDisplay(
  _createdAt: Date,
  tags: Record<string, unknown> | null | undefined,
  _asOf: Date = new Date()
): { provider: string; apiPath: string } {
  const providerRaw = typeof tags?.provider === 'string' ? tags.provider : 'unknown';
  const apiPathRaw = typeof tags?.apiPath === 'string' ? tags.apiPath : 'unknown';

  // Default all unknown-ish data to OpenAI so we don't lose rows in the UI.
  if (providerRaw === 'unknown') {
    // Legacy Anthropics sometimes show up with an `anthropic-messages` apiPath
    // but no provider tag; treat it as legacy OpenAI for grouping.
    if (apiPathRaw === 'unknown' || apiPathRaw === 'anthropic-messages') {
      return { provider: 'openai', apiPath: LEGACY_OPENAI_DEFAULT_API_PATH };
    }
    return { provider: 'openai', apiPath: apiPathRaw };
  }

  if (providerRaw === 'openai') {
    return {
      provider: 'openai',
      apiPath: apiPathRaw === 'unknown' ? LEGACY_OPENAI_DEFAULT_API_PATH : apiPathRaw,
    };
  }

  // providerRaw === 'anthropic'
  return {
    provider: 'anthropic',
    apiPath: apiPathRaw === 'unknown' ? 'anthropic-messages' : apiPathRaw,
  };
}

/** Tags JSON for UI: same keys as stored, with legacy provider/apiPath normalized. */
export function displayAiUsageTags(
  createdAt: Date,
  tags: unknown,
  asOf: Date = new Date()
): Record<string, unknown> | null {
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) return null;
  const t = tags as Record<string, unknown>;
  const { provider, apiPath } = resolveAiUsageProviderForDisplay(createdAt, t, asOf);
  return { ...t, provider, apiPath };
}
