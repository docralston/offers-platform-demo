/**
 * Replace demo asset URLs on offers with production R2 jellybean URLs.
 *
 * Usage (production DB from .env.local DATABASE_URL):
 *   npx tsx scripts/repair-offer-image-urls.ts
 *
 * Dry run:
 *   npx tsx scripts/repair-offer-image-urls.ts --dry-run
 */
import { config } from 'dotenv';
import { buildImageUrl } from '@/lib/domain/offer-assets';
import { getMakeForStoreCode } from '@/lib/config/stores';

config({ path: '.env' });
config({ path: '.env.local', override: true });

const dryRun = process.argv.includes('--dry-run');

function needsImageUrlRepair(url: string | null | undefined): boolean {
  if (!url) return false;
  if (
    url.includes('offers-platform-demo.vercel.app') ||
    url.includes('/demo/assets/') ||
    url.includes('demo/assets/')
  ) {
    return true;
  }
  // R2 jellybeans live under /assets/; repair rows written without that segment.
  if (url.includes('r2.dev/') && !url.includes('r2.dev/assets/')) {
    return true;
  }
  return false;
}

async function main() {
  delete process.env.DEMO_MODE;

  const { prisma } = await import('@/lib/prisma');
  const offers = await prisma.offer.findMany({
    where: {
      imageUrl: { not: null },
    },
    select: {
      id: true,
      storeCode: true,
      make: true,
      model: true,
      year: true,
      imageUrl: true,
    },
  });

  const toRepair = offers.filter((o) => needsImageUrlRepair(o.imageUrl));
  if (toRepair.length === 0) {
    console.log('No offers with demo or broken R2 image URLs found.');
    return;
  }

  console.log(`Found ${toRepair.length} offer(s) to repair.`);

  let updated = 0;
  for (const offer of toRepair) {
    const make = offer.make?.trim() || getMakeForStoreCode(offer.storeCode);
    const nextUrl = buildImageUrl(make, offer.model, offer.year);
    console.log(`${offer.model} (${offer.id.slice(0, 8)}…)`);
    console.log(`  was: ${offer.imageUrl}`);
    console.log(`  now: ${nextUrl ?? '(null — computed at render time)'}`);

    if (!dryRun) {
      await prisma.offer.update({
        where: { id: offer.id },
        data: { imageUrl: nextUrl },
      });
      updated += 1;
    }
  }

  console.log(dryRun ? 'Dry run only — no rows updated.' : `Updated ${updated} offer(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
