/// <reference types="vitest/globals" />
import {
  parseMoney,
  parseMmDdYy,
  findOfferInSsrState,
} from '@/lib/scrapers/buyatoyota/helpers';

describe('Central Atlantic helpers', () => {
  describe('parseMoney', () => {
    it('parses dollar string to integer dollars', () => {
      expect(parseMoney('$4,120')).toBe(4120);
      expect(parseMoney('4120')).toBe(4120);
      expect(parseMoney('  $ 1,234.56 ')).toBe(1235);
    });

    it('returns null for invalid input', () => {
      expect(parseMoney(null)).toBeNull();
      expect(parseMoney('')).toBeNull();
      expect(parseMoney('abc')).toBeNull();
    });
  });

  describe('parseMmDdYy', () => {
    it('parses MM/DD/YY to Date', () => {
      const d = parseMmDdYy('01/15/26');
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2026);
      expect(d!.getMonth()).toBe(0);
      expect(d!.getDate()).toBe(15);
    });

    it('parses MM/DD/YYYY', () => {
      const d = parseMmDdYy('12/31/2025');
      expect(d).not.toBeNull();
      expect(d!.getFullYear()).toBe(2025);
      expect(d!.getMonth()).toBe(11);
      expect(d!.getDate()).toBe(31);
    });

    it('returns null for invalid input', () => {
      expect(parseMmDdYy(null)).toBeNull();
      expect(parseMmDdYy('')).toBeNull();
      expect(parseMmDdYy('not-a-date')).toBeNull();
    });
  });

  describe('findOfferInSsrState', () => {
    it('finds offer by offerId when it has details', () => {
      const ssrState = {
        route: {
          data: {
            children: [
              {
                offerId: 'abc-123',
                details: { rate: '$299', duration: 36 },
                heading: '2025 Tacoma',
              },
            ],
          },
        },
      };
      const found = findOfferInSsrState(ssrState, 'abc-123');
      expect(found).not.toBeNull();
      expect(found!.offerId).toBe('abc-123');
      expect(found!.details).toEqual({ rate: '$299', duration: 36 });
      expect(found!.heading).toBe('2025 Tacoma');
    });

    it('returns null when offerId not found', () => {
      const ssrState = { foo: { offerId: 'other', details: {} } };
      expect(findOfferInSsrState(ssrState, 'abc-123')).toBeNull();
    });

    it('returns null when node has offerId but no details', () => {
      const ssrState = { offerId: 'abc-123', heading: 'Tacoma' };
      expect(findOfferInSsrState(ssrState, 'abc-123')).toBeNull();
    });

    it('searches nested arrays', () => {
      const ssrState = {
        offers: [
          { id: 1 },
          { offerId: 'nested-456', details: { rate: 399 }, seriesName: 'RAV4' },
        ],
      };
      const found = findOfferInSsrState(ssrState, 'nested-456');
      expect(found).not.toBeNull();
      expect(found!.offerId).toBe('nested-456');
      expect(found!.seriesName).toBe('RAV4');
    });
  });
});
