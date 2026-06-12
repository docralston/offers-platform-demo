/**
 * BMW Excel parser.
 * Reads a .xlsx buffer with lease-named sheets + a loan sheet
 * in a transposed layout — row labels on the left, each column is an offer.
 */

import * as XLSX from 'xlsx';
import {
  LEASE_ROW_LABELS,
  LOAN_ROW_LABELS,
  LOAN_ROW_LABEL_ALTS,
  LEASE_LABEL_HINTS,
  LOAN_LABEL_HINTS,
  LOAN_PAYMENT_INFO_LABEL,
} from './constants';

export interface BmwFinanceRateOption {
  aprRate: number;
  aprTermMonths: number;
}

/** Raw values extracted from one column of a lease sheet. */
export interface BmwRawLeaseOffer {
  sheetType: 'lease';
  sourceSheet?: string;
  modelYear: string | null;
  officialModelName: string | null;
  localModelCode: string | null;
  msrp: number | null;
  annualMileage: number | null;
  leaseCredit: number | null;
  leasePayment: number | null;
  leaseTerm: number | null;
  dueAtSigning: number | null;
  acquisitionFee: number | null;
  nationalCredit: number | null;
  centerContribution: number | null;
  totalCost: number | null;
}

/** Raw values extracted from one column of the Loan sheet. */
export interface BmwRawLoanOffer {
  sheetType: 'loan';
  sourceSheet?: string;
  modelYear: string | null;
  officialModelName: string | null;
  localModelCode: string | null;
  msrp: number | null;
  msrpAlt: number | null;
  totalCost: number | null;
  customerDownPayment: number | null;
  purchaseCredit: number | null;
  nationalCredit: number | null;
  centerContribution: number | null;
  aprRate60mo: number | null;
  aprTerm: number | null;
  financeRateOptions: BmwFinanceRateOption[];
}

export type BmwRawOffer = BmwRawLeaseOffer | BmwRawLoanOffer;

export interface ParseBmwExcelResult {
  leaseOffers: BmwRawLeaseOffer[];
  loanOffers: BmwRawLoanOffer[];
  errors: string[];
  skippedCount: number;
  skippedReasons: Record<string, number>;
  skippedOffers: Array<Record<string, unknown>>;
}

type LabelHints = Partial<Record<string, { preferAfter?: string; preferLast?: boolean }>>;

const DATA_COL_START = 3;

function toNum(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[,$\s%]/g, ''));
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function toStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function normalizeAprPercent(value: number | null): number | null {
  if (value == null || Number.isNaN(value)) return null;
  if (value > 0 && value < 0.25) return value * 100;
  return value;
}

/** Find all sheets whose name contains `substring` (case-insensitive). */
function findAllSheets(wb: XLSX.WorkBook, substring: string): Array<{ name: string; sheet: XLSX.WorkSheet }> {
  const lower = substring.toLowerCase();
  return wb.SheetNames.filter((n) => n.toLowerCase().includes(lower)).map((name) => ({
    name,
    sheet: wb.Sheets[name]!,
  }));
}

function sheetToAoa(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });
}

function getCell(aoa: unknown[][], rowIdx: number, colIdx: number): unknown {
  const row = aoa[rowIdx];
  if (!row || rowIdx < 0) return null;
  return row[colIdx] ?? null;
}

function normalizeLabel(s: string): string {
  return s.toLowerCase().trim();
}

/** Scan columns A/B and collect all row indices per label key. */
function collectLabelRows(
  aoa: unknown[][],
  labels: Record<string, string>,
  alts?: Record<string, readonly string[]>
): Map<string, number[]> {
  const targetLabels = new Map<string, string>();
  for (const [key, label] of Object.entries(labels)) {
    targetLabels.set(normalizeLabel(label), key);
  }
  if (alts) {
    for (const [key, altLabels] of Object.entries(alts)) {
      for (const alt of altLabels) {
        targetLabels.set(normalizeLabel(alt), key);
      }
    }
  }

  const rowsByKey = new Map<string, number[]>();
  for (let rowIdx = 0; rowIdx < aoa.length; rowIdx++) {
    const row = aoa[rowIdx];
    if (!row) continue;
    for (let colIdx = 0; colIdx <= 1 && colIdx < row.length; colIdx++) {
      const cellStr = toStr(row[colIdx]);
      if (!cellStr) continue;
      const key = targetLabels.get(normalizeLabel(cellStr));
      if (!key) continue;
      const list = rowsByKey.get(key) ?? [];
      list.push(rowIdx);
      rowsByKey.set(key, list);
    }
  }
  return rowsByKey;
}

function findSectionRow(aoa: unknown[][], sectionLabel: string): number | null {
  const target = normalizeLabel(sectionLabel);
  for (let rowIdx = 0; rowIdx < aoa.length; rowIdx++) {
    const row = aoa[rowIdx];
    if (!row) continue;
    for (let colIdx = 0; colIdx <= 1 && colIdx < row.length; colIdx++) {
      const cellStr = toStr(row[colIdx]);
      if (cellStr && normalizeLabel(cellStr) === target) return rowIdx;
    }
  }
  return null;
}

/**
 * Build a map of label key → row index with optional section/last-match hints.
 */
function buildLabelRowMap(
  aoa: unknown[][],
  labels: Record<string, string>,
  alts?: Record<string, readonly string[]>,
  hints?: LabelHints
): Map<string, number> {
  const rowsByKey = collectLabelRows(aoa, labels, alts);
  const labelMap = new Map<string, number>();

  const sectionRows = new Map<string, number>();
  for (const hint of Object.values(hints ?? {})) {
    if (hint?.preferAfter && !sectionRows.has(hint.preferAfter)) {
      const row = findSectionRow(aoa, hint.preferAfter);
      if (row != null) sectionRows.set(hint.preferAfter, row);
    }
  }

  for (const key of Object.keys(labels)) {
    const indices = rowsByKey.get(key);
    if (!indices?.length) continue;

    const hint = hints?.[key];
    let candidates = [...indices];

    if (hint?.preferAfter) {
      const sectionRow = sectionRows.get(hint.preferAfter);
      if (sectionRow != null) {
        const filtered = candidates.filter((r) => r > sectionRow);
        if (filtered.length) candidates = filtered;
      }
    }

    if (hint?.preferLast) {
      labelMap.set(key, candidates[candidates.length - 1]!);
    } else {
      labelMap.set(key, candidates[0]!);
    }
  }

  return labelMap;
}

/** Collect APR rate/term pairs after the loan payment info section. */
function collectFinanceRateOptions(aoa: unknown[][], colIdx: number): BmwFinanceRateOption[] {
  const sectionRow = findSectionRow(aoa, LOAN_PAYMENT_INFO_LABEL);
  const startRow = sectionRow != null ? sectionRow + 1 : 0;
  const options: BmwFinanceRateOption[] = [];

  for (let rowIdx = startRow; rowIdx < aoa.length - 1; rowIdx++) {
    const row = aoa[rowIdx];
    const nextRow = aoa[rowIdx + 1];
    if (!row) continue;

    let isAprRate = false;
    for (let c = 0; c <= 1 && c < row.length; c++) {
      const cellStr = toStr(row[c]);
      if (!cellStr) continue;
      const lower = normalizeLabel(cellStr);
      if (
        lower === 'apr rate' ||
        lower === 'apr rate 60mo' ||
        lower === 'apr' ||
        lower === 'rate'
      ) {
        isAprRate = true;
        break;
      }
    }
    if (!isAprRate || !nextRow) continue;

    let isTerm = false;
    for (let c = 0; c <= 1 && c < nextRow.length; c++) {
      const cellStr = toStr(nextRow[c]);
      if (!cellStr) continue;
      const lower = normalizeLabel(cellStr);
      if (lower === 'term' || lower === 'apr term') {
        isTerm = true;
        break;
      }
    }
    if (!isTerm) continue;

    const aprRate = normalizeAprPercent(toNum(getCell(aoa, rowIdx, colIdx)));
    const aprTermMonths = toNum(getCell(aoa, rowIdx + 1, colIdx));
    if (aprRate == null || aprTermMonths == null) continue;

    options.push({ aprRate, aprTermMonths });
  }

  return options;
}

function parseLeaseSheet(
  ws: XLSX.WorkSheet,
  sourceSheet: string
): {
  offers: BmwRawLeaseOffer[];
  errors: string[];
  skippedReasons: Record<string, number>;
  skippedOffers: Array<Record<string, unknown>>;
} {
  const aoa = sheetToAoa(ws);
  const errors: string[] = [];
  const offers: BmwRawLeaseOffer[] = [];

  const labelMap = buildLabelRowMap(aoa, LEASE_ROW_LABELS, undefined, LEASE_LABEL_HINTS);
  const skippedReasons: Record<string, number> = {};
  const skippedOffers: Array<Record<string, unknown>> = [];
  const addSkip = (reason: string) => {
    skippedReasons[reason] = (skippedReasons[reason] ?? 0) + 1;
  };

  const statusRowIdx = labelMap.get('offerStatus');
  if (statusRowIdx == null) {
    errors.push(`${sourceSheet}: could not find "Offer Status on Special Offers" row`);
    return { offers, errors, skippedReasons, skippedOffers };
  }

  const yearRowIdx = labelMap.get('modelYear') ?? statusRowIdx + 1;
  const modelRowIdx = labelMap.get('officialModelName') ?? statusRowIdx + 2;
  const maxCol = aoa.reduce((max, row) => Math.max(max, row?.length ?? 0), 0);

  for (let colIdx = DATA_COL_START; colIdx < maxCol; colIdx++) {
    const statusVal = toStr(getCell(aoa, statusRowIdx, colIdx));

    if (!statusVal || statusVal.toLowerCase() !== 'live') {
      addSkip('lease_non_live_status');
      skippedOffers.push({
        reason: 'lease_non_live_status',
        sheet: 'lease',
        sourceSheet,
        columnIndex: colIdx,
        status: statusVal,
        year: toStr(getCell(aoa, yearRowIdx, colIdx)),
        model: toStr(getCell(aoa, modelRowIdx, colIdx)),
      });
      continue;
    }

    const yearVal = toStr(getCell(aoa, yearRowIdx, colIdx));
    const modelVal = toStr(getCell(aoa, modelRowIdx, colIdx));

    if (!yearVal || !modelVal) {
      addSkip('lease_missing_year_or_model');
      skippedOffers.push({
        reason: 'lease_missing_year_or_model',
        sheet: 'lease',
        sourceSheet,
        columnIndex: colIdx,
        status: statusVal,
        year: yearVal,
        model: modelVal,
      });
      continue;
    }

    const offer: BmwRawLeaseOffer = {
      sheetType: 'lease',
      sourceSheet,
      modelYear: yearVal,
      officialModelName: modelVal,
      localModelCode: toStr(getCell(aoa, labelMap.get('localModelCode') ?? -1, colIdx)),
      msrp: toNum(getCell(aoa, labelMap.get('msrp') ?? -1, colIdx)),
      annualMileage: toNum(getCell(aoa, labelMap.get('annualMileage') ?? -1, colIdx)),
      leaseCredit: toNum(getCell(aoa, labelMap.get('leaseCredit') ?? -1, colIdx)),
      leasePayment: toNum(getCell(aoa, labelMap.get('leasePayment') ?? -1, colIdx)),
      leaseTerm: toNum(getCell(aoa, labelMap.get('leaseTerm') ?? -1, colIdx)),
      dueAtSigning: toNum(getCell(aoa, labelMap.get('dueAtSigning') ?? -1, colIdx)),
      acquisitionFee: toNum(getCell(aoa, labelMap.get('acquisitionFee') ?? -1, colIdx)),
      nationalCredit: toNum(getCell(aoa, labelMap.get('nationalCredit') ?? -1, colIdx)),
      centerContribution: toNum(getCell(aoa, labelMap.get('centerContribution') ?? -1, colIdx)),
      totalCost: toNum(getCell(aoa, labelMap.get('totalCost') ?? -1, colIdx)),
    };

    offers.push(offer);
  }

  return { offers, errors, skippedReasons, skippedOffers };
}

function parseLoanSheet(ws: XLSX.WorkSheet, sourceSheet: string): {
  offers: BmwRawLoanOffer[];
  errors: string[];
  skippedReasons: Record<string, number>;
  skippedOffers: Array<Record<string, unknown>>;
} {
  const aoa = sheetToAoa(ws);
  const errors: string[] = [];
  const offers: BmwRawLoanOffer[] = [];

  const labelMap = buildLabelRowMap(aoa, LOAN_ROW_LABELS, LOAN_ROW_LABEL_ALTS, LOAN_LABEL_HINTS);
  const skippedReasons: Record<string, number> = {};
  const skippedOffers: Array<Record<string, unknown>> = [];
  const addSkip = (reason: string) => {
    skippedReasons[reason] = (skippedReasons[reason] ?? 0) + 1;
  };

  const statusRowIdx = labelMap.get('aprOfferStatus');
  if (statusRowIdx == null) {
    errors.push(`${sourceSheet}: could not find "APR Offer Status on Special Offers" row`);
    return { offers, errors, skippedReasons, skippedOffers };
  }

  const yearRowIdx = labelMap.get('modelYear') ?? statusRowIdx + 1;
  const modelRowIdx = labelMap.get('officialModelName') ?? statusRowIdx + 2;
  const maxCol = aoa.reduce((max, row) => Math.max(max, row?.length ?? 0), 0);

  for (let colIdx = DATA_COL_START; colIdx < maxCol; colIdx++) {
    const statusVal = toStr(getCell(aoa, statusRowIdx, colIdx));

    if (!statusVal || statusVal.toLowerCase() !== 'live') {
      addSkip('loan_non_live_status');
      skippedOffers.push({
        reason: 'loan_non_live_status',
        sheet: 'loan',
        sourceSheet,
        columnIndex: colIdx,
        status: statusVal,
        year: toStr(getCell(aoa, yearRowIdx, colIdx)),
        model: toStr(getCell(aoa, modelRowIdx, colIdx)),
      });
      continue;
    }

    const yearVal = toStr(getCell(aoa, yearRowIdx, colIdx));
    const modelVal = toStr(getCell(aoa, modelRowIdx, colIdx));

    if (!yearVal || !modelVal) {
      addSkip('loan_missing_year_or_model');
      skippedOffers.push({
        reason: 'loan_missing_year_or_model',
        sheet: 'loan',
        sourceSheet,
        columnIndex: colIdx,
        status: statusVal,
        year: yearVal,
        model: modelVal,
      });
      continue;
    }

    const financeRateOptions = collectFinanceRateOptions(aoa, colIdx);
    const primaryRate = financeRateOptions[0]?.aprRate ?? normalizeAprPercent(
      toNum(getCell(aoa, labelMap.get('aprRate60mo') ?? -1, colIdx))
    );
    const primaryTerm = financeRateOptions[0]?.aprTermMonths ?? toNum(
      getCell(aoa, labelMap.get('aprTerm') ?? -1, colIdx)
    );

    const offer: BmwRawLoanOffer = {
      sheetType: 'loan',
      sourceSheet,
      modelYear: yearVal,
      officialModelName: modelVal,
      localModelCode: toStr(getCell(aoa, labelMap.get('localModelCode') ?? -1, colIdx)),
      msrp: toNum(getCell(aoa, labelMap.get('msrp') ?? -1, colIdx)),
      msrpAlt: toNum(getCell(aoa, labelMap.get('msrpAlt') ?? -1, colIdx)),
      totalCost: toNum(getCell(aoa, labelMap.get('totalCost') ?? -1, colIdx)),
      customerDownPayment: toNum(getCell(aoa, labelMap.get('customerDownPayment') ?? -1, colIdx)),
      purchaseCredit: toNum(getCell(aoa, labelMap.get('purchaseCredit') ?? -1, colIdx)),
      nationalCredit: toNum(getCell(aoa, labelMap.get('nationalCredit') ?? -1, colIdx)),
      centerContribution: toNum(getCell(aoa, labelMap.get('centerContribution') ?? -1, colIdx)),
      aprRate60mo: primaryRate,
      aprTerm: primaryTerm,
      financeRateOptions,
    };

    offers.push(offer);
  }

  return { offers, errors, skippedReasons, skippedOffers };
}

/**
 * Parse a BMW Excel buffer (.xlsx) and return raw lease and loan offers.
 * Finds all sheets whose name contains "Lease" and one sheet containing "Loan".
 */
export function parseBmwExcel(buffer: Buffer | ArrayBuffer): ParseBmwExcelResult {
  const errors: string[] = [];
  const skippedReasons: Record<string, number> = {};
  const skippedOffers: Array<Record<string, unknown>> = [];
  const mergeSkippedOffers = (rows: Array<Record<string, unknown>>) => {
    skippedOffers.push(...rows);
  };
  const mergeSkips = (next: Record<string, number>) => {
    for (const [reason, count] of Object.entries(next)) {
      skippedReasons[reason] = (skippedReasons[reason] ?? 0) + count;
    }
  };
  const leaseOffers: BmwRawLeaseOffer[] = [];
  let loanOffers: BmwRawLoanOffer[] = [];

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', raw: true });
  } catch {
    return {
      leaseOffers: [],
      loanOffers: [],
      errors: ['Failed to read Excel file'],
      skippedCount: 0,
      skippedReasons: {},
      skippedOffers: [],
    };
  }

  const leaseSheets = findAllSheets(wb, 'lease');
  const loanSheetEntry = wb.SheetNames.map((name) => ({ name, sheet: wb.Sheets[name]! })).find(
    (e) => e.name.toLowerCase().includes('loan')
  );

  if (leaseSheets.length === 0 && !loanSheetEntry) {
    errors.push(
      `No "Lease" or "Loan" sheet found. Available sheets: ${wb.SheetNames.join(', ')}`
    );
    return { leaseOffers, loanOffers, errors, skippedCount: 0, skippedReasons, skippedOffers };
  }

  for (const { name, sheet } of leaseSheets) {
    const result = parseLeaseSheet(sheet, name);
    leaseOffers.push(...result.offers);
    errors.push(...result.errors);
    mergeSkips(result.skippedReasons);
    mergeSkippedOffers(result.skippedOffers);
  }

  if (loanSheetEntry) {
    const result = parseLoanSheet(loanSheetEntry.sheet, loanSheetEntry.name);
    loanOffers = result.offers;
    errors.push(...result.errors);
    mergeSkips(result.skippedReasons);
    mergeSkippedOffers(result.skippedOffers);
  } else {
    errors.push('No "Loan" sheet found — skipping loan offers');
  }

  const skippedCount = Object.values(skippedReasons).reduce((sum, n) => sum + n, 0);
  return { leaseOffers, loanOffers, errors, skippedCount, skippedReasons, skippedOffers };
}
