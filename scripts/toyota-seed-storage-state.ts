/**
 * Seed a Playwright storageState file for BuyAToyota by using an interactive headed session.
 *
 * This is useful when WAF blocks automated sessions unless cookies/localStorage are present
 * from a previously \"trusted\" browser session.
 *
 * Usage:
 *   TOYOTA_USER_DATA_DIR=.playwright/toyota-session \\
 *   TOYOTA_STORAGE_STATE_PATH=.playwright/toyota-storage.json \\
 *   PLAYWRIGHT_CHANNEL=chrome \\
 *   node --loader tsx scripts/toyota-seed-storage-state.ts
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { chromium } from 'playwright';
import { BUYATOYOTA_OFFERS_URL } from '../lib/ingestion/toyota/constants';

async function main() {
  const userDataDirRaw = process.env.TOYOTA_USER_DATA_DIR || '.playwright/toyota-session';
  const storagePathRaw =
    process.env.TOYOTA_STORAGE_STATE_PATH || '.playwright/toyota-storage.json';
  const channel = process.env.PLAYWRIGHT_CHANNEL === 'chrome' ? 'chrome' : undefined;

  const userDataDir = path.isAbsolute(userDataDirRaw)
    ? userDataDirRaw
    : path.join(process.cwd(), userDataDirRaw);
  const storagePath = path.isAbsolute(storagePathRaw)
    ? storagePathRaw
    : path.join(process.cwd(), storagePathRaw);

  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(path.dirname(storagePath), { recursive: true });

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel,
    ignoreDefaultArgs: ['--enable-automation'],
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
    ],
    viewport: { width: 1280, height: 720 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });

  const page = context.pages()[0] ?? (await context.newPage());

  // Try to navigate with retries (same logic as scraper)
  console.log('Navigating to BuyAToyota offers page...');
  let attempts = 0;
  const maxAttempts = 3;
  let success = false;

  while (attempts <= maxAttempts && !success) {
    try {
      if (attempts === 0) {
        await page.goto(BUYATOYOTA_OFFERS_URL, {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        });
      } else {
        console.log(`Reloading (attempt ${attempts + 1}/${maxAttempts + 1})...`);
        await page.waitForTimeout(2000 * attempts);
        await page.reload({ waitUntil: 'networkidle', timeout: 60000 });
      }

      await page.waitForTimeout(2000);

      const title = await page.title().catch(() => '');
      const url = page.url();
      const bodyText = await page
        .evaluate(() => document.body?.textContent?.trim() || '')
        .catch(() => '');

      console.log(`\nPage title: "${title}"`);
      console.log(`Page URL: ${url}`);
      console.log(`Body text length: ${bodyText.length} chars`);

      // Check if it looks like real content (not maintenance)
      const isMaintenance = title.toLowerCase().includes('toyota cars, trucks, suvs');
      const isBlank = bodyText.length < 100;

      if (!isMaintenance && !isBlank) {
        success = true;
        console.log('✓ Page appears to be loaded successfully!');
      } else {
        console.log('⚠ Page still looks like maintenance/blank. Will retry...');
        attempts++;
      }
    } catch (err) {
      console.error(`Navigation attempt ${attempts + 1} failed:`, err);
      attempts++;
    }
  }

  if (!success) {
    console.warn(
      '\n⚠ Warning: Page may still be showing maintenance/WAF. Proceeding anyway...'
    );
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => {
    rl.question(
      '\nVerify the page looks correct (not maintenance/WAF), then press Enter to save storageState...\n',
      () => resolve()
    );
  });
  rl.close();

  await context.storageState({ path: storagePath });
  console.log(`Saved storageState to: ${storagePath}`);

  await context.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

