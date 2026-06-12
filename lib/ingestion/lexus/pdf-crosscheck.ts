import { OfferStatus, VehicleCondition } from '@prisma/client';
import type { LexusPreviewRow } from './run';
import type { PdfLeaseExampleRow } from './lease-examples-pdf';
import type { CrosscheckSummary, CrosscheckWarning } from '@/lib/ingestion/shared/crosscheck';

export type LexusPreviewSourceMode = 'api_with_optional_pdf' | 'pdf_only';

export interface LexusPdfCrosscheckResult {
  rows: LexusPreviewRow[];
  summary: CrosscheckSummary;
  warnings: CrosscheckWarning[];
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

function collapseToken(value: unknown): string {
  return normalizeText(value).replace(/[^A-Z0-9]/g, '');
}

function canonicalModel(value: unknown): string {
  const raw = normalizeText(value).replace(/\bLEXUS\b/g, '').trim();
  if (!raw) return '';
  const collapsed = raw.replace(/\s+/g, '').replace(/[\-_/]/g, '');
  const familyMatch = collapsed.match(/(IS|RX|UX|TX|GX|NX|RZ|ES|LS|LC|LX)/);
  if (familyMatch) return familyMatch[1]!;
  return collapsed;
}

function makeMatchKey(
  model: string,
  trim: string | null,
  term: number | null,
  payment: number | null,
  year: number | null
): string {
  return [
    canonicalModel(model),
    collapseToken(trim),
    String(term ?? ''),
    String(payment ?? ''),
    String(year ?? ''),
  ].join('\0');
}

function toNum(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeTrim(value: unknown): string | null {
  const t = normalizeText(value);
  if (!t) return null;
  const collapsed = t.replace(/[^A-Z0-9]/g, '');
  const aliasMap: Array<[RegExp, string]> = [
    [/^H$/, 'HYBRID'],
    [/^HYBRID$/, 'HYBRID'],
    [/^PLUGINHYBRID$/, 'PLUG-IN HYBRID'],
    [/^PLUGINHYBRID$/, 'PLUG-IN HYBRID'],
    [/^FSPORT$/, 'F SPORT'],
    [/^FSPORTHANDLING$/, 'F SPORT HANDLING'],
    [/^FSPORTPERFORMANCE$/, 'F SPORT PERFORMANCE'],
    [/^LUX$/, 'LUXURY'],
    [/^LUXURY$/, 'LUXURY'],
    [/^PREM$/, 'PREMIUM'],
    [/^PREMIUM$/, 'PREMIUM'],
    [/^BASE$/, 'BASE'],
    [/^STD$/, 'BASE'],
    [/^STANDARD$/, 'BASE'],
  ];
  for (const [pattern, normalized] of aliasMap) {
    if (pattern.test(collapsed)) return normalized;
  }
  if (t === 'HYBRID' || t === 'H') return 'Hybrid';
  if (t === 'PLUG-IN HYBRID' || t === 'PLUG IN HYBRID') return 'Plug-In Hybrid';
  if (t === 'FSPORT' || t === 'F SPORT') return 'F SPORT';
  if (t.includes('AWD')) return 'AWD';
  return collapsed || null;
}

function hybridClass(model: unknown, trim: unknown): 'hybrid' | 'plug_in_hybrid' | 'non_hybrid' {
  const m = normalizeText(model);
  const t = normalizeText(trim);
  if (t.includes('PLUG-IN HYBRID') || t.includes('PLUG IN HYBRID') || m.includes('PHV')) {
    return 'plug_in_hybrid';
  }
  if (t.includes('HYBRID') || t === 'H' || m.endsWith('H')) {
    return 'hybrid';
  }
  return 'non_hybrid';
}

function hasComparableTrim(value: unknown): boolean {
  return normalizeTrim(value) != null;
}

type PowertrainVariant = 'base' | 'hybrid' | 'plug_in_hybrid';

function powertrainVariant(model: unknown, trim: unknown): PowertrainVariant {
  const m = normalizeText(model);
  const t = normalizeText(trim);
  const combined = `${m} ${t}`;
  if (
    combined.includes('PLUG-IN') ||
    combined.includes('PLUG IN') ||
    combined.includes('PHV') ||
    /\b\d{3}H\+/.test(combined)
  ) {
    return 'plug_in_hybrid';
  }
  if (
    combined.includes('HYBRID') ||
    /\b\d{3}H\b/.test(combined) ||
    /(^|[^A-Z0-9])(UXH|NXH|RXH|TXH)([^A-Z0-9]|$)/.test(combined)
  ) {
    return 'hybrid';
  }
  return 'base';
}

function buildFromPdf(pdf: PdfLeaseExampleRow): LexusPreviewRow {
  return {
    storeCode: 'LEXDT',
    storeCodes: ['LEXDT', 'LEXWG'],
    make: 'Lexus',
    model: pdf.model,
    year: pdf.year,
    trim: pdf.trim,
    condition: VehicleCondition.NEW,
    startDate: pdf.dateFrom ?? null,
    endDate: pdf.dateTo ?? null,
    status: OfferStatus.LIVE,
    offerType: 'Lease',
    leasePayment: pdf.leasePayment,
    leaseTerm: pdf.leaseTerm,
    leaseMiles: pdf.leaseMiles,
    dueAtSigning: pdf.dueAtSigning,
    capCostReduction: pdf.capCostReduction,
    msrp: pdf.baseMsrp,
    fieldSource: 'pdf',
  };
}

export function crosscheckApiWithPdf(apiRows: LexusPreviewRow[], pdfRows: PdfLeaseExampleRow[]): LexusPdfCrosscheckResult {
  const warnings: CrosscheckWarning[] = [];
  let matchedCount = 0;
  let enrichedFields = 0;
  let conflicts = 0;
  const matchedPdfIds = new Set<string>();
  const comparablePdfRows = pdfRows.filter(
    (p) => toNum(p.year) != null && toNum(p.leaseTerm) != null && toNum(p.leasePayment) != null
  );
  const sparsePdfRows = pdfRows.length - comparablePdfRows.length;
  if (sparsePdfRows > 0) {
    warnings.push({
      code: 'LEXUS_PDF_SPARSE_ROWS_SKIPPED',
      severity: 'info',
      fields: ['leaseTerm', 'leasePayment'],
      sourceA: 'pdf',
      sourceB: 'api',
      message: `Skipped ${sparsePdfRows} sparse PDF row(s) missing term/payment during matching.`,
      rowRefs: [],
    });
  }

  const capOnlyIndex = new Map<string, PdfLeaseExampleRow[]>();
  for (const p of pdfRows) {
    const key = [
      canonicalModel(p.model),
      powertrainVariant(p.model, p.trim),
      String(toNum(p.year) ?? ''),
    ].join('\0');
    if (!key) continue;
    const arr = capOnlyIndex.get(key) ?? [];
    arr.push(p);
    capOnlyIndex.set(key, arr);
  }

  const rows = apiRows.map((row) => {
    const offerType = String(row.offerType ?? '');
    if (offerType !== 'Lease') return row;
    const key = makeMatchKey(
      String(row.model ?? ''),
      normalizeTrim(row.trim),
      Number(row.leaseTerm ?? 0) || null,
      Number(row.leasePayment ?? 0) || null,
      Number(row.year ?? 0) || null
    );
    const match = comparablePdfRows.find((p) => {
      if (matchedPdfIds.has(p.sourceId)) return false;
      return makeMatchKey(p.model, normalizeTrim(p.trim), p.leaseTerm, p.leasePayment, p.year) === key;
    });
    const usedRelaxedMatch = false;
    if (!match) {
      // Strict-only mode fallback for enrichment (not matching):
      // If exactly one PDF row exists for the same year+model+trim and has cap cost reduction,
      // enrich cap fields without counting as a crosscheck match.
      const capKey = [
        canonicalModel(String(row.model ?? '')),
        powertrainVariant(row.model, row.trim),
        String(Number(row.year ?? 0) || ''),
      ].join('\0');
      const candidates = (capOnlyIndex.get(capKey) ?? []).filter((p) => p.capCostReduction != null);
      if (candidates.length === 1) {
        const only = candidates[0]!;
        const next = { ...row } as LexusPreviewRow;
        // Default to API MSRP; only backfill from PDF when API MSRP is missing.
        if (next.msrp == null && only.baseMsrp != null) next.msrp = only.baseMsrp;
        if (next.leaseMiles == null && only.leaseMiles != null) {
          next.leaseMiles = only.leaseMiles;
          enrichedFields += 1;
        }
        if (next.capCostReduction == null && only.capCostReduction != null) {
          next.capCostReduction = only.capCostReduction;
          enrichedFields += 1;
        }
        next.fieldSource = 'api';
        return next;
      }
      return row;
    }
    matchedCount += 1;
    matchedPdfIds.add(match.sourceId);

    const next = { ...row } as LexusPreviewRow;
    // Default to API MSRP; only backfill from PDF when API MSRP is missing.
    if (next.msrp == null && match.baseMsrp != null) next.msrp = match.baseMsrp;
    if (next.leaseMiles == null && match.leaseMiles != null) {
      next.leaseMiles = match.leaseMiles;
      enrichedFields += 1;
    }
    if (next.capCostReduction == null && match.capCostReduction != null) {
      next.capCostReduction = match.capCostReduction;
      enrichedFields += 1;
    }
    next.fieldSource = 'api';

    const pdfDueAtSigning = toNum(match.dueAtSigning);
    const apiDueAtSigning = toNum(next.dueAtSigning);
    const pdfDueLooksUsable = pdfDueAtSigning != null && pdfDueAtSigning >= 1000;
    const strictTrimQualified =
      !usedRelaxedMatch && hasComparableTrim(row.trim) && hasComparableTrim(match.trim);
    if (strictTrimQualified && pdfDueLooksUsable && apiDueAtSigning != null && apiDueAtSigning !== pdfDueAtSigning) {
      conflicts += 1;
      warnings.push({
        code: 'LEXUS_PDF_DUE_AT_SIGNING_MISMATCH',
        severity: 'warning',
        fields: ['dueAtSigning'],
        sourceA: 'api',
        sourceB: 'pdf',
        message: `Due-at-signing mismatch for ${row.year} ${row.model} ${row.trim ?? ''}: API ${next.dueAtSigning}, PDF ${match.dueAtSigning}.`,
        rowRefs: [String(row.sourceOfferId ?? row.sourceFingerprint ?? row.model ?? 'unknown'), match.sourceId],
      });
    }
    return next;
  });

  const unmatchedPdfCount = comparablePdfRows.filter((p) => !matchedPdfIds.has(p.sourceId)).length;
  const unmatchedApiCount = rows.filter((r) => String(r.offerType ?? '') === 'Lease').length - matchedCount;

  return {
    rows,
    warnings,
    summary: {
      matchedCount,
      unmatchedApiCount,
      unmatchedPdfCount,
      unmatchedDbCount: 0,
      enrichedFields,
      conflicts,
      totalPdfRows: pdfRows.length,
      comparablePdfRows: comparablePdfRows.length,
      parseDiagnostics: [],
    },
  };
}

export function buildPdfOnlyRowsAndCrosscheck(
  pdfRows: PdfLeaseExampleRow[],
  dbRows: LexusPreviewRow[]
): LexusPdfCrosscheckResult {
  const rows = pdfRows.map(buildFromPdf);
  const warnings: CrosscheckWarning[] = [];
  let matchedCount = 0;
  let conflicts = 0;
  const comparableRows = rows.filter((r) => toNum(r.year) != null && toNum(r.leaseTerm) != null && toNum(r.leasePayment) != null);
  const sparseRows = rows.length - comparableRows.length;
  if (sparseRows > 0) {
    warnings.push({
      code: 'LEXUS_PDF_ONLY_SPARSE_ROWS',
      severity: 'info',
      fields: ['leaseTerm', 'leasePayment'],
      sourceA: 'pdf',
      sourceB: 'db',
      message: `${sparseRows} PDF-only row(s) are sparse and were excluded from DB crosscheck matching.`,
      rowRefs: [],
    });
  }

  const dbLeaseRows = dbRows.filter((r) => String(r.offerType ?? '') === 'Lease');
  const matchedDb = new Set<number>();
  for (const row of comparableRows) {
    const key = makeMatchKey(
      String(row.model ?? ''),
      normalizeTrim(row.trim),
      Number(row.leaseTerm ?? 0) || null,
      Number(row.leasePayment ?? 0) || null,
      Number(row.year ?? 0) || null
    );
    const idx = dbLeaseRows.findIndex(
      (d) =>
        makeMatchKey(
          String(d.model ?? ''),
          normalizeTrim(d.trim),
          Number(d.leaseTerm ?? 0) || null,
          Number(d.leasePayment ?? 0) || null,
          Number(d.year ?? 0) || null
        ) === key
    );
    if (idx >= 0) {
      matchedCount += 1;
      matchedDb.add(idx);
      const d = dbLeaseRows[idx];
      if (d.dueAtSigning != null && row.dueAtSigning != null && Number(d.dueAtSigning) !== Number(row.dueAtSigning)) {
        conflicts += 1;
        warnings.push({
          code: 'LEXUS_PDF_DB_DUE_AT_SIGNING_MISMATCH',
          severity: 'warning',
          fields: ['dueAtSigning'],
          sourceA: 'pdf',
          sourceB: 'db',
          message: `PDF-only row differs from DB due-at-signing for ${row.year} ${row.model} ${row.trim ?? ''}.`,
          rowRefs: [String(row.sourceId ?? `${row.model}-${row.year}`), String(d.id ?? d.model ?? 'db-row')],
        });
      }
    }
  }

  return {
    rows,
    warnings,
    summary: {
      matchedCount,
      unmatchedApiCount: 0,
      unmatchedPdfCount: comparableRows.length - matchedCount,
      unmatchedDbCount: dbLeaseRows.length - matchedDb.size,
      enrichedFields: 0,
      conflicts,
      totalPdfRows: rows.length,
      comparablePdfRows: comparableRows.length,
      parseDiagnostics: [],
    },
  };
}

