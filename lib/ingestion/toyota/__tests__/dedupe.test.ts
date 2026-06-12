import { dedupeByTrimRelevance } from '@/lib/ingestion/toyota/dedupe';
import type { NormalizedToyotaOffer } from '@/lib/ingestion/toyota/normalize';
import { OfferStatus, VehicleCondition } from '@prisma/client';

function baseRow(overrides: Partial<NormalizedToyotaOffer> = {}): NormalizedToyotaOffer {
  return {
    storeCode: 'TOY',
    make: 'Toyota',
    model: 'Camry',
    year: 2026,
    trim: null,
    condition: VehicleCondition.NEW,
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    status: OfferStatus.LIVE,
    offerType: 'Lease',
    leasePayment: 299,
    leaseTerm: 36,
    leaseMiles: null,
    dueAtSigning: null,
    acquisitionFee: null,
    downPayment: null,
    msrp: null,
    discount: null,
    buyFor: null,
    stockNumber: null,
    aprRate: null,
    aprTermMonths: null,
    rebateTotal: null,
    customerCash: null,
    leaseCash: null,
    aprCash: null,
    bonusCash: null,
    disclaimer: null,
    additionalNotes: null,
    inventoryUrl: null,
    imageUrl: null,
    programId: null,
    ...overrides,
  };
}

describe('toyota per-trim relevance dedupe', () => {
  it('keeps only one row when only trim differs', () => {
    const rows = [
      baseRow({ trim: 'SE' }),
      baseRow({ trim: 'LE' }),
    ];

    const out = dedupeByTrimRelevance(rows);
    expect(out).toHaveLength(1);
    // Deterministic representative: first alphabetically (blank last) => LE
    expect(out[0].trim).toBe('LE');
  });

  it('emits multiple rows when a non-trim field differs', () => {
    const rows = [
      baseRow({ trim: 'LE', leasePayment: 299 }),
      baseRow({ trim: 'SE', leasePayment: 319 }),
    ];

    const out = dedupeByTrimRelevance(rows);
    expect(out).toHaveLength(2);
    const payments = out.map((r) => r.leasePayment).sort();
    expect(payments).toEqual([299, 319]);
  });
});

