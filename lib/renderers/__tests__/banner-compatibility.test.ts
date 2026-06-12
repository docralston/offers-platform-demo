import { validateBannerCompatibility } from '@/lib/renderers/banner-compatibility';

describe('validateBannerCompatibility', () => {
  const leaseOffer = {
    offerType: 'Lease',
    leasePayment: 299,
    leaseTerm: 36,
    leaseMiles: 12000,
    dueAtSigning: 2999,
  };

  const financeOffer = {
    offerType: 'Finance',
    aprRate: 2.9,
    aprTermMonths: 60,
  };

  test('allows standard rectangle with lease and finance', () => {
    const result = validateBannerCompatibility({
      width: 300,
      height: 250,
      groups: [{ groupKey: 'a', offers: [leaseOffer, financeOffer] }],
    });
    expect(result.ok).toBe(true);
  });

  test('blocks 320x50 with lease and finance on same vehicle', () => {
    const result = validateBannerCompatibility({
      width: 320,
      height: 50,
      groups: [{ groupKey: 'a', offers: [leaseOffer, financeOffer] }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/lease and finance/i);
    }
  });

  test('blocks 320x50 with multiple card groups', () => {
    const result = validateBannerCompatibility({
      width: 320,
      height: 50,
      groups: [
        { groupKey: 'a', offers: [leaseOffer] },
        { groupKey: 'b', offers: [financeOffer] },
      ],
    });
    expect(result.ok).toBe(false);
  });

  test('allows 320x50 with single lease offer', () => {
    const result = validateBannerCompatibility({
      width: 320,
      height: 50,
      groups: [{ groupKey: 'a', offers: [leaseOffer] }],
    });
    expect(result.ok).toBe(true);
  });
});
