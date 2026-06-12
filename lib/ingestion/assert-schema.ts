import { prisma } from '@/lib/prisma';

/** Verify ingestion prerequisites (externalId column, INACTIVE enum value). */
export async function assertIngestionSchema(): Promise<void> {
  const externalIdCol = await prisma.$queryRaw<
    Array<{ column_name: string }>
  >`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'Offer' AND column_name = 'externalId' LIMIT 1`;

  const inactiveEnum = await prisma.$queryRaw<
    Array<{ enumlabel: string }>
  >`SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE (t.typname = 'OfferStatus' OR t.typname = 'offerstatus') AND e.enumlabel = 'INACTIVE' LIMIT 1`;

  if (externalIdCol.length === 0 || inactiveEnum.length === 0) {
    const missing: string[] = [];
    if (externalIdCol.length === 0) missing.push('Offer.externalId');
    if (inactiveEnum.length === 0) missing.push('OfferStatus.INACTIVE');
    throw new Error(
      [
        'Ingestion DB schema is not migrated.',
        `Missing: ${missing.join(', ')}`,
        'Run `npx prisma migrate deploy`.',
      ].join(' '),
    );
  }
}
