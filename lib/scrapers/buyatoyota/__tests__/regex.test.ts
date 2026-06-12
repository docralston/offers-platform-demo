/// <reference types="vitest/globals" />
import { extractDisclaimerFields } from '@/lib/scrapers/buyatoyota/regex';

describe('Central Atlantic regex extractors', () => {
  it('extracts leaseMiles from "X miles per year"', () => {
    const text = '10,000 miles per year included.';
    const out = extractDisclaimerFields(text);
    expect(out.leaseMiles).toBe(10000);
  });

  it('extracts downPayment from "includes $X customer down payment"', () => {
    const text = 'Offer includes $4,120 customer down payment.';
    const out = extractDisclaimerFields(text);
    expect(out.downPayment).toBe(4120);
  });

  it('extracts acquisitionFee from "$X Acquisition Fee"', () => {
    const text = '$650 Acquisition Fee due at signing.';
    const out = extractDisclaimerFields(text);
    expect(out.acquisitionFee).toBe(650);
  });

  it('extracts msrp from "Total SRP of $X"', () => {
    const text = 'Total SRP of $42,670.';
    const out = extractDisclaimerFields(text);
    expect(out.msrp).toBe(42670);
  });

  it('returns null for fields absent in text', () => {
    const text = 'Some other disclaimer with no lease fields.';
    const out = extractDisclaimerFields(text);
    expect(out.leaseMiles).toBeNull();
    expect(out.downPayment).toBeNull();
    expect(out.acquisitionFee).toBeNull();
    expect(out.msrp).toBeNull();
  });

  it('extracts all fields from combined disclaimer', () => {
    const text = [
      '10,000 miles per year. Offer includes $4,120 customer down payment.',
      '$650 Acquisition Fee due at signing. Total SRP of $42,670.',
    ].join(' ');
    const out = extractDisclaimerFields(text);
    expect(out.leaseMiles).toBe(10000);
    expect(out.downPayment).toBe(4120);
    expect(out.acquisitionFee).toBe(650);
    expect(out.msrp).toBe(42670);
  });
});
