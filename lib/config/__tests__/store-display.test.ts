import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  getStoreBannerDisplayName,
  getStoreDisplayId,
  getStoreDisplayName,
  resolveInternalStoreCode,
  serializeStoreCodeForPublic,
} from '@/lib/config/store-display';

describe('store-display (demo mode)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test('maps internal store codes to public demo store IDs', () => {
    vi.stubEnv('DEMO_MODE', 'true');
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');

    expect(getStoreDisplayId('TOY')).toBe('TOYDT');
    expect(getStoreDisplayId('BMW')).toBe('BMWDT');
    expect(getStoreDisplayId('LEXDT')).toBe('LEXDT');
    expect(getStoreDisplayId('LEXWG')).toBe('LEXEX');

    expect(resolveInternalStoreCode('TOYDT')).toBe('TOY');
    expect(resolveInternalStoreCode('LEXEX')).toBe('LEXWG');
    expect(serializeStoreCodeForPublic('BMW')).toBe('BMWDT');
  });

  test('keeps fictional dealer names separate from store IDs', () => {
    vi.stubEnv('DEMO_MODE', 'true');
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');

    expect(getStoreDisplayName('TOY')).toBe('Toyota of Demotown');
    expect(getStoreDisplayName('LEXWG')).toBe('Lexus of Exampleville');
    expect(getStoreBannerDisplayName('TOY')).toBe('Toyota of\nDemotown');
  });

  test('uses production store codes and labels when demo mode is off', () => {
    vi.stubEnv('DEMO_MODE', 'false');
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'false');

    expect(getStoreDisplayId('TOY')).toBe('TOY');
    expect(getStoreDisplayName('TOY')).toBe('Toyota');
    expect(getStoreBannerDisplayName('BMW')).toMatch(/^BMW of\n\w+/);
  });
});
