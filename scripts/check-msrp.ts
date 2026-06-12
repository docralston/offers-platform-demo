/**
 * Quick script to check MSRP values for Toyota Camry/Corolla offers.
 * Run: npx tsx scripts/check-msrp.ts
 */
import { prisma } from '@/lib/prisma';

async function main() {
  const offers = await prisma.offer.findMany({
    where: {
      storeCode: 'TOY',
      year: 2026,
      model: { in: ['Camry', 'Corolla'] },
      status: 'LIVE',
    },
    select: {
      id: true,
      model: true,
      trim: true,
      offerType: true,
      msrp: true,
      leasePayment: true,
      aprRate: true,
    },
  });
  console.log('Toyota 2026 Camry/Corolla offers (msrp column):');
  console.log(JSON.stringify(offers, null, 2));
  const withMsrp = offers.filter((o) => o.msrp != null && o.msrp > 0);
  console.log(`\n${withMsrp.length} of ${offers.length} have MSRP set`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
