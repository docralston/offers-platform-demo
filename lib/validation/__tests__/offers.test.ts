import { describe, it, expect } from 'vitest';
import { validateOffer, ISSUE_CODES } from '../offers';
import type { OfferInput } from '@/lib/domain/validation';
import { VehicleCondition, OfferStatus } from '@prisma/client';

describe('validateOffer', () => {
  const baseOffer: OfferInput = {
    storeCode: 'TOY',
    model: 'Camry',
    year: 2025,
    startDate: '2025-01-01',
    endDate: '2025-01-31',
    offerType: 'Lease',
    leasePayment: 299,
    leaseTerm: 36,
    leaseMiles: 12000,
    acquisitionFee: 750,
    disclaimer: 'Test disclaimer',
    status: OfferStatus.INACTIVE,
  };

  describe('Toyota model normalization and whitelist', () => {
    it('normalizes Toyota model aliases', () => {
      const offer: OfferInput = {
        ...baseOffer,
        storeCode: 'TOY',
        model: 'RAV4 HV',
      };
      const result = validateOffer(offer);
      expect(result.normalizedRow.model).toBe('RAV4 Hybrid');
      expect(result.issues.length).toBe(0);
    });

    it('normalizes TACOMA to Tacoma', () => {
      const offer: OfferInput = {
        ...baseOffer,
        storeCode: 'TOY',
        model: 'TACOMA',
      };
      const result = validateOffer(offer);
      expect(result.normalizedRow.model).toBe('Tacoma');
      expect(result.issues.length).toBe(0);
    });

    it('reports unknown Toyota model', () => {
      const offer: OfferInput = {
        ...baseOffer,
        storeCode: 'TOY',
        model: 'RAV4 HVV', // Unknown model
      };
      const result = validateOffer(offer);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: ISSUE_CODES.TOY_UNKNOWN_MODEL,
          field: 'model',
        })
      );
    });

    it('allows known Toyota models in whitelist', () => {
      const offer: OfferInput = {
        ...baseOffer,
        storeCode: 'TOY',
        model: 'Camry',
      };
      const result = validateOffer(offer);
      expect(result.issues.filter(i => i.code === ISSUE_CODES.TOY_UNKNOWN_MODEL).length).toBe(0);
    });
  });

  describe('Global validation rules', () => {
    it('validates store code', () => {
      const offer: OfferInput = {
        ...baseOffer,
        storeCode: 'INVALID',
      };
      const result = validateOffer(offer);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: ISSUE_CODES.INVALID_STORE_CODE,
          field: 'storeCode',
        })
      );
    });

    it('validates offer type', () => {
      const offer: OfferInput = {
        ...baseOffer,
        offerType: 'InvalidType',
      };
      const result = validateOffer(offer);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: ISSUE_CODES.INVALID_OFFER_TYPE,
          field: 'offerType',
        })
      );
    });

    it('requires startDate and endDate', () => {
      const offer: OfferInput = {
        ...baseOffer,
        startDate: null as any,
        endDate: null as any,
      };
      const result = validateOffer(offer);
      expect(result.issues.filter(i => i.code === ISSUE_CODES.MISSING_DATES).length).toBeGreaterThan(0);
    });

    it('validates date range', () => {
      const offer: OfferInput = {
        ...baseOffer,
        startDate: '2025-01-31',
        endDate: '2025-01-01', // End before start
      };
      const result = validateOffer(offer);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: ISSUE_CODES.INVALID_DATE_RANGE,
          field: 'endDate',
        })
      );
    });

    it('requires model', () => {
      const offer: OfferInput = {
        ...baseOffer,
        model: '',
      };
      const result = validateOffer(offer);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: ISSUE_CODES.MISSING_MAKE_MODEL,
          field: 'model',
        })
      );
    });

    it('requires make for USED condition', () => {
      const offer: OfferInput = {
        ...baseOffer,
        condition: VehicleCondition.USED,
        make: null,
      };
      const result = validateOffer(offer);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: ISSUE_CODES.MISSING_MAKE_MODEL,
          field: 'make',
        })
      );
    });
  });

  describe('Lease requirements', () => {
    it('requires leasePayment for Lease offers', () => {
      const offer: OfferInput = {
        ...baseOffer,
        offerType: 'Lease',
        leasePayment: null,
      };
      const result = validateOffer(offer);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: ISSUE_CODES.LEASE_MISSING_FIELDS,
          field: 'leasePayment',
        })
      );
    });

    it('requires leaseTerm for Lease offers', () => {
      const offer: OfferInput = {
        ...baseOffer,
        offerType: 'Lease',
        leaseTerm: null,
      };
      const result = validateOffer(offer);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: ISSUE_CODES.LEASE_MISSING_FIELDS,
          field: 'leaseTerm',
        })
      );
    });

    it('requires leaseMiles for Lease offers', () => {
      const offer: OfferInput = {
        ...baseOffer,
        offerType: 'Lease',
        leaseMiles: null,
      };
      const result = validateOffer(offer);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: ISSUE_CODES.LEASE_MISSING_FIELDS,
          field: 'leaseMiles',
        })
      );
    });
  });

  describe('Finance requirements', () => {
    it('requires aprRate for Finance offers', () => {
      const offer: OfferInput = {
        ...baseOffer,
        offerType: 'Finance',
        aprRate: null,
      };
      const result = validateOffer(offer);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: ISSUE_CODES.FINANCE_MISSING_FIELDS,
          field: 'aprRate',
        })
      );
    });

    it('requires aprTermMonths for Finance offers', () => {
      const offer: OfferInput = {
        ...baseOffer,
        offerType: 'Finance',
        aprTermMonths: null,
      };
      const result = validateOffer(offer);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: ISSUE_CODES.FINANCE_MISSING_FIELDS,
          field: 'aprTermMonths',
        })
      );
    });

    it('flags APR over 5%', () => {
      const offer: OfferInput = {
        ...baseOffer,
        offerType: 'Finance',
        aprRate: 5.49,
        aprTermMonths: 60,
      };
      const result = validateOffer(offer);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: ISSUE_CODES.APR_OVER_5,
          field: 'aprRate',
        })
      );
    });

    it('flags APR over 20%', () => {
      const offer: OfferInput = {
        ...baseOffer,
        offerType: 'Finance',
        aprRate: 21.0,
        aprTermMonths: 60,
      };
      const result = validateOffer(offer);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: ISSUE_CODES.APR_OVER_20,
          field: 'aprRate',
        })
      );
      // Should also have APR_OVER_5
      expect(result.issues.filter(i => i.code === ISSUE_CODES.APR_OVER_5).length).toBeGreaterThan(0);
    });
  });

  describe('Lexus brand rules', () => {
    it('requires msrp for Lexus lease offers', () => {
      const offer: OfferInput = {
        ...baseOffer,
        storeCode: 'LEXDT',
        make: 'Lexus',
        offerType: 'Lease',
        msrp: null,
      };
      const result = validateOffer(offer);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: ISSUE_CODES.LEX_LEASE_MISSING_MSRP,
          field: 'msrp',
        })
      );
    });

    it('requires Finance type for Lexus Certified', () => {
      const offer: OfferInput = {
        ...baseOffer,
        storeCode: 'LEXDT',
        make: 'Lexus',
        condition: VehicleCondition.CERTIFIED,
        offerType: 'Lease', // Wrong type
      };
      const result = validateOffer(offer);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: ISSUE_CODES.LEX_CPO_WRONG_OFFER_TYPE,
          field: 'offerType',
        })
      );
    });

    it('requires 72-month term for Lexus Certified', () => {
      const offer: OfferInput = {
        ...baseOffer,
        storeCode: 'LEXDT',
        make: 'Lexus',
        condition: VehicleCondition.CERTIFIED,
        offerType: 'Finance',
        aprTermMonths: 60, // Wrong term
      };
      const result = validateOffer(offer);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: ISSUE_CODES.LEX_CPO_TERM_NOT_72,
          field: 'aprTermMonths',
        })
      );
    });
  });

  describe('BMW brand rules', () => {
    it('requires msrp for BMW lease offers', () => {
      const offer: OfferInput = {
        ...baseOffer,
        storeCode: 'BMW',
        offerType: 'Lease',
        msrp: null,
      };
      const result = validateOffer(offer);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: ISSUE_CODES.BMW_LEASE_MISSING_MSRP,
          field: 'msrp',
        })
      );
    });

    it('warns when BMW finance MSRP cannot be resolved', () => {
      const offer: OfferInput = {
        ...baseOffer,
        storeCode: 'BMW',
        make: 'BMW',
        offerType: 'Finance',
        msrp: null,
        aprRate: 2.99,
        aprTermMonths: 60,
      };
      const result = validateOffer(offer);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: ISSUE_CODES.BMW_FINANCE_MSRP_CROSS_REF_MISS,
          severity: 'warning',
          field: 'msrp',
        })
      );
    });
  });

  describe('Numeric validation', () => {
    it('flags invalid numeric values', () => {
      const offer: OfferInput = {
        ...baseOffer,
        leasePayment: 'invalid' as any,
      };
      const result = validateOffer(offer);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: ISSUE_CODES.INVALID_NUMERIC,
          field: 'leasePayment',
        })
      );
    });
  });

  describe('Valid offer', () => {
    it('returns no issues for a complete valid offer', () => {
      const offer: OfferInput = {
        ...baseOffer,
        storeCode: 'TOY',
        model: 'Camry',
        offerType: 'Lease',
        leasePayment: 299,
        leaseTerm: 36,
        leaseMiles: 12000,
        disclaimer: 'See dealer for details',
      };
      const result = validateOffer(offer);
      // May have missing disclaimer warning, but no errors
      const errors = result.issues.filter(i => i.severity === 'error');
      expect(errors.length).toBe(0);
    });

    it('normalizes and validates Toyota model correctly', () => {
      const offer: OfferInput = {
        ...baseOffer,
        storeCode: 'TOY',
        model: 'RAV4 HV', // Should normalize to RAV4 Hybrid
        offerType: 'Lease',
        leasePayment: 399,
        leaseTerm: 36,
        leaseMiles: 12000,
        disclaimer: 'See dealer',
      };
      const result = validateOffer(offer);
      expect(result.normalizedRow.model).toBe('RAV4 Hybrid');
      const errors = result.issues.filter(i => i.severity === 'error');
      expect(errors.length).toBe(0);
    });
  });
});
