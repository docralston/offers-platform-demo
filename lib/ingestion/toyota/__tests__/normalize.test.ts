import { normalizeRawOffers } from '@/lib/ingestion/toyota/normalize';

describe('toyota normalize', () => {
  it('preserves APR precision and does not round', () => {
    const rows = normalizeRawOffers([
      {
        year: 2026,
        model: 'Camry',
        trim: 'SE',
        programType: 'finance',
        apr: 2.99,
        aprTermMonths: 60,
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].aprRate).toBe(2.99);
    expect(rows[0].aprTermMonths).toBe(60);
  });

  it('skips cash-only offers (no lease/finance context)', () => {
    const rows = normalizeRawOffers([
      {
        year: 2026,
        model: 'RAV4',
        programType: 'cash',
        customerCash: 1000,
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      },
      {
        year: 2026,
        model: 'RAV4',
        programType: 'lease',
        monthlyPayment: 299,
        termMonths: 36,
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].model).toBe('RAV4');
    expect(rows[0].offerType).toBe('Lease');
  });

  it('leaves unknown/missing lease fields blank (null), defaults leaseMiles to 10k/yr for lease', () => {
    const rows = normalizeRawOffers([
      {
        year: 2026,
        model: 'Corolla',
        programType: 'lease',
        monthlyPayment: 199,
        // termMonths/milesPerYear/dueAtSigning intentionally missing
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].leasePayment).toBe(199);
    expect(rows[0].leaseTerm).toBeNull();
    expect(rows[0].leaseMiles).toBe(10000); // lease offers assume 10k mi/yr when missing
    expect(rows[0].dueAtSigning).toBeNull();
  });

  it('skips College/Military rebate offers and header fragments (Hybrids and, Crossovers and)', () => {
    const rows = normalizeRawOffers([
      { year: 2026, model: 'College', programType: 'cash', customerCash: 500, startDate: '2026-01-01', endDate: '2026-01-31' },
      { year: 2026, model: 'Military', programType: 'cash', customerCash: 500, startDate: '2026-01-01', endDate: '2026-01-31' },
      { year: 2026, model: 'Hybrids and', programType: 'lease', monthlyPayment: 299, termMonths: 36, startDate: '2026-01-01', endDate: '2026-01-31' },
      { year: 2026, model: 'Crossovers and', programType: 'lease', monthlyPayment: 399, termMonths: 36, startDate: '2026-01-01', endDate: '2026-01-31' },
      { year: 2026, model: 'Camry', programType: 'lease', monthlyPayment: 299, termMonths: 36, startDate: '2026-01-01', endDate: '2026-01-31' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].model).toBe('Camry');
  });

  it('normalizes Land to Land Cruiser', () => {
    const rows = normalizeRawOffers([
      {
        year: 2026,
        model: 'Land',
        programType: 'lease',
        monthlyPayment: 499,
        termMonths: 36,
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].model).toBe('Land Cruiser');
  });

  it('propagates MSRP from lease to finance for same model', () => {
    const rows = normalizeRawOffers([
      {
        year: 2026,
        model: 'Camry',
        trim: 'LE',
        programType: 'lease',
        monthlyPayment: 259,
        termMonths: 36,
        milesPerYear: 10000,
        dueAtSigning: 3999,
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        disclaimer: 'Lease example based on 2026 Camry LE with Total SRP of $29,500.',
      },
      {
        year: 2026,
        model: 'Camry',
        programType: 'finance',
        apr: 4.99,
        aprTermMonths: 60,
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      },
    ]);

    const lease = rows.find((r) => r.offerType === 'Lease');
    const finance = rows.find((r) => r.offerType === 'Finance');
    expect(lease?.msrp).toBe(29500);
    expect(finance?.msrp).toBe(29500);
  });

  it('parses MSRP from "Total SRP of $X" in disclaimer when raw.msrp is missing', () => {
    const rows = normalizeRawOffers([
      {
        year: 2026,
        model: 'Camry',
        trim: 'LE',
        programType: 'lease',
        monthlyPayment: 259,
        termMonths: 36,
        milesPerYear: 10000,
        dueAtSigning: 3999,
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        disclaimer:
          'Lease example based on 2026 Camry LE with Total SRP of $29,500, net capitalized cost of $26,200.',
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].msrp).toBe(29500);
  });

  it('strips leading Toyota make from model to avoid duplicate make in titles', () => {
    const rows = normalizeRawOffers([
      {
        year: 2026,
        model: 'Toyota Crown',
        programType: 'lease',
        monthlyPayment: 399,
        termMonths: 36,
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].make).toBe('Toyota');
    expect(rows[0].model).toBe('Crown');
  });
});

