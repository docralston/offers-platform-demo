/**
 * Tests for BMW normalize: BmwRawOffer → OfferInput mapping.
 */

import { normalizeBmwOffers } from '../normalize';
import type { BmwRawLeaseOffer, BmwRawLoanOffer } from '../parse-excel';

const START = '2026-02-01';
const END = '2026-02-28';

function emptyLeaseFields(): Pick<
  BmwRawLeaseOffer,
  | 'localModelCode'
  | 'acquisitionFee'
  | 'nationalCredit'
  | 'centerContribution'
  | 'totalCost'
> {
  return {
    localModelCode: null,
    acquisitionFee: null,
    nationalCredit: null,
    centerContribution: null,
    totalCost: null,
  };
}

function emptyLoanFields(): Pick<
  BmwRawLoanOffer,
  | 'localModelCode'
  | 'msrpAlt'
  | 'totalCost'
  | 'nationalCredit'
  | 'centerContribution'
  | 'financeRateOptions'
> {
  return {
    localModelCode: null,
    msrpAlt: null,
    totalCost: null,
    nationalCredit: null,
    centerContribution: null,
    financeRateOptions: [],
  };
}

describe('normalizeBmwOffers', () => {
  describe('lease offers', () => {
    it('maps lease fields correctly', () => {
      const raw: BmwRawLeaseOffer = {
        sheetType: 'lease',
        modelYear: '2026',
        officialModelName: '330i Sedan',
        msrp: 48000,
        annualMileage: 10000,
        leaseCredit: 2500,
        leasePayment: 499,
        leaseTerm: 36,
        dueAtSigning: 3500,
        ...emptyLeaseFields(),
      };

      const [offer] = normalizeBmwOffers([raw], START, END);

      expect(offer.storeCode).toBe('BMW');
      expect(offer.make).toBe('BMW');
      expect(offer.model).toBe('330i');
      expect(offer.trim).toBe('Sedan');
      expect(offer.series).toBe('3 Series');
      expect(offer.year).toBe(2026);
      expect(offer.condition).toBe('NEW');
      expect(offer.offerType).toBe('Lease');
      expect(offer.msrp).toBe(48000);
      expect(offer.leaseMiles).toBe(10000);
      expect(offer.leaseCash).toBe(2500);
      expect(offer.leasePayment).toBe(499);
      expect(offer.leaseTerm).toBe(36);
      expect(offer.dueAtSigning).toBe(3500);
      expect(offer.startDate).toBe(START);
      expect(offer.endDate).toBe(END);
    });

    it('maps modelCode, acquisitionFee, and credits from V2 fields', () => {
      const raw: BmwRawLeaseOffer = {
        sheetType: 'lease',
        modelYear: '2026',
        officialModelName: '228 Gran Coupe',
        msrp: 44100,
        annualMileage: 10000,
        leaseCredit: 0,
        leasePayment: 429,
        leaseTerm: 39,
        dueAtSigning: 3759,
        localModelCode: '262V',
        acquisitionFee: 925,
        nationalCredit: 500,
        centerContribution: 2200,
        totalCost: 44100,
      };

      const [offer] = normalizeBmwOffers([raw], START, END);

      expect(offer.modelCode).toBe('262V');
      expect(offer.acquisitionFee).toBe(925);
      expect(offer.bonusCash).toBe(500);
      expect(offer.capCostReduction).toBe(2200);
    });

    it('rounds leasePayment and dueAtSigning to nearest whole number', () => {
      const raw: BmwRawLeaseOffer = {
        sheetType: 'lease',
        modelYear: '2026',
        officialModelName: '330i Sedan',
        msrp: 758.5187243589742,
        annualMileage: 10000,
        leaseCredit: 2500.7,
        leasePayment: 758.5187243589742,
        leaseTerm: 36,
        dueAtSigning: 3500.49,
        ...emptyLeaseFields(),
      };

      const [offer] = normalizeBmwOffers([raw], START, END);

      expect(offer.leasePayment).toBe(759);
      expect(offer.dueAtSigning).toBe(3500);
      expect(offer.msrp).toBe(759);
      expect(offer.leaseCash).toBe(2501);
    });

    it('leaves leasePayment, leaseTerm, and dueAtSigning as null when not in spreadsheet', () => {
      const raw: BmwRawLeaseOffer = {
        sheetType: 'lease',
        modelYear: '2026',
        officialModelName: 'X5 xDrive40i',
        msrp: 65000,
        annualMileage: 10000,
        leaseCredit: 3000,
        leasePayment: null,
        leaseTerm: null,
        dueAtSigning: null,
        ...emptyLeaseFields(),
      };

      const [offer] = normalizeBmwOffers([raw], START, END);

      expect(offer.leasePayment).toBeNull();
      expect(offer.leaseTerm).toBeNull();
      expect(offer.dueAtSigning).toBeNull();
    });

    it('leaves acquisitionFee null when not provided', () => {
      const raw: BmwRawLeaseOffer = {
        sheetType: 'lease',
        modelYear: '2026',
        officialModelName: '330i Sedan',
        msrp: 48000,
        annualMileage: 10000,
        leaseCredit: 2500,
        leasePayment: null,
        leaseTerm: null,
        dueAtSigning: null,
        ...emptyLeaseFields(),
      };

      const [offer] = normalizeBmwOffers([raw], START, END);

      expect(offer.acquisitionFee).toBeNull();
    });
  });

  describe('finance offers', () => {
    it('maps finance fields correctly', () => {
      const raw: BmwRawLoanOffer = {
        sheetType: 'loan',
        modelYear: '2026',
        officialModelName: 'X5 xDrive40i',
        msrp: 65000,
        customerDownPayment: 5000,
        purchaseCredit: 1500,
        aprRate60mo: 3.99,
        aprTerm: 60,
        ...emptyLoanFields(),
      };

      const [offer] = normalizeBmwOffers([raw], START, END);

      expect(offer.storeCode).toBe('BMW');
      expect(offer.make).toBe('BMW');
      expect(offer.model).toBe('X5');
      expect(offer.trim).toBe('xDrive40i');
      expect(offer.series).toBe('X5');
      expect(offer.year).toBe(2026);
      expect(offer.offerType).toBe('Finance');
      expect(offer.msrp).toBe(65000);
      expect(offer.downPayment).toBe(5000);
      expect(offer.customerCash).toBe(1500);
      expect(offer.aprRate).toBe(3.99);
      expect(offer.aprTermMonths).toBe(60);
      expect(offer.startDate).toBe(START);
      expect(offer.endDate).toBe(END);
    });

    it('cross-references finance MSRP from lease sheet when loan MSRP is placeholder', () => {
      const lease: BmwRawLeaseOffer = {
        sheetType: 'lease',
        modelYear: '2026',
        officialModelName: '228 Gran Coupe',
        msrp: 44100,
        annualMileage: 10000,
        leaseCredit: 0,
        leasePayment: 429,
        leaseTerm: 39,
        dueAtSigning: 3759,
        ...emptyLeaseFields(),
      };
      const loan: BmwRawLoanOffer = {
        sheetType: 'loan',
        modelYear: '2026',
        officialModelName: '228 Gran Coupe',
        msrp: 1000,
        customerDownPayment: 0,
        purchaseCredit: 0,
        aprRate60mo: 2.99,
        aprTerm: 60,
        ...emptyLoanFields(),
        totalCost: 44100,
      };

      const offers = normalizeBmwOffers({ leaseOffers: [lease], loanOffers: [loan], errors: [], skippedCount: 0, skippedReasons: {}, skippedOffers: [] }, START, END);

      expect(offers).toHaveLength(2);
      expect(offers[1].msrp).toBe(44100);
    });

    it('builds financeRates from multiple APR/term pairs', () => {
      const raw: BmwRawLoanOffer = {
        sheetType: 'loan',
        modelYear: '2026',
        officialModelName: '228 Gran Coupe',
        msrp: 44100,
        customerDownPayment: 0,
        purchaseCredit: 0,
        aprRate60mo: 2.99,
        aprTerm: 60,
        ...emptyLoanFields(),
        financeRateOptions: [
          { aprRate: 2.99, aprTermMonths: 60 },
          { aprRate: 2.99, aprTermMonths: 24 },
        ],
      };

      const [offer] = normalizeBmwOffers([raw], START, END);

      expect(offer.financeRates).toHaveLength(2);
      expect(offer.aprRate).toBe(2.99);
      expect(offer.aprTermMonths).toBe(60);
    });

    it('normalizes fractional aprRate60mo into percent units defensively', () => {
      const raw: BmwRawLoanOffer = {
        sheetType: 'loan',
        modelYear: '2026',
        officialModelName: '330i Sedan',
        msrp: 48000,
        customerDownPayment: 3000,
        purchaseCredit: 1000,
        aprRate60mo: 0.019,
        aprTerm: 72,
        ...emptyLoanFields(),
      };

      const [offer] = normalizeBmwOffers([raw], START, END);

      expect(offer.aprRate).toBeCloseTo(1.9, 6);
      expect(offer.aprTermMonths).toBe(72);
    });

    it('leaves 0.9% as 0.9 (does not rescale to 90)', () => {
      const raw: BmwRawLoanOffer = {
        sheetType: 'loan',
        modelYear: '2026',
        officialModelName: '330i Sedan',
        msrp: 48000,
        customerDownPayment: 3000,
        purchaseCredit: 1000,
        aprRate60mo: 0.9,
        aprTerm: 60,
        ...emptyLoanFields(),
      };

      const [offer] = normalizeBmwOffers([raw], START, END);

      expect(offer.aprRate).toBe(0.9);
      expect(offer.aprTermMonths).toBe(60);
    });
  });

  describe('mixed offers', () => {
    it('applies dates from UI to all offers', () => {
      const lease: BmwRawLeaseOffer = {
        sheetType: 'lease',
        modelYear: '2026',
        officialModelName: '330i Sedan',
        msrp: 48000,
        annualMileage: 10000,
        leaseCredit: 2500,
        leasePayment: null,
        leaseTerm: null,
        dueAtSigning: null,
        ...emptyLeaseFields(),
      };
      const loan: BmwRawLoanOffer = {
        sheetType: 'loan',
        modelYear: '2026',
        officialModelName: 'X5 xDrive40i',
        msrp: 65000,
        customerDownPayment: 5000,
        purchaseCredit: 1500,
        aprRate60mo: 3.99,
        aprTerm: 60,
        ...emptyLoanFields(),
      };

      const offers = normalizeBmwOffers([lease, loan], '2026-03-01', '2026-03-31');

      expect(offers).toHaveLength(2);
      expect(offers[0].startDate).toBe('2026-03-01');
      expect(offers[0].endDate).toBe('2026-03-31');
      expect(offers[1].startDate).toBe('2026-03-01');
      expect(offers[1].endDate).toBe('2026-03-31');
    });

    it('handles null numeric fields gracefully', () => {
      const raw: BmwRawLeaseOffer = {
        sheetType: 'lease',
        modelYear: '2026',
        officialModelName: 'X3 xDrive30i',
        msrp: null,
        annualMileage: null,
        leaseCredit: null,
        leasePayment: null,
        leaseTerm: null,
        dueAtSigning: null,
        ...emptyLeaseFields(),
      };

      const [offer] = normalizeBmwOffers([raw], START, END);

      expect(offer.msrp).toBeNull();
      expect(offer.leaseMiles).toBeNull();
      expect(offer.leaseCash).toBeNull();
    });
  });
});
