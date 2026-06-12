import { describe, expect, test } from 'vitest';
import type { Offer } from '@prisma/client';
import { OfferStatus, VehicleCondition } from '@prisma/client';
import { buildOfferDisclaimerText } from '@/lib/disclaimers/build-offer-disclaimer';

const base = {
  storeCode: 'LEXDT',
  storeCodes: [] as string[],
  externalId: null,
  make: 'Lexus',
  model: 'RX',
  series: null,
  trim: '350',
  modelCode: '2557',
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
  msrp: 50000,
  discount: null,
  buyFor: null,
  stockNumber: null,
  offerType: null,
  aprRate: null,
  aprTermMonths: null,
  financeRates: null,
  rebateTotal: null,
  customerCash: null,
  leaseCash: null,
  aprCash: null,
  bonusCash: null,
  disclaimer: null,
  additionalNotes: null,
  validationIssues: null,
  updatedBy: null,
  fuelType: null,
} satisfies Partial<Offer>;

function offer(p: Partial<Offer> & Pick<Offer, 'id' | 'year' | 'startDate' | 'endDate' | 'offerType'>): Offer {
  return { ...base, ...p } as Offer;
}

describe('buildOfferDisclaimerText', () => {
  test('minified output has no newlines', () => {
    const end = new Date('2026-04-30T12:00:00.000Z');
    const o = offer({
      id: 'a',
      year: 2026,
      startDate: new Date('2026-04-01'),
      endDate: end,
      offerType: 'Finance',
      fuelType: 'GAS',
      aprRate: 3.49,
      aprTermMonths: 60,
    });
    const { textMinified } = buildOfferDisclaimerText([o], 'LEXDT');
    expect(textMinified).not.toMatch(/\n/);
  });

  test('lease paragraph includes cap costs and excess mile when present', () => {
    const end = new Date('2026-06-30T12:00:00.000Z');
    const o = offer({
      id: 'c',
      year: 2026,
      startDate: new Date('2026-06-01'),
      endDate: end,
      offerType: 'Lease',
      leasePayment: 299,
      leaseTerm: 36,
      leaseMiles: 12000,
      dueAtSigning: 2999,
      grossCapCost: 32000,
      netCapCost: 30500,
      securityDeposit: 0,
      perExcessMile: 0.25 as unknown as Offer['perExcessMile'],
    });
    const { textMinified } = buildOfferDisclaimerText([o], 'TOY');
    expect(textMinified).toContain('gross capitalized cost');
    expect(textMinified).toContain('$0.25/mile');
  });

  test('includes intro lender abbrev and outro salesperson', () => {
    const end = new Date('2026-04-30T12:00:00.000Z');
    const o = offer({
      id: 'b',
      year: 2026,
      startDate: new Date('2026-04-01'),
      endDate: end,
      offerType: 'Finance',
      fuelType: 'GAS',
      aprRate: 2,
      aprTermMonths: 36,
    });
    const { textMinified } = buildOfferDisclaimerText([o], 'LEXDT');
    expect(textMinified).toContain('through LFS');
    expect(textMinified).toContain('Sales Consultant');
    expect(textMinified).toContain('doc fee extra');
  });
});
