import { describe, expect, test } from 'vitest';
import type { Offer } from '@prisma/client';
import { OfferStatus, VehicleCondition } from '@prisma/client';
import { buildWebSpecialsFinanceFineprint } from '@/lib/renderers/specials-shared';

const base = {
  storeCode: 'TOY',
  storeCodes: [] as string[],
  externalId: null,
  make: 'Toyota',
  model: 'Camry',
  series: null,
  trim: null,
  modelCode: null,
  condition: VehicleCondition.NEW,
  status: OfferStatus.LIVE,
  inventoryUrl: null,
  imageUrl: null,
  leasePayment: null,
  leaseTerm: null,
  leaseMiles: null,
  dueAtSigning: null,
  capCostReduction: null,
  acquisitionFee: null,
  downPayment: null,
  msrp: 30814,
  discount: null,
  buyFor: null,
  stockNumber: null,
  rebateTotal: null,
  customerCash: null,
  leaseCash: null,
  aprCash: null,
  bonusCash: null,
  disclaimer: null,
  additionalNotes: null,
  validationIssues: null,
  updatedBy: null,
  fuelType: 'GAS',
} satisfies Partial<Offer>;

function offer(p: Partial<Offer> & Pick<Offer, 'id' | 'year' | 'startDate' | 'endDate' | 'offerType'>): Offer {
  return { ...base, ...p } as Offer;
}

describe('buildWebSpecialsFinanceFineprint', () => {
  test('uses web specials finance disclaimer format', () => {
    const end = new Date('2026-06-30T12:00:00.000Z');
    const o = offer({
      id: 'camry',
      year: 2026,
      startDate: new Date('2026-06-01'),
      endDate: end,
      offerType: 'Finance',
      aprRate: 4.99,
      aprTermMonths: 60,
    });

    const fineprint = buildWebSpecialsFinanceFineprint([o], 'TOY', { docFee: 490 });
    expect(fineprint).toContain(
      '4.99% financing with 60 monthly payments of $18.87 for each $1,000 borrowed on 2026 Camry.'
    );
    expect(fineprint).toContain('Advertised price includes a $490 document fee.');
    expect(fineprint).toContain('Advertised price excludes tax, tags, registration and license fees.');
    expect(fineprint).toContain('Vehicle(s) eligible: all new in-stock 2026 Toyota Camry models.');
    expect(fineprint).toContain('On approved Tier 1+ credit through TFS, not all customers will qualify.');
    expect(fineprint).toContain('$0 security deposit.');
    expect(fineprint).toContain('$0 down payment required.');
    expect(fineprint).toContain('See Sales Consultant for full details.');
    expect(fineprint).toContain('Expires on June 30, 2026.');
  });

  test('returns null when card has no finance offer', () => {
    const o = offer({
      id: 'lease-only',
      year: 2026,
      startDate: new Date('2026-06-01'),
      endDate: new Date('2026-06-30'),
      offerType: 'Lease',
      leasePayment: 299,
      leaseTerm: 36,
      leaseMiles: 10000,
      dueAtSigning: 2999,
    });

    expect(buildWebSpecialsFinanceFineprint([o], 'TOY')).toBeNull();
  });
});
