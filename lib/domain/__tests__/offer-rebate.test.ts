import { describe, it, expect } from 'vitest';
import { computeRebateTotal } from '../offer-rebate';

describe('computeRebateTotal', () => {
  it('returns null when rebateTotal is explicitly provided', () => {
    expect(computeRebateTotal({ rebateTotal: 100 })).toBe(null);
    expect(computeRebateTotal({ rebateTotal: 0 })).toBe(null);
  });

  it('returns sum of cash fields when rebateTotal is empty and any cash is present', () => {
    expect(computeRebateTotal({
      customerCash: 100,
      leaseCash: 200,
      aprCash: 50,
      bonusCash: 25,
    })).toBe(375);
    expect(computeRebateTotal({ customerCash: 100 })).toBe(100);
    expect(computeRebateTotal({ leaseCash: 0, aprCash: 10 })).toBe(10);
  });

  it('returns null when rebateTotal is empty and no cash fields present', () => {
    expect(computeRebateTotal({})).toBe(null);
    expect(computeRebateTotal({ customerCash: null, leaseCash: undefined })).toBe(null);
  });
});
