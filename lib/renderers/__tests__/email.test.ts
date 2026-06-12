import { describe, expect, test, vi } from 'vitest';
import type { Offer } from '@prisma/client';
import { OfferStatus, VehicleCondition } from '@prisma/client';
import { renderEmailHtml } from '../email';

vi.mock('@/lib/config/stores.server', () => ({
  getStoreConfig: vi.fn(() => ({
    branding: { accentColor: '#EB0A1E', theme: 'default' },
    dealerName: 'Test Dealer',
    domain: 'example.com',
    siteUrl: 'https://example.com',
    legalName: 'Test',
    location: { address: '', city: '', state: '', zip: '', county: '' },
    contact: { phone: '' },
    links: {
      newInventory: '',
      usedInventory: '',
      service: '',
      finance: '',
      trade: '',
      contact: '',
    },
  })),
}));

function makeOffer(partial: Partial<Offer>): Offer {
  const base: Offer = {
    id: '1',
    storeCode: 'TOY',
    storeCodes: [],
    externalId: null,
    make: 'Toyota',
    model: 'Camry',
    series: null,
    trim: null,
    modelCode: null,
    fuelType: null,
    condition: VehicleCondition.NEW,
    year: 2026,
    startDate: new Date(),
    endDate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
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
    msrp: 30000,
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
  };
  return { ...base, ...partial };
}

describe('renderEmailHtml', () => {
  test('renders Lease, Finance, and BUY blocks when data is present', () => {
    const leaseOffer = makeOffer({
      id: 'lease',
      offerType: 'Lease',
      leasePayment: 259,
      leaseTerm: 36,
      leaseMiles: 10000,
      dueAtSigning: 3999,
    });

    const financeOffer = makeOffer({
      id: 'finance',
      offerType: 'Finance',
      aprRate: 4.99,
      aprTermMonths: 60,
    });

    const buyOffer = makeOffer({
      id: 'buy',
      offerType: 'Cash',
      msrp: 32000,
      discount: 1000,
      buyFor: 31000,
    });

    const html = renderEmailHtml([leaseOffer, financeOffer, buyOffer], 'TOY');

    expect(html).toContain('Lease');
    expect(html).toContain('Finance');
    expect(html).toContain('Demo Price');
  });

  test('includes brand-specific styling hints for Lexus', () => {
    const lexusOffer = makeOffer({
      id: 'lexus',
      storeCode: 'LEXDT',
      make: 'Lexus',
      model: 'RX',
      offerType: 'Lease',
      leasePayment: 499,
      leaseTerm: 36,
      leaseMiles: 10000,
      dueAtSigning: 4999,
    });

    const html = renderEmailHtml([lexusOffer], 'LEXDT');

    expect(html).toContain('Lease');
    expect(html).toContain('rgba(26,26,26,0.1)');
  });
});
