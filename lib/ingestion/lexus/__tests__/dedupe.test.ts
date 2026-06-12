import { OfferStatus, VehicleCondition } from '@prisma/client';
import { dedupeAndWarnLexusRows } from '@/lib/ingestion/lexus/dedupe';
import type { NormalizedLexusOffer } from '@/lib/ingestion/lexus/normalize';

function makeRow(overrides: Partial<NormalizedLexusOffer>): NormalizedLexusOffer {
  return {
    storeCode: 'LEXDT',
    storeCodes: ['LEXDT', 'LEXWG'],
    make: 'Lexus',
    model: 'RX',
    year: 2026,
    trim: null,
    modelCode: null,
    condition: VehicleCondition.NEW,
    startDate: '2026-04-01',
    endDate: '2026-04-30',
    status: OfferStatus.LIVE,
    inventoryUrl: null,
    imageUrl: null,
    offerType: 'Finance',
    leasePayment: null,
    leaseTerm: null,
    leaseMiles: null,
    dueAtSigning: null,
    acquisitionFee: 895,
    downPayment: null,
    msrp: null,
    discount: null,
    buyFor: null,
    stockNumber: null,
    aprRate: 3.49,
    aprTermMonths: 60,
    rebateTotal: null,
    customerCash: null,
    leaseCash: null,
    aprCash: null,
    bonusCash: null,
    disclaimer: null,
    additionalNotes: null,
    sourceCategory: 'new',
    sourceOfferId: '34960',
    sourceFingerprint: 'fp',
    msrpSource: 'none',
    ...overrides,
  };
}

describe('dedupeAndWarnLexusRows', () => {
  test('keeps finance rows for different models even with same offerId', () => {
    const rows: NormalizedLexusOffer[] = [
      makeRow({ sourceOfferId: '34960', model: 'RX' }),
      makeRow({ sourceOfferId: '34960', model: 'NX' }),
    ];

    const result = dedupeAndWarnLexusRows(rows);
    expect(result.rows).toHaveLength(2);
    expect(result.warningGroups).toHaveLength(0);
  });

  test('prefers MSRP + DPH variant for same-context lease duplicates', () => {
    const plain = makeRow({
      offerType: 'Lease',
      aprRate: null,
      aprTermMonths: null,
      leasePayment: 469,
      leaseTerm: 39,
      dueAtSigning: 3999,
      msrp: 41795,
      sourceOfferId: 'UX-LEASE-1',
      sourceFingerprint: 'plain',
      disclaimer: 'Lease example based on vehicle MSRP of $41,795.',
      msrpSource: 'disclaimer',
      model: 'UX',
      trim: 'Hybrid',
    });
    const withDph = makeRow({
      ...plain,
      sourceFingerprint: 'dph',
      disclaimer:
        'Lease example based on vehicle MSRP of $42,920 including Delivery Processing and Handling (DPH).',
      msrp: 42920,
    });

    const result = dedupeAndWarnLexusRows([plain, withDph]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.msrp).toBe(42920);
    expect(result.warningGroups).toHaveLength(1);
    expect(result.warningGroups[0]?.differingFields).toContain('msrp');
  });

  test('warns and keeps both rows when conflicts exceed MSRP-only fields', () => {
    const a = makeRow({ sourceOfferId: '34960', sourceFingerprint: 'a', aprRate: 3.49 });
    const b = makeRow({ sourceOfferId: '34960', sourceFingerprint: 'b', aprRate: 3.99 });

    const result = dedupeAndWarnLexusRows([a, b]);
    expect(result.rows).toHaveLength(2);
    expect(result.warningGroups).toHaveLength(1);
    expect(result.warningGroups[0]?.differingFields).toContain('aprRate');
  });

  test('drops red-flag duplicate lease rows with same model/year and term/payment', () => {
    const a = makeRow({
      offerType: 'Lease',
      model: 'NX',
      trim: 'Premium AWD',
      leaseTerm: 39,
      leasePayment: 469,
      dueAtSigning: 3999,
      sourceFingerprint: 'a',
      sourceOfferId: 'NX-A',
      aprRate: null,
      aprTermMonths: null,
    });
    const b = makeRow({
      offerType: 'Lease',
      model: 'NX',
      trim: 'Luxury AWD',
      leaseTerm: 39,
      leasePayment: 469,
      dueAtSigning: 4299,
      capCostReduction: 2000,
      sourceFingerprint: 'b',
      sourceOfferId: 'NX-B',
      aprRate: null,
      aprTermMonths: null,
    });

    const result = dedupeAndWarnLexusRows([a, b]);
    expect(result.rows).toHaveLength(1);
    expect(result.warningGroups.some((w) => w.message.includes('Red-flag duplicate lease rows'))).toBe(true);
  });
});

