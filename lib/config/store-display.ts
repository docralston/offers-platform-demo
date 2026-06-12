import {
  DEMO_STORE_DISPLAY_IDS,
  DEMO_STORE_DISPLAY_NAMES,
  inDemoMode,
} from '@/lib/config/demo';
import { STORE_CODES, STORE_DISPLAY_NAMES, type StoreCode } from '@/lib/config/stores';

const DEMO_DISPLAY_ID_TO_STORE: Record<string, StoreCode> = {
  TOYDT: 'TOY',
  BMWDT: 'BMW',
  LEXDT: 'LEXDT',
  LEXEX: 'LEXWG',
};

/** Map demo public store ID (TOYDT) or internal code (TOY) → internal StoreCode. */
export function resolveInternalStoreCode(storeIdOrCode: string): StoreCode | null {
  const upper = storeIdOrCode.trim().toUpperCase();
  if (inDemoMode() && upper in DEMO_DISPLAY_ID_TO_STORE) {
    return DEMO_DISPLAY_ID_TO_STORE[upper];
  }
  if ((STORE_CODES as readonly string[]).includes(upper)) {
    return upper as StoreCode;
  }
  return null;
}

/** Public store identifier (TOYDT on demo; TOY/BMW/LEXDT/LEXWG in prod). */
export function getStoreDisplayId(storeCode: string): string {
  const internal = resolveInternalStoreCode(storeCode) ?? (storeCode as StoreCode);
  if (inDemoMode() && internal in DEMO_STORE_DISPLAY_IDS) {
    return DEMO_STORE_DISPLAY_IDS[internal as StoreCode];
  }
  return storeCode;
}

export function getStoreDisplayName(storeCode: string): string {
  const internal = resolveInternalStoreCode(storeCode) ?? (storeCode as StoreCode);
  if (inDemoMode() && internal in DEMO_STORE_DISPLAY_NAMES) {
    return DEMO_STORE_DISPLAY_NAMES[internal as StoreCode];
  }
  return STORE_DISPLAY_NAMES[internal as StoreCode] ?? storeCode;
}

const PROD_BANNER_DISPLAY_NAMES: Record<StoreCode, string> = {
  TOY: 'Toyota of Demotown',
  LEXDT: 'Lexus of Demotown',
  LEXWG: 'Lexus of Exampleville',
  BMW: 'BMW of\nDemotown',
};

/** Two-line store name for image banners. */
export function getStoreBannerDisplayName(storeCode: string): string {
  const internal = (resolveInternalStoreCode(storeCode) ?? storeCode) as StoreCode;
  if (inDemoMode()) {
    const name = getStoreDisplayName(internal);
    const ofIdx = name.indexOf(' of ');
    if (ofIdx === -1) return name;
    return `${name.slice(0, ofIdx + 4).trimEnd()}\n${name.slice(ofIdx + 4).trim()}`;
  }
  return PROD_BANNER_DISPLAY_NAMES[internal] ?? getStoreDisplayName(internal);
}

/** Cash-offer price line label in email/landing renderers. */
export function getBuyPriceLabel(): string {
  return inDemoMode() ? 'Demo Price' : 'Demo Price';
}

/** Serialize store code fields for public API responses in demo mode. */
export function serializeStoreCodeForPublic(storeCode: string): string {
  return getStoreDisplayId(storeCode);
}

export function serializeStoreCodesForPublic(storeCodes: string[] | null | undefined): string[] {
  if (!storeCodes?.length) return [];
  return storeCodes.map((c) => serializeStoreCodeForPublic(c));
}
