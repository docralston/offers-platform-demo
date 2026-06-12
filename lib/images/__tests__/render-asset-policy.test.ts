import {
  getHtmlRenderBaseUrl,
  isAllowedRenderAssetRequest,
  prepareHtmlForRenderCapture,
} from '@/lib/images/render-asset-policy';

describe('render asset policy', () => {
  test('isAllowedRenderAssetRequest allows R2 and demo asset images', () => {
    expect(
      isAllowedRenderAssetRequest(
        'https://demo-assets.example.com/assets/toyota/2026/camry/x.webp',
        'image',
      ),
    ).toBe(true);
    expect(
      isAllowedRenderAssetRequest('http://127.0.0.1:3000/demo/assets/toyota/2026/camry.webp', 'image'),
    ).toBe(true);
    expect(isAllowedRenderAssetRequest('https://example.com/track.js', 'script')).toBe(false);
    expect(isAllowedRenderAssetRequest('https://example.com/photo.webp', 'image')).toBe(false);
  });

  test('prepareHtmlForRenderCapture injects a base tag for relative assets', () => {
    const html = '<html><head></head><body><img src="/demo/assets/toyota/camry.webp" /></body></html>';
    expect(prepareHtmlForRenderCapture(html, 'https://demo.example.com')).toContain(
      '<base href="https://demo.example.com/">',
    );
  });

  test('getHtmlRenderBaseUrl falls back to local dev origin', () => {
    const prev = { ...process.env };
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.APP_URL;
    delete process.env.VERCEL_URL;
    process.env.PORT = '3000';
    expect(getHtmlRenderBaseUrl()).toBe('http://127.0.0.1:3000');
    process.env = prev;
  });
});
