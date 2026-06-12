import {
  demoFlatAssetPath,
  demoModelPageImagePath,
  rewriteProdAssetPathForDemo,
} from '@/lib/demo/model-page-assets';

describe('demo model page assets', () => {
  test('demoModelPageImagePath uses flat layout', () => {
    expect(demoModelPageImagePath('toyota', 2026, 'corolla', 'hero')).toBe(
      '/toyota/2026/2026-toyota-corolla-hero.webp'
    );
  });

  test('rewriteProdAssetPathForDemo flattens nested prod path', () => {
    expect(
      rewriteProdAssetPathForDemo('/assets/toyota/2026/corolla/2026-toyota-corolla-hero.webp')
    ).toBe('/toyota/2026/2026-toyota-corolla-hero.webp');
  });

  test('demoFlatAssetPath matches public folder layout', () => {
    expect(demoFlatAssetPath('bmw', 2026, 'x3', 'jellybean')).toBe(
      'bmw/2026/2026-bmw-x3-jellybean.webp'
    );
  });
});
