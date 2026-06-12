const R2_ASSET_HOST = /^https:\/\/pub-[a-f0-9]+\.r2\.dev\//i;

/** Base URL so relative `/demo/assets/...` paths resolve during headless HTML capture. */
export function getHtmlRenderBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, '');
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    return `https://${vercel.replace(/\/+$/, '')}`;
  }
  const port = process.env.PORT?.trim() || '3000';
  return `http://127.0.0.1:${port}`;
}

/** Resolve relative asset URLs during Playwright capture (setContent has no baseURL option). */
export function prepareHtmlForRenderCapture(html: string, baseUrl = getHtmlRenderBaseUrl()): string {
  const baseHref = `${baseUrl.replace(/\/+$/, '')}/`;
  const baseTag = `<base href="${baseHref}">`;
  if (/<head\b/i.test(html)) {
    return html.replace(/<head(\s[^>]*)?>/i, (match) => `${match}${baseTag}`);
  }
  if (/<html\b/i.test(html)) {
    return html.replace(/<html(\s[^>]*)?>/i, (match) => `${match}<head>${baseTag}</head>`);
  }
  return `<!doctype html><html><head>${baseTag}</head><body>${html}</body></html>`;
}

function configuredAssetBaseHost(): string | null {
  const raw = process.env.ASSETS_R2_BASE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw.startsWith('http') ? raw : `https://${raw}`).origin;
  } catch {
    return null;
  }
}

/** Allow vehicle/placeholder images through Playwright's network filter during banner capture. */
export function isAllowedRenderAssetRequest(url: string, resourceType: string): boolean {
  if (resourceType !== 'image') return false;
  if (url.startsWith('data:')) return true;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (R2_ASSET_HOST.test(url)) return true;

  const assetHost = configuredAssetBaseHost();
  if (assetHost && parsed.origin === assetHost) return true;

  const base = new URL(getHtmlRenderBaseUrl());
  if (parsed.origin === base.origin && parsed.pathname.startsWith('/demo/assets/')) {
    return true;
  }

  if (
    (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
    parsed.pathname.startsWith('/demo/assets/')
  ) {
    return true;
  }

  return false;
}

export async function waitForBannerImages(page: import('playwright-core').Page): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const imgs = Array.from(document.querySelectorAll('img'));
        if (imgs.length === 0) return true;
        return imgs.every((img) => img.complete);
      },
      { timeout: 12_000 },
    )
    .catch(() => undefined);
}
