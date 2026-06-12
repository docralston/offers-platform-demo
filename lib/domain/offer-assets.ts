/**
 * Utility functions for generating offer asset URLs (inventoryUrl, imageUrl).
 *
 * buildInventoryUrl()   — generates a store inventory search URL for a model.
 * buildImageUrl()      — generates a Cloudflare R2 WEBP jellybean image URL.
 * getImageUrlForOffer() — returns stored imageUrl or computed from make/model/year.
 */

import { getMakeForStoreCode } from '@/lib/config/stores';
import { demoAssetBaseUrl, isDemoMode } from '@/lib/config/demo';
import { slugify } from '@/lib/model-page-generator/slug';

const R2_BASE = 'https://demo-assets.example.com';

function assetBaseUrl(): string {
  if (isDemoMode()) {
    return process.env.ASSETS_R2_BASE_URL?.replace(/\/+$/, '') || demoAssetBaseUrl();
  }
  return process.env.ASSETS_R2_BASE_URL?.replace(/\/+$/, '') || R2_BASE;
}

function jellybeanAssetPrefix(): string {
  const base = assetBaseUrl().replace(/\/+$/, '');
  if (isDemoMode()) return base;
  if (base.endsWith('/assets')) return base;
  return `${base}/assets`;
}

/** Fallback image for vehicle cards when no jellybean/stored image is available (e.g. email, landing page). */
export const VEHICLE_PLACEHOLDER_IMAGE_URL = `${jellybeanAssetPrefix()}/placeholder/vehicle-placeholder.webp`;

const PROD_STORE_SITE: Record<string, string> = {
  TOY: 'https://toyota-of-demotown.example.com',
  BMW: 'https://bmw-of-demotown.example.com',
  LEXDT: 'https://lexus-of-demotown.example.com',
  LEXWG: 'https://lexus-of-exampleville.example.com',
};

const DEMO_STORE_SITE: Record<string, string> = {
  TOY: 'https://toyota-of-demotown.example.com',
  BMW: 'https://bmw-of-demotown.example.com',
  LEXDT: 'https://lexus-of-demotown.example.com',
  LEXWG: 'https://lexus-of-exampleville.example.com',
};

function storeSiteMap(): Record<string, string> {
  return isDemoMode() ? DEMO_STORE_SITE : PROD_STORE_SITE;
}

/**
 * Get the inventory URL for an offer when rendering for a specific store.
 * For Lexus multi-store offers (LEXDT/LEXWG), always computes from storeCode so the domain
 * matches: LEXDT → lexus-of-demotown.example.com, LEXWG → lexus-of-exampleville.example.com.
 */
export function getInventoryUrlForStore(
  offer: { storeCode: string; storeCodes?: string[] | null; inventoryUrl?: string | null; model: string },
  storeCode: string
): string | null {
  const model = offer.model?.trim();
  if (!model) return null;

  const lexStores = ['LEXDT', 'LEXWG'];
  const appliesToStore =
    offer.storeCode === storeCode ||
    (offer.storeCodes && offer.storeCodes.length > 0 && offer.storeCodes.includes(storeCode));

  if (appliesToStore && lexStores.includes(storeCode)) {
    return buildInventoryUrl(storeCode, model);
  }

  return offer.inventoryUrl || buildInventoryUrl(offer.storeCode, model);
}

/** Build inventory search URL for a model at a given store. Returns null if store is unknown. */
export function buildInventoryUrl(storeCode: string, model: string): string | null {
  const base = storeSiteMap()[storeCode];
  if (!base || !model) return null;

  const enc = (s: string) => s.trim().replace(/ /g, '%20');

  if (storeCode === 'TOY') {
    return `${base}/new-inventory/index.htm?model=${enc(model)}`;
  }

  if (storeCode === 'BMW') {
    return `${base}/new-inventory/index.htm?superModel=${enc(model)}`;
  }

  // LEXDT / LEXWG — Dealer Inspire-style /new-vehicles/{slug}/ paths
  if (storeCode === 'LEXDT' || storeCode === 'LEXWG') {
    const slug = buildLexusInventorySlug(model);
    return `${base}/new-vehicles/${slug}/`;
  }

  return null;
}

/**
 * Convert a Lexus model name to its inventory path slug.
 *
 * Canonical Lexus of Demotown slugs include:
 *   /new-vehicles/rc-f/
 *   /new-vehicles/lc/
 *   /new-vehicles/is-500/
 *   /new-vehicles/rc/
 *   /new-vehicles/rx-hybrid/
 *   /new-vehicles/nx-hybrid/
 *   /new-vehicles/rx/
 *   /new-vehicles/ux-hybrid/
 *   /new-vehicles/gx/
 *   /new-vehicles/lx/
 *   /new-vehicles/nx/
 *   /new-vehicles/rz/
 *   /new-vehicles/nx-phev/
 *   /new-vehicles/txh/
 *   /new-vehicles/tx/
 *   /new-vehicles/tx-phev/
 *   /new-vehicles/lxh/
 *   /new-vehicles/ls/
 *   /new-vehicles/is/
 *   /new-vehicles/es-hybrid/
 *   /new-vehicles/es/
 *
 * Hybrids / PHEVs need explicit mapping because internal model
 * codes often use suffixes like "NXh" or labels like "NX PHEV".
 */
function buildLexusInventorySlug(model: string): string {
  const normalized = model.trim();
  const lower = normalized.toLowerCase();

  // UX — hybrid-only at Demo; always point to ux-hybrid
  if (/^ux(\s+hybrid)?$/i.test(normalized) || /^uxh$/i.test(lower)) {
    return 'ux-hybrid';
  }

  // NX Hybrid
  if (/^nxh$/i.test(lower) || /^nx\s+hybrid$/i.test(normalized)) {
    return 'nx-hybrid';
  }

  // NX PHEV (Plug-in Hybrid)
  if (/^nx\s+phev$/i.test(normalized) || /nx.*plug[-\s]*in/i.test(normalized)) {
    return 'nx-phev';
  }

  // RX Hybrid
  if (/^rxh$/i.test(lower) || /^rx\s+hybrid$/i.test(normalized)) {
    return 'rx-hybrid';
  }

  // TX Hybrid (TXh)
  if (/^txh$/i.test(lower) || /^tx\s+hybrid$/i.test(normalized)) {
    return 'txh';
  }

  // TX PHEV
  if (/^tx\s+phev$/i.test(normalized) || /tx.*plug[-\s]*in/i.test(normalized)) {
    return 'tx-phev';
  }

  // LX Hybrid (LXh)
  if (/^lxh$/i.test(lower) || /^lx\s+hybrid$/i.test(normalized)) {
    return 'lxh';
  }

  // ES Hybrid
  if (/^esh$/i.test(lower) || /^es\s+hybrid$/i.test(normalized)) {
    return 'es-hybrid';
  }

  // Fallback: lowercase + hyphenated words
  // e.g. "RC F" → "rc-f", "IS 500" → "is-500", "TX" → "tx"
  return lower.replace(/\s+/g, '-');
}

/**
 * Build a Cloudflare R2 jellybean image URL using the same path convention
 * as the model-page-generator schema.ts / generator.ts:
 *   {R2_BASE}/assets/{brandSlug}/{year}/{assetSlug}/{year}-{brandSlug}-{assetSlug}-jellybean.webp
 *
 * brandSlug: lowercase make (toyota, lexus, bmw)
 * assetSlug: slugify(model) — same slugify() used by model-page-generator
 *
 * Returns null if required fields are missing.
 */
export function buildImageUrl(
  make: string | null | undefined,
  model: string | null | undefined,
  year: number | null | undefined,
): string | null {
  if (!make || !model || !year) return null;
  const brandSlug = make.trim().toLowerCase();
  const normalizedModel = normalizeModelForImageSlug(make, model);
  const assetSlug = slugify(normalizedModel);
  if (isDemoMode()) {
    return `${jellybeanAssetPrefix()}/${brandSlug}/${year}/${year}-${brandSlug}-${assetSlug}-jellybean.webp`;
  }
  return `${jellybeanAssetPrefix()}/${brandSlug}/${year}/${assetSlug}/${year}-${brandSlug}-${assetSlug}-jellybean.webp`;
}

/**
 * Normalize model names for image asset slugs so that hybrid / powertrain
 * variants share the same base image as the non-hybrid models.
 *
 * Examples:
 *   "Tundra i-FORCE MAX"   → "Tundra"
 *   "Highlander Hybrid"    → "Highlander"
 *   "Grand Highlander Hybrid" → "Grand Highlander"
 */
function normalizeModelForImageSlug(
  make: string | null | undefined,
  model: string | null | undefined,
): string {
  const original = model?.trim() ?? '';
  if (!original) return '';

  let result = original;

  // Strip trailing "Hybrid" (and anything after) for hybrid variants
  result = result.replace(/\s+hybrid.*$/i, '');

  // For Toyota, strip trailing "i-FORCE MAX" (and anything after)
  if (make && make.trim().toLowerCase() === 'toyota') {
    result = result.replace(/\s+i-force\s+max.*$/i, '');
  }

  // Fallback to original if we accidentally stripped everything
  result = result.trim();
  return result || original;
}

/**
 * Resolve image URL for an offer: use stored imageUrl if present, otherwise compute
 * from make/model/year (make falls back to storeCode for NEW/CERTIFIED offers).
 * Same logic as Offer Details page AssetsSection.
 */
export function getImageUrlForOffer(
  offer: {
    imageUrl?: string | null;
    make?: string | null;
    model?: string | null;
    year?: number | null;
    storeCode: string;
  }
): string | null {
  if (offer.imageUrl) return offer.imageUrl;
  const make = offer.make?.trim() || getMakeForStoreCode(offer.storeCode);
  return buildImageUrl(make, offer.model, offer.year);
}
