import { config } from 'dotenv';
import { demoEndDateEastern, demoStartDateEastern } from '@/lib/config/demo';
import { useDemoDatabaseFromEnv } from './lib/ensure-demo-database';
import { resetDemoOffers } from './lib/demo-seed';

config({ path: '.env' });
config({ path: '.env.local', override: true });

async function main() {
  useDemoDatabaseFromEnv();
  process.env.DEMO_MODE = 'true';
  const { prisma } = await import('@/lib/prisma');
  const { cleared, seeded } = await resetDemoOffers(prisma);
  const startDate = demoStartDateEastern();
  const endDate = demoEndDateEastern();
  console.log(
    `Demo reset complete: cleared ${cleared} offers, seeded ${seeded} (${startDate.toISOString()} → ${endDate.toISOString()})`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
