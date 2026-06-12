import { config } from 'dotenv';
import { demoEndDateEastern, demoStartDateEastern } from '@/lib/config/demo';
import { useDemoDatabaseFromEnv } from './lib/ensure-demo-database';
import { seedDemoOffers } from './lib/demo-seed';

config({ path: '.env' });
config({ path: '.env.local', override: true });

async function main() {
  useDemoDatabaseFromEnv();
  process.env.DEMO_MODE = 'true';
  const { prisma } = await import('@/lib/prisma');
  const upserted = await seedDemoOffers(prisma);
  const startDate = demoStartDateEastern();
  const endDate = demoEndDateEastern();
  console.log(`Demo seed complete: ${upserted} offers (${startDate.toISOString()} → ${endDate.toISOString()})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
