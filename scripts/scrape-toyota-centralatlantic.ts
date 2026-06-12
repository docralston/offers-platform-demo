/**
 * CLI entry for Toyota Central Atlantic scraper.
 * Run: npx tsx scripts/scrape-toyota-centralatlantic.ts
 * Optional: SKIP_DB=1 to skip DB write (dry run).
 */

import { runCentralAtlanticScraper } from '../lib/scrapers/buyatoyota/run';

async function main() {
  const skipDb = process.env.SKIP_DB === '1';
  const headless = process.env.HEADLESS === '0' ? false : true;

  const summary = await runCentralAtlanticScraper({
    skipDb,
    headless,
    updatedBy: null,
  });

  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.success ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
