import { describe, expect, test } from 'vitest';
import type { Offer } from '@prisma/client';
import { OfferStatus, VehicleCondition } from '@prisma/client';
import {
  buildTemplateContext,
  substituteOfferPlaceholders,
} from '@/lib/disclaimers/template-resolver';

const base = {
  storeCode: 'TOY',
  storeCodes: [] as string[],
  externalId: null,
  make: 'Toyota',
  model: 'Camry',
  series: null,
  trim: 'LE',
  modelCode: '2554',
  condition: VehicleCondition.NEW,
  status: OfferStatus.LIVE,
  inventoryUrl: null,
  imageUrl: null,
  leasePayment: 299,
  leaseTerm: 36,
  leaseMiles: 12000,
  dueAtSigning: 2999,
  capCostReduction: 1500,
  grossCapCost: 32000,
  netCapCost: 30500,
  securityDeposit: 0,
  perExcessMile: null,
  acquisitionFee: 650,
  downPayment: null,
  msrp: 33000,
  discount: null,
  buyFor: null,
  stockNumber: null,
  offerType: 'Lease',
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

function offer(p: Partial<Offer> & Pick<Offer, 'id' | 'year' | 'startDate' | 'endDate'>): Offer {
  return { ...base, ...p } as Offer;
}

describe('substituteOfferPlaceholders', () => {
  test('replaces lease cap and deposit placeholders when present', () => {
    const o = offer({
      id: '1',
      year: 2026,
      startDate: new Date('2026-06-01'),
      endDate: new Date('2026-06-30'),
      securityDeposit: 500,
      perExcessMile: 0.25 as unknown as Offer['perExcessMile'],
    });
    const ctx = buildTemplateContext('TOY', '06/30/26');
    const tpl =
      'Gross {grossCapCost}, net {netCapCost}, reduction {capCostReduction}, deposit {securityDeposit}, excess {perExcessMile}.';
    const out = substituteOfferPlaceholders(tpl, o, ctx);
    expect(out).toContain('$32,000');
    expect(out).toContain('$30,500');
    expect(out).toContain('$1,500');
    expect(out).toContain('$500');
    expect(out).toContain('$0.25/mile');
  });

  test('omits placeholders when fields are null', () => {
    const o = offer({
      id: '2',
      year: 2026,
      startDate: new Date('2026-06-01'),
      endDate: new Date('2026-06-30'),
      grossCapCost: null,
      netCapCost: null,
      securityDeposit: null,
      perExcessMile: null,
    });
    const ctx = buildTemplateContext('TOY', '06/30/26');
    const out = substituteOfferPlaceholders('Cap {grossCapCost}{netCapCost}', o, ctx);
    expect(out).toBe('Cap ');
  });
});
