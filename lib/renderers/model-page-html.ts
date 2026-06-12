import { safeHrefUrl } from '@/lib/domain/safe-url';
import { sanitizeEditorialHtml } from '@/lib/sanitize/editorial-html';

/**
 * Renders a single ModelYearPage as full HTML for admin preview.
 * Minimal implementation: no full DDC template port; sufficient for split-view preview.
 */

export interface ModelYearPageForHtml {
  make: string;
  model: string;
  year: number;
  seo?: { title?: string; metaDescription?: string } | null;
  heroSubhead?: string | null;
  whyBullets?: [string, string, string] | null;
  trims?: {
    intro?: string;
    sections?: Array<{
      title: string;
      items?: Array<{ label: string; note?: string }>;
    }>;
  } | null;
  faqs?: Array<{ q: string; a: string }> | null;
  contentSections?: Array<{
    id: string;
    title: string;
    intent?: string;
    bodyHtml: string;
  }> | null;
  localSeoSummary?: string | null;
  links?: { inventoryHref?: string } | null;
  images?: {
    hero?: { alt?: string; path?: string };
    vehicleJellybean?: { alt?: string; path?: string };
  } | null;
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Returns full HTML document for the given model-year page. Optional baseUrl
 * is prepended to image paths (e.g. store siteUrl).
 */
export function renderModelPageToHtml(
  page: ModelYearPageForHtml,
  options?: { baseUrl?: string; accentColor?: string }
): string {
  const base = (options?.baseUrl ?? '').replace(/\/+$/, '');
  const accent = options?.accentColor ?? '#EB0A1E';

  const title = page.seo?.title ?? `${page.year} ${page.make} ${page.model}`;
  const metaDesc = page.seo?.metaDescription ?? '';
  const heroImg = page.images?.hero;
  const heroSrc = heroImg?.path ? (base ? `${base}${heroImg.path.startsWith('/') ? '' : '/'}${heroImg.path}` : heroImg.path) : '';
  const heroAlt = heroImg?.alt ?? `${page.year} ${page.make} ${page.model}`;

  const whyBullets = page.whyBullets ?? [];
  const bulletsHtml = whyBullets
    .filter(Boolean)
    .map((b) => `<li>${escapeHtml(b)}</li>`)
    .join('');

  let trimsHtml = '';
  if (page.trims?.intro) {
    trimsHtml += `<p>${escapeHtml(page.trims.intro)}</p>`;
  }
  for (const sec of page.trims?.sections ?? []) {
    trimsHtml += `<h3>${escapeHtml(sec.title)}</h3><ul>`;
    for (const item of sec.items ?? []) {
      trimsHtml += `<li>${escapeHtml(item.label)}${item.note ? ` — ${escapeHtml(item.note)}` : ''}</li>`;
    }
    trimsHtml += '</ul>';
  }

  let contentSectionsHtml = '';
  for (const sec of page.contentSections ?? []) {
    if (!sec) continue;
    const title = sec.title ?? '';
    const body = sec.bodyHtml ?? '';
    if (!title && !body) continue;
    const safeBody = sanitizeEditorialHtml(body);
    contentSectionsHtml += `<h2>${escapeHtml(title)}</h2><div>${safeBody}</div>`;
  }

  const faqs = page.faqs ?? [];
  const faqHtml = faqs
    .map(
      (f) =>
        `<dt>${sanitizeEditorialHtml(f.q)}</dt><dd>${sanitizeEditorialHtml(f.a)}</dd>`,
    )
    .join('');

  const invHref = safeHrefUrl(page.links?.inventoryHref, '#');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(metaDesc)}">
  <style>
    .tto-scope { font-family: system-ui, -apple-system, sans-serif; color: #111; max-width: 900px; margin: 0 auto; padding: 24px; }
    .tto-scope h1 { font-size: 1.75rem; margin-bottom: 8px; }
    .tto-scope h2 { font-size: 1.25rem; margin-top: 24px; margin-bottom: 8px; color: ${accent}; }
    .tto-scope h3 { font-size: 1rem; margin-top: 16px; margin-bottom: 4px; }
    .tto-scope ul { margin: 8px 0; padding-left: 20px; }
    .tto-scope li { margin: 4px 0; }
    .tto-scope .hero-img { width: 100%; max-width: 800px; height: auto; display: block; margin: 16px 0; }
    .tto-scope a { color: ${accent}; text-decoration: none; }
    .tto-scope a:hover { text-decoration: underline; }
    .tto-scope dl { margin: 8px 0; }
    .tto-scope dt { font-weight: 600; margin-top: 12px; }
    .tto-scope dd { margin-left: 0; padding-left: 16px; margin-bottom: 8px; }
  </style>
</head>
<body>
  <section class="tto-scope">
    <h1>${escapeHtml(String(page.year))} ${escapeHtml(page.make)} ${escapeHtml(page.model)}</h1>
    ${heroSrc ? `<img class="hero-img" src="${escapeHtml(heroSrc)}" alt="${escapeHtml(heroAlt)}" loading="lazy">` : ''}
    <p>${escapeHtml(page.heroSubhead ?? '')}</p>
    ${page.localSeoSummary ? `<p>${escapeHtml(page.localSeoSummary)}</p>` : ''}
    <p><a href="${escapeHtml(invHref)}">View inventory</a></p>

    <h2>Why the ${escapeHtml(String(page.year))} ${escapeHtml(page.model)}</h2>
    <ul>${bulletsHtml || '<li>—</li>'}</ul>

    <h2>Trims</h2>
    ${trimsHtml || '<p>—</p>'}

    ${contentSectionsHtml}

    <h2>${escapeHtml(String(page.year))} ${escapeHtml(page.model)} FAQ</h2>
    <dl>${faqHtml || '<dt>—</dt><dd>—</dd>'}</dl>
  </section>
</body>
</html>`;
}
