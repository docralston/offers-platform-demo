/**
 * Build dealer inventory URLs by platform format.
 * Dealer.com: repeated model= with encodeURIComponent (spaces → %20).
 * Dealer Inspire: stub until Lexus inventory URL convention is known.
 */

export type InventoryUrlFormat = 'dealer_com' | 'dealer_inspire';

export interface BuildInventoryUrlOptions {
  baseUrl: string;
  format: InventoryUrlFormat;
  models: string[];
}

/**
 * Returns a full inventory URL (or path) with optional model filter.
 * baseUrl can be a full URL (https://...) or a path (/new-inventory/index.htm).
 */
export function buildInventoryUrl(options: BuildInventoryUrlOptions): string {
  const { baseUrl, format, models } = options;
  const normalized = baseUrl.replace(/\/+$/, '');

  switch (format) {
    case 'dealer_com': {
      const trimmed = models.map((m) => m.trim()).filter(Boolean);
      if (trimmed.length === 0) return normalized;
      const sep = normalized.includes('?') ? '&' : '?';
      const query = trimmed.map((m) => `model=${encodeURIComponent(m)}`).join('&');
      return `${normalized}${sep}${query}`;
    }
    case 'dealer_inspire':
      // Stub: Dealer Inspire format TBD when we have a sample Lexus inventory URL.
      return normalized;
    default: {
      const _: never = format;
      return normalized;
    }
  }
}
