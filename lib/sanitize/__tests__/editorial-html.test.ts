import { sanitizeEditorialHtml } from '@/lib/sanitize/editorial-html';
import { sanitizeWidgetHtml } from '@/lib/sanitize/widget-html';

describe('sanitizeEditorialHtml', () => {
  it('strips script tags and event handlers', () => {
    const dirty =
      '<p onclick="alert(1)">Hi</p><script>alert(1)</script><img src=x onerror=alert(1)>';
    const clean = sanitizeEditorialHtml(dirty);
    expect(clean).not.toMatch(/script|onerror|onclick/i);
    expect(clean).toContain('<p>Hi</p>');
  });

  it('allows safe editorial tags and https links', () => {
    const html =
      '<p>See <a href="https://example.com/inventory">inventory</a>.</p>';
    expect(sanitizeEditorialHtml(html)).toBe(html);
  });

  it('removes javascript: links', () => {
    const html = '<a href="javascript:alert(1)">bad</a>';
    const clean = sanitizeEditorialHtml(html);
    expect(clean).not.toContain('javascript:');
  });
});

describe('sanitizeWidgetHtml', () => {
  it('preserves widget structure and strips scripts', () => {
    const dirty = `<style>.card { color: red; }</style>
<div class="offers-widget-root">
  <article class="card"><h3 class="card-title">Camry</h3></article>
  <script>alert(1)</script>
</div>`;
    const clean = sanitizeWidgetHtml(dirty);
    expect(clean).toContain('<style>');
    expect(clean).toContain('card-title');
    expect(clean).not.toMatch(/<script/i);
  });

  it('strips onerror from images', () => {
    const dirty =
      '<img src="https://example.com/x.webp" alt="x" onerror="alert(1)">';
    const clean = sanitizeWidgetHtml(dirty);
    expect(clean).not.toContain('onerror');
    expect(clean).toContain('src="https://example.com/x.webp"');
  });
});
