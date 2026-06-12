import { describe, expect, test } from 'vitest';
import { parseFinanceRates, resolveFinanceApr } from '@/lib/domain/finance-rates';

describe('resolveFinanceApr fuel matching', () => {
  test('filters to vehicle fuel when rows are tagged', () => {
    const offer = {
      offerType: 'Finance' as const,
      aprRate: null,
      aprTermMonths: null,
      fuelType: 'HYBRID' as const,
      financeRates: [
        { aprRate: 2.49, aprTermMonths: 60, fuelType: 'PLUG_IN_HYBRID' },
        { aprRate: 3.49, aprTermMonths: 60, fuelType: 'HYBRID' },
      ],
    };
    const r = resolveFinanceApr(offer);
    expect(r.apr).toEqual({ aprRate: 3.49, aprTermMonths: 60 });
    expect(r.alerts).toHaveLength(0);
  });

  test('falls back with alert when no row matches fuel', () => {
    const offer = {
      offerType: 'Finance' as const,
      aprRate: null,
      aprTermMonths: null,
      fuelType: 'GAS' as const,
      financeRates: [
        { aprRate: 2.49, aprTermMonths: 60, fuelType: 'PLUG_IN_HYBRID' },
        { aprRate: 2.99, aprTermMonths: 60, fuelType: 'HYBRID' },
      ],
    };
    const r = resolveFinanceApr(offer);
    expect(r.apr).toEqual({ aprRate: 2.49, aprTermMonths: 60 });
    expect(r.alerts.some((a) => a.includes('No APR row matches'))).toBe(true);
  });

  test('unknown vehicle fuel uses global best without alert', () => {
    const offer = {
      offerType: 'Finance' as const,
      aprRate: null,
      aprTermMonths: null,
      fuelType: null,
      financeRates: [
        { aprRate: 1.9, aprTermMonths: 72 },
        { aprRate: 2.9, aprTermMonths: 60 },
      ],
    };
    const r = resolveFinanceApr(offer);
    expect(r.apr).toEqual({ aprRate: 1.9, aprTermMonths: 72 });
    expect(r.alerts).toHaveLength(0);
  });
});

describe('parseFinanceRates fuelType', () => {
  test('reads optional fuelType on rows; invalid fuel is ignored', () => {
    const rates = parseFinanceRates([
      { aprRate: 3, aprTermMonths: 60, fuelType: 'GAS' },
      { aprRate: 2.5, aprTermMonths: 60, fuelType: 'INVALID' },
    ]);
    expect(rates).toHaveLength(2);
    expect(rates[0].fuelType).toBe('GAS');
    expect(rates[1].fuelType).toBeUndefined();
  });
});
