import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

// Use the shared Node renderer from lab so tests exercise the same path
 
const { renderModelYearPage } = require('../../../lab/modelpager/scripts/render-model-page') as {
  renderModelYearPage: (templateHtml: string, store: unknown, page: unknown) => string;
};

function loadJson<T>(p: string): T {
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw) as T;
}

describe('renderModelYearPage', () => {
  const ROOT = path.resolve(__dirname, '../../..');
  const templatePath = path.join(
    ROOT,
    'lab',
    'modelpager',
    'templates',
    'model-year-toyota.html',
  );
  const templateHtml = fs.readFileSync(templatePath, 'utf8');

  it('renders full SEO shell and microdata for a sample Toyota page', () => {
    const storePath = path.join(
      ROOT,
      'lab',
      'modelpager',
      'configs',
      'stores',
      'toyota',
      'toy.json',
    );
    const pagePath = path.join(
      ROOT,
      'lab',
      'modelpager',
      'configs',
      'pages',
      'toyota',
      '2026',
      'rav4.json',
    );

    const store = loadJson<any>(storePath);
    const page = loadJson<any>(pagePath);

    const html = renderModelYearPage(templateHtml, store, page);

    // Head basics
    expect(html.toLowerCase()).toContain('<!doctype html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toMatch(/<title>[\s\S]*RAV4/i);
    expect(html).toMatch(/<meta name="description"[^>]+>/i);
    expect(html).toContain('<link rel="canonical"');

    // Cloudflare hero + jellybean images (via assets.r2BaseUrl)
    expect(html).toContain('assets/toyota/2026/rav4/2026-toyota-rav4-hero');
    expect(html).toContain('assets/toyota/2026/rav4/2026-toyota-rav4-jellybean');
    expect(html).toContain(store.assets.r2BaseUrl);

    // Core microdata blocks
    expect(html).toContain('<script type="application/ld+json">');
    expect(html).toContain('"@type":"Car"');
    expect(html).toContain('itemscope itemtype="https://schema.org/BreadcrumbList"');
    expect(html).toContain('itemscope itemtype="https://schema.org/ItemList"');
    expect(html).toContain('itemscope itemtype="https://schema.org/FAQPage"');
  });
});

