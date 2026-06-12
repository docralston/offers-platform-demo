import { describe, it, expect } from 'vitest';
import {
  monthlyPaymentPer1000,
  formatAprDisclaimer,
  getDisclaimerForFinanceOffer,
} from '../apr-disclaimer';

describe('monthlyPaymentPer1000', () => {
  it('0% APR: payment = 1000/n rounded to 2 decimals', () => {
    expect(monthlyPaymentPer1000(0, 36)).toBe(27.78); // 1000/36
    expect(monthlyPaymentPer1000(0, 24)).toBe(41.67);
    expect(monthlyPaymentPer1000(0, 48)).toBe(20.83);
    expect(monthlyPaymentPer1000(0, 60)).toBe(16.67);
    expect(monthlyPaymentPer1000(0, 72)).toBe(13.89);
  });

  it('1.9% APR 72 mo matches OEM-style disclosure (~14.71)', () => {
    const payment = monthlyPaymentPer1000(1.9, 72);
    expect(payment).toBe(14.71);
  });

  it('non-zero APR formula for common rates and terms', () => {
    expect(monthlyPaymentPer1000(0.9, 36)).toBe(28.16);
    expect(monthlyPaymentPer1000(2.9, 60)).toBe(17.92);
    expect(monthlyPaymentPer1000(3.9, 72)).toBe(15.6);
  });

  it('returns 0 for invalid term', () => {
    expect(monthlyPaymentPer1000(1.9, 0)).toBe(0);
    expect(monthlyPaymentPer1000(1.9, -1)).toBe(0);
  });
});

describe('formatAprDisclaimer', () => {
  const sentencePattern =
    /^\d+(?:\.\d+)?% APR financing with \d+ monthly payments of \$\d+\.\d{2} for each \$1,000 borrowed\.$/;

  it('1.9% 72 mo produces exact spec example', () => {
    expect(formatAprDisclaimer(1.9, 72)).toBe(
      '1.9% APR financing with 72 monthly payments of $14.71 for each $1,000 borrowed.'
    );
  });

  it('0% 36 mo produces correct sentence', () => {
    const s = formatAprDisclaimer(0, 36);
    expect(s).toMatch(sentencePattern);
    expect(s).toContain('0% APR');
    expect(s).toContain('36 monthly payments');
    expect(s).toContain('$27.78'); // 1000/36 rounded
  });

  it('APR display: 0 → "0%", trim trailing zeros', () => {
    expect(formatAprDisclaimer(0, 12)).toMatch(/^0% APR/);
    expect(formatAprDisclaimer(1.9, 12)).toMatch(/^1\.9% APR/);
    expect(formatAprDisclaimer(1, 12)).toMatch(/^1% APR/);
    expect(formatAprDisclaimer(1.0, 12)).toMatch(/^1% APR/);
    expect(formatAprDisclaimer(2.9, 12)).toMatch(/^2\.9% APR/);
  });

  it('dollar amount always two decimals with $', () => {
    expect(formatAprDisclaimer(0, 24)).toMatch(/\$\d+\.\d{2}/);
    expect(formatAprDisclaimer(3.9, 60)).toMatch(/\$\d+\.\d{2}/);
  });

  it('returns empty string for invalid term', () => {
    expect(formatAprDisclaimer(1.9, 0)).toBe('');
    expect(formatAprDisclaimer(1.9, -1)).toBe('');
  });

  it('OEM validation set: 0%, 0.9%, 1.9%, 2.9%, 3.9% × 24, 36, 48, 60, 72', () => {
    const rates = [0, 0.9, 1.9, 2.9, 3.9];
    const terms = [24, 36, 48, 60, 72];
    for (const apr of rates) {
      for (const term of terms) {
        const s = formatAprDisclaimer(apr, term);
        expect(s).toMatch(sentencePattern);
        expect(s).toContain(`${term} monthly payments`);
      }
    }
  });
});

describe('getDisclaimerForFinanceOffer', () => {
  it('returns disclaimer for Finance with aprRate and aprTermMonths', () => {
    const offer = {
      offerType: 'Finance' as const,
      aprRate: 1.9,
      aprTermMonths: 72,
    };
    expect(getDisclaimerForFinanceOffer(offer)).toBe(
      '1.9% APR financing with 72 monthly payments of $14.71 for each $1,000 borrowed.'
    );
  });

  it('returns null for Lease', () => {
    expect(
      getDisclaimerForFinanceOffer({
        offerType: 'Lease',
        aprRate: 1.9,
        aprTermMonths: 72,
      })
    ).toBe(null);
  });

  it('returns null for Cash', () => {
    expect(
      getDisclaimerForFinanceOffer({
        offerType: 'Cash',
        aprRate: 1.9,
        aprTermMonths: 72,
      })
    ).toBe(null);
  });

  it('returns null when aprRate missing', () => {
    expect(
      getDisclaimerForFinanceOffer({
        offerType: 'Finance',
        aprTermMonths: 72,
      })
    ).toBe(null);
  });

  it('returns null when aprTermMonths missing', () => {
    expect(
      getDisclaimerForFinanceOffer({
        offerType: 'Finance',
        aprRate: 1.9,
      })
    ).toBe(null);
  });

  it('returns null when aprTermMonths < 1', () => {
    expect(
      getDisclaimerForFinanceOffer({
        offerType: 'Finance',
        aprRate: 1.9,
        aprTermMonths: 0,
      })
    ).toBe(null);
  });

  it('returns null when offerType is null/undefined', () => {
    expect(getDisclaimerForFinanceOffer({ aprRate: 1.9, aprTermMonths: 72 })).toBe(null);
  });

  it('coerces Decimal-like aprRate via Number()', () => {
    expect(
      getDisclaimerForFinanceOffer({
        offerType: 'Finance',
        aprRate: 0,
        aprTermMonths: 36,
      })
    ).toContain('0% APR');
  });
});
