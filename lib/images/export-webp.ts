import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  isAllowedRenderAssetRequest,
  prepareHtmlForRenderCapture,
  waitForBannerImages,
} from '@/lib/images/render-asset-policy';

const isVercel = process.env.VERCEL === '1';

async function resolveChromiumExecutable(
  chromiumPkg: typeof import('@sparticuz/chromium').default,
): Promise<string> {
  try {
    return await chromiumPkg.executablePath();
  } catch (error) {
    const binPath = path.join(process.cwd(), 'node_modules', '@sparticuz/chromium', 'bin');
    if (existsSync(binPath)) {
      return chromiumPkg.executablePath(binPath);
    }
    throw error;
  }
}

async function launchBrowser(): Promise<import('playwright-core').Browser> {
  if (isVercel) {
    const chromiumPkg = (await import('@sparticuz/chromium')).default;
    chromiumPkg.setGraphicsMode = false;
    const { chromium: playwright } = await import('playwright-core');
    const executablePath = await resolveChromiumExecutable(chromiumPkg);
    return playwright.launch({
      args: chromiumPkg.args,
      executablePath,
      headless: true,
    });
  }

  const { chromium } = await import('playwright');
  return (await chromium.launch({ headless: true })) as unknown as import('playwright-core').Browser;
}

export async function renderHtmlToWebpBuffer(input: {
  html: string;
  width: number;
  height: number;
  quality?: number;
}): Promise<Buffer> {
  let browser: import('playwright-core').Browser | null = null;
  let page: import('playwright-core').Page | null = null;

  try {
    browser = await launchBrowser();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('renderHtmlToWebpBuffer: browser launch failed', error);
    if (isVercel || message.toLowerCase().includes('executable')) {
      throw new Error(
        `Image generation failed to start headless Chromium on Vercel (${message}). Redeploy after confirming @sparticuz/chromium is installed and traced in next.config.js.`,
      );
    }
    throw error;
  }

  try {
    page = await browser.newPage({
      viewport: { width: input.width, height: input.height },
      deviceScaleFactor: 2,
    });
    await page.route('**/*', (route) => {
      const url = route.request().url();
      const resourceType = route.request().resourceType();
      if (url.startsWith('data:') || url === 'about:blank') {
        route.continue();
        return;
      }
      if (isAllowedRenderAssetRequest(url, resourceType)) {
        route.continue();
        return;
      }
      route.abort('blockedbyclient');
    });
    await page.setContent(prepareHtmlForRenderCapture(input.html), {
      waitUntil: 'domcontentloaded',
    });
    await waitForBannerImages(page);
    const png = await page.screenshot({ type: 'png' });
    const quality = Math.max(40, Math.min(95, input.quality ?? 82));
    return await sharp(png).webp({ quality, effort: 5 }).toBuffer();
  } finally {
    await page?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
