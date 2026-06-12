/**
 * Tests for BMW Excel parser.
 * Uses programmatically-created mock Excel buffers via the xlsx library.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import * as XLSX from 'xlsx';
import { parseBmwExcel } from '../parse-excel';
import { normalizeBmwOffers } from '../normalize';

const V2_FIXTURE = join(__dirname, '../__fixtures__/bmw-v2-sample.xlsx');

/** Helper: create a mock Excel workbook buffer with specified sheets. */
function createMockExcel(sheets: Record<string, unknown[][]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

/**
 * Build a lease sheet AOA in the transposed layout.
 * Row labels in column B, data starting in column D (index 3).
 */
function buildLeaseSheet(
  offers: Array<{
    status: string;
    year: string;
    model: string;
    msrp?: number;
    mileage?: number;
    leaseCredit?: number;
    leasePayment?: number;
    leaseTerm?: number;
    dueAtSigning?: number;
  }>
): unknown[][] {
  const rows: unknown[][] = [
    [null, 'Lease Payments Summary', null, ...offers.map(() => null)],
    [null, 'Offer Status on Special Offers', null, ...offers.map((o) => o.status)],
    [null, 'Model Year', null, ...offers.map((o) => o.year)],
    [null, 'Official Model Name', null, ...offers.map((o) => o.model)],
    [null, 'MSRP (Well Equipped)', null, ...offers.map((o) => o.msrp ?? null)],
    [null, 'Annual Mileage', null, ...offers.map((o) => o.mileage ?? null)],
    [null, 'Lease Credit', null, ...offers.map((o) => o.leaseCredit ?? null)],
    [null, 'Monthly Payment', null, ...offers.map((o) => o.leasePayment ?? null)],
    [null, 'Lease Term', null, ...offers.map((o) => o.leaseTerm ?? null)],
    [null, 'Due at Signing', null, ...offers.map((o) => o.dueAtSigning ?? null)],
  ];
  return rows;
}

/**
 * Build a loan sheet AOA in the transposed layout.
 */
function buildLoanSheet(
  offers: Array<{
    aprStatus: string;
    leaseStatus?: string;
    year: string;
    model: string;
    msrp?: number;
    downPayment?: number;
    purchaseCredit?: number;
    aprRate?: number;
    aprTerm?: number;
  }>
): unknown[][] {
  const rows: unknown[][] = [
    [null, 'Loan Payments Summary', null, ...offers.map(() => null)],
    [null, 'Lease Offer Status on Special Offers', null, ...offers.map((o) => o.leaseStatus ?? 'Live')],
    [null, 'APR Offer Status on Special Offers', null, ...offers.map((o) => o.aprStatus)],
    [null, 'Model Year', null, ...offers.map((o) => o.year)],
    [null, 'Official Model Name', null, ...offers.map((o) => o.model)],
    [null, 'MSRP (Well Equipped)', null, ...offers.map((o) => o.msrp ?? null)],
    [null, 'Customer Down Payment', null, ...offers.map((o) => o.downPayment ?? null)],
    [null, 'Purchase Credit', null, ...offers.map((o) => o.purchaseCredit ?? null)],
    [null, 'APR Rate 60mo', null, ...offers.map((o) => o.aprRate ?? null)],
    [null, 'APR Term', null, ...offers.map((o) => o.aprTerm ?? null)],
  ];
  return rows;
}

describe('parseBmwExcel', () => {
  it('parses lease and loan offers correctly', () => {
    const buf = createMockExcel({
      'Lease Payments': buildLeaseSheet([
        {
          status: 'Live',
          year: '2026',
          model: '330i Sedan',
          msrp: 48000,
          mileage: 10000,
          leaseCredit: 2500,
          leasePayment: 499,
          leaseTerm: 36,
          dueAtSigning: 3500,
        },
      ]),
      'Loan Payments': buildLoanSheet([
        {
          aprStatus: 'Live',
          year: '2026',
          model: 'X5 xDrive40i',
          msrp: 65000,
          downPayment: 5000,
          purchaseCredit: 1500,
          aprRate: 3.99,
          aprTerm: 60,
        },
      ]),
    });

    const result = parseBmwExcel(buf);

    expect(result.leaseOffers).toHaveLength(1);
    expect(result.loanOffers).toHaveLength(1);
    expect(result.errors).toHaveLength(0);

    const lease = result.leaseOffers[0];
    expect(lease.sheetType).toBe('lease');
    expect(lease.modelYear).toBe('2026');
    expect(lease.officialModelName).toBe('330i Sedan');
    expect(lease.msrp).toBe(48000);
    expect(lease.annualMileage).toBe(10000);
    expect(lease.leaseCredit).toBe(2500);
    expect(lease.leasePayment).toBe(499);
    expect(lease.leaseTerm).toBe(36);
    expect(lease.dueAtSigning).toBe(3500);

    const loan = result.loanOffers[0];
    expect(loan.sheetType).toBe('loan');
    expect(loan.modelYear).toBe('2026');
    expect(loan.officialModelName).toBe('X5 xDrive40i');
    expect(loan.msrp).toBe(65000);
    expect(loan.customerDownPayment).toBe(5000);
    expect(loan.purchaseCredit).toBe(1500);
    expect(loan.aprRate60mo).toBe(3.99);
    expect(loan.aprTerm).toBe(60);
  });

  it('normalizes fractional APR values from loan sheet into percent units', () => {
    const buf = createMockExcel({
      'Lease Payments': buildLeaseSheet([]),
      'Loan Payments': buildLoanSheet([
        {
          aprStatus: 'Live',
          year: '2026',
          model: 'X5 xDrive40i',
          msrp: 65000,
          downPayment: 5000,
          purchaseCredit: 1500,
          // Simulate Excel percent cell value: 0.0399 represents 3.99%
          aprRate: 0.0399,
          aprTerm: 60,
        },
      ]),
    });

    const result = parseBmwExcel(buf);

    expect(result.loanOffers).toHaveLength(1);
    const loan = result.loanOffers[0];
    expect(loan.aprRate60mo).toBeCloseTo(3.99, 6);
    expect(loan.aprTerm).toBe(60);
  });

  it('only includes "Live" columns; skips "Not Live", "Check", and blank', () => {
    const buf = createMockExcel({
      'Lease Payments': buildLeaseSheet([
        { status: 'Live', year: '2026', model: '330i Sedan', msrp: 48000 },
        { status: 'Not Live', year: '2026', model: 'M3', msrp: 75000 },
        { status: 'Check', year: '2026', model: 'X3', msrp: 52000 },
        { status: '', year: '2026', model: 'X5', msrp: 65000 },
        { status: 'live', year: '2026', model: '530i Sedan', msrp: 55000 }, // lowercase
      ]),
      'Loan Payments': buildLoanSheet([
        { aprStatus: 'Live', year: '2026', model: '330i Sedan' },
        { aprStatus: 'Not Live', year: '2026', model: 'M3' },
      ]),
    });

    const result = parseBmwExcel(buf);

    expect(result.leaseOffers).toHaveLength(2);
    expect(result.leaseOffers[0].officialModelName).toBe('330i Sedan');
    expect(result.leaseOffers[1].officialModelName).toBe('530i Sedan');

    expect(result.loanOffers).toHaveLength(1);
    expect(result.loanOffers[0].officialModelName).toBe('330i Sedan');
  });

  it('skips separator columns (empty year or model)', () => {
    const buf = createMockExcel({
      'Lease Payments': buildLeaseSheet([
        { status: 'Live', year: '2026', model: '330i Sedan', msrp: 48000 },
        { status: 'Live', year: '', model: '', msrp: 0 }, // separator
        { status: 'Live', year: '2026', model: 'X5 xDrive40i', msrp: 65000 },
      ]),
      'Loan Payments': buildLoanSheet([]),
    });

    const result = parseBmwExcel(buf);

    expect(result.leaseOffers).toHaveLength(2);
    expect(result.leaseOffers[0].officialModelName).toBe('330i Sedan');
    expect(result.leaseOffers[1].officialModelName).toBe('X5 xDrive40i');
  });

  it('loan sheet ignores "Lease Offer Status" row; uses APR Offer Status', () => {
    const buf = createMockExcel({
      'Lease Payments': buildLeaseSheet([]),
      'Loan Payments': buildLoanSheet([
        {
          aprStatus: 'Live',
          leaseStatus: 'Not Live', // Lease status says Not Live, but APR status is Live
          year: '2026',
          model: 'X3 xDrive30i',
          msrp: 52000,
          aprRate: 2.99,
          aprTerm: 60,
        },
        {
          aprStatus: 'Not Live',
          leaseStatus: 'Live', // Lease status says Live, but APR status is Not Live
          year: '2026',
          model: '330i Sedan',
          msrp: 48000,
          aprRate: 3.99,
          aprTerm: 72,
        },
      ]),
    });

    const result = parseBmwExcel(buf);

    // Should include the first (APR Live) but not the second (APR Not Live)
    expect(result.loanOffers).toHaveLength(1);
    expect(result.loanOffers[0].officialModelName).toBe('X3 xDrive30i');
  });

  it('handles missing sheet with error message', () => {
    const buf = createMockExcel({
      'Some Other Sheet': [[1, 2, 3]],
    });

    const result = parseBmwExcel(buf);

    expect(result.leaseOffers).toHaveLength(0);
    expect(result.loanOffers).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes('No "Lease" or "Loan" sheet found'))).toBe(true);
  });

  it('handles missing status row in lease sheet', () => {
    const buf = createMockExcel({
      'Lease Payments': [
        [null, 'Some Random Label', null, 'data'],
        [null, 'Another Label', null, 'data'],
      ],
      'Loan Payments': buildLoanSheet([]),
    });

    const result = parseBmwExcel(buf);

    expect(result.leaseOffers).toHaveLength(0);
    expect(result.errors.some((e) => e.includes('could not find'))).toBe(true);
  });

  it('finds sheets by case-insensitive substring', () => {
    const buf = createMockExcel({
      'BMW Lease Payments Summary': buildLeaseSheet([
        { status: 'Live', year: '2026', model: '330i Sedan', msrp: 48000 },
      ]),
      'BMW Loan Payments Detail': buildLoanSheet([
        { aprStatus: 'Live', year: '2026', model: 'X5', msrp: 65000 },
      ]),
    });

    const result = parseBmwExcel(buf);

    expect(result.leaseOffers).toHaveLength(1);
    expect(result.loanOffers).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it('handles buffer with no matching sheets gracefully', () => {
    // xlsx reads arbitrary data and may produce a default sheet — the parser
    // should report no matching sheets rather than crash.
    const result = parseBmwExcel(Buffer.from('not an excel file'));

    expect(result.leaseOffers).toHaveLength(0);
    expect(result.loanOffers).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.toLowerCase().includes('no') && e.toLowerCase().includes('sheet'))).toBe(true);
  });

  it('parses aprRate from alternate label "APR Rate" when "APR Rate 60mo" not present', () => {
    const buf = createMockExcel({
      'Lease Payments': buildLeaseSheet([]),
      'Loan Payments': [
        [null, 'Loan Payments Summary', null, null],
        [null, 'APR Offer Status on Special Offers', null, 'Live'],
        [null, 'Model Year', null, '2026'],
        [null, 'Official Model Name', null, 'X5 xDrive40i'],
        [null, 'MSRP (Well Equipped)', null, 65000],
        [null, 'Customer Down Payment', null, 5000],
        [null, 'Purchase Credit', null, 1500],
        [null, 'APR Rate', null, 3.99],
        [null, 'APR Term', null, 60],
      ],
    });

    const result = parseBmwExcel(buf);

    expect(result.loanOffers).toHaveLength(1);
    expect(result.loanOffers[0].aprRate60mo).toBe(3.99);
  });

  it('parses V2-format sheets with section headers, model code, and dual APR pairs', () => {
    const buf = readFileSync(V2_FIXTURE);
    const result = parseBmwExcel(buf);

    expect(result.errors).toHaveLength(0);
    expect(result.leaseOffers.length).toBeGreaterThanOrEqual(2);
    expect(result.loanOffers).toHaveLength(1);

    const mainLease = result.leaseOffers.find((o) => o.officialModelName === '228 Gran Coupe');
    expect(mainLease?.localModelCode).toBe('262V');
    expect(mainLease?.msrp).toBe(44100);
    expect(mainLease?.acquisitionFee).toBe(925);
    expect(mainLease?.centerContribution).toBe(2200);

    const specialLease = result.leaseOffers.find(
      (o) => o.officialModelName === '760i xDrive Sedan' && o.sourceSheet?.includes('760xi')
    );
    expect(specialLease?.leaseTerm).toBe(15);
    expect(specialLease?.leasePayment).toBe(1399);

    const loan = result.loanOffers[0];
    expect(loan.msrp).toBe(1000);
    expect(loan.totalCost).toBe(44100);
    expect(loan.financeRateOptions).toHaveLength(2);
    expect(loan.financeRateOptions[0].aprTermMonths).toBe(60);
    expect(loan.financeRateOptions[1].aprTermMonths).toBe(24);

    const normalized = normalizeBmwOffers(result, '2026-06-01', '2026-06-30');
    const finance = normalized.find((o) => o.offerType === 'Finance' && o.model === '228');
    expect(finance?.msrp).toBe(44100);
    expect(finance?.modelCode).toBe('262V');
    expect(finance?.financeRates).toHaveLength(2);
  });

  it('imports all lease-named sheets including special-term sheets', () => {
    const buf = readFileSync(V2_FIXTURE);
    const result = parseBmwExcel(buf);
    const sheets = new Set(result.leaseOffers.map((o) => o.sourceSheet));
    expect(sheets.has('Lease Payments')).toBe(true);
    expect([...sheets].some((s) => s?.includes('760xi'))).toBe(true);
  });

  it('handles multiple lease offers with various data', () => {
    const buf = createMockExcel({
      'Lease Payments': buildLeaseSheet([
        { status: 'Live', year: '2026', model: '330i Sedan', msrp: 48000, mileage: 10000, leaseCredit: 2500 },
        { status: 'Live', year: '2026', model: '530i Sedan', msrp: 55000, mileage: 10000, leaseCredit: 3000 },
        { status: 'Live', year: '2025', model: 'X3 xDrive30i', msrp: 52000, mileage: 7500, leaseCredit: 1000 },
      ]),
      'Loan Payments': buildLoanSheet([]),
    });

    const result = parseBmwExcel(buf);

    expect(result.leaseOffers).toHaveLength(3);
    expect(result.leaseOffers[0].msrp).toBe(48000);
    expect(result.leaseOffers[1].msrp).toBe(55000);
    expect(result.leaseOffers[2].msrp).toBe(52000);
    expect(result.leaseOffers[2].annualMileage).toBe(7500);
  });
});
