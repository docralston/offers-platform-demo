'use server';
 
import { requireAdmin } from '@/lib/auth';
import { MAX_UPLOAD_BYTES } from '@/lib/ingestion/constants';
import { demoBlockedMessage, isDemoMode } from '@/lib/config/demo';
import { revalidatePath } from 'next/cache';
import type { OfferInput } from '@/lib/domain/validation';
import { runToyotaIngestion, type ToyotaRunSummary } from '@/lib/ingestion/toyota/run';
import { writeToyotaOffers } from '@/lib/ingestion/toyota/write-db';
import {
  runLexusIngestion,
  type LexusRunSummary,
  type LexusPreviewRow,
} from '@/lib/ingestion/lexus/run';
import { writeLexusOffers } from '@/lib/ingestion/lexus/write-db';
import type { LexusDuplicateWarningGroup } from '@/lib/ingestion/lexus/dedupe';
import { parseLexusLeaseExamplesPdf } from '@/lib/ingestion/lexus/lease-examples-pdf';
import {
  buildPdfOnlyRowsAndCrosscheck,
  crosscheckApiWithPdf,
  type LexusPreviewSourceMode,
} from '@/lib/ingestion/lexus/pdf-crosscheck';
import type { CrosscheckSummary, CrosscheckWarning } from '@/lib/ingestion/shared/crosscheck';
import { parseBmwExcel } from '@/lib/ingestion/bmw/parse-excel';
import { normalizeBmwOffers, type BmwNormalizedOffer } from '@/lib/ingestion/bmw/normalize';
import { writeBmwOffers } from '@/lib/ingestion/bmw/write-db';
import { prisma } from '@/lib/prisma';
import { validateOffer as validateOfferImport } from '@/lib/validation/offers';

async function ingestionAdminId(): Promise<string | null> {
  if (isDemoMode()) return null;
  try {
    return await requireAdmin();
  } catch {
    return null;
  }
}

function demoBlocked<T extends { success: false; errors: string[] }>(base: T): T {
  return { ...base, errors: [demoBlockedMessage()] };
}

export type RefreshToyotaResult = {
  success: boolean;
  inserted: number;
  updated: number;
  inactivated: number;
  errors: string[];
  runId: string;
  rawOfferCount?: number;
  normalizedCount?: number;
  dedupedCount?: number;
  skippedCount?: number;
  skipReasons?: Record<string, number>;
  skippedOffers?: Array<Record<string, unknown>>;
  byOfferType?: { Lease: number; Finance: number; Other: number };
};

/** Serializable row for Toyota preview table (dates as strings). */
export type ToyotaPreviewRow = Record<string, unknown>;

/** Result of Toyota preview (scrape + normalize + dedupe, no DB write). */
export type PreviewToyotaResult = {
  success: boolean;
  runId: string;
  errors: string[];
  rawOfferCount: number;
  normalizedCount: number;
  dedupedCount: number;
  skippedCount: number;
  skipReasons: Record<string, number>;
  skippedOffers: Array<Record<string, unknown>>;
  byOfferType: { Lease: number; Finance: number; Other: number };
  /** Rows for editable preview table (same order as would be written). */
  rows: ToyotaPreviewRow[];
  validationErrors?: string[];
  validationWarnings?: string[];
};

export type DispatchToyotaWorkflowResult = {
  success: boolean;
  workflowRunId?: number;
  workflowRunUrl?: string;
  errors: string[];
};

export type RefreshLexusResult = {
  success: boolean;
  inserted: number;
  updated: number;
  inactivated: number;
  errors: string[];
  runId: string;
  rawOfferCount?: number;
  normalizedCount?: number;
  dedupedCount?: number;
  skippedCount?: number;
  skipReasons?: Record<string, number>;
  skippedOffers?: Array<Record<string, unknown>>;
  warningCount?: number;
  warningGroups?: LexusDuplicateWarningGroup[];
  byOfferType?: { Lease: number; Finance: number; Other: number };
};

/** Serializable row for Lexus preview table (dates as strings). */
export type LexusPreviewRowOnClient = LexusPreviewRow;

/** Result of Lexus preview (API fetch + normalize, no DB write). */
export type PreviewLexusResult = {
  success: boolean;
  runId: string;
  errors: string[];
  rawOfferCount: number;
  normalizedCount: number;
  dedupedCount: number;
  skippedCount: number;
  skipReasons: Record<string, number>;
  skippedOffers: Array<Record<string, unknown>>;
  warningCount: number;
  warningGroups: LexusDuplicateWarningGroup[];
  sourceMode: LexusPreviewSourceMode;
  crosscheckSummary?: CrosscheckSummary;
  crosscheckWarnings?: CrosscheckWarning[];
  byOfferType: { Lease: number; Finance: number; Other: number };
  /** Rows for editable preview table (same order as would be written). */
  rows: LexusPreviewRowOnClient[];
  validationErrors?: string[];
  validationWarnings?: string[];
};

/** Vercel sets this; Playwright/Chromium cannot run in serverless. */
const isVercel = process.env.VERCEL === '1';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Preview Toyota offers: runs scraper → extract → normalize → dedupe without writing to DB.
 * Use this to see what would be imported before pushing live.
 */
export async function previewToyotaOffers(): Promise<PreviewToyotaResult> {
  if (isDemoMode()) {
    return demoBlocked({
      success: false,
      runId: '',
      errors: [],
      rawOfferCount: 0,
      normalizedCount: 0,
      dedupedCount: 0,
      skippedCount: 0,
      skipReasons: {},
      skippedOffers: [],
      byOfferType: { Lease: 0, Finance: 0, Other: 0 },
      rows: [],
    });
  }
  try {
    await requireAdmin();
  } catch {
    return {
      success: false,
      runId: '',
      errors: ['Admin access required to preview Toyota offers.'],
      rawOfferCount: 0,
      normalizedCount: 0,
      dedupedCount: 0,
      skippedCount: 0,
      skipReasons: {},
      skippedOffers: [],
      byOfferType: { Lease: 0, Finance: 0, Other: 0 },
      rows: [],
    };
  }

  if (isVercel) {
    return {
      success: false,
      runId: '',
      errors: [
        'Toyota preview cannot run on Vercel (no browser in serverless). Use the CLI locally or configure GitHub Actions.',
      ],
      rawOfferCount: 0,
      normalizedCount: 0,
      dedupedCount: 0,
      skippedCount: 0,
      skipReasons: {},
      skippedOffers: [],
      byOfferType: { Lease: 0, Finance: 0, Other: 0 },
      rows: [],
    };
  }

  // Default to headed (false) so spec-line content can inject; set TOYOTA_HEADLESS=1 for headless
  const headless = process.env.TOYOTA_HEADLESS === '1';
  const channel = process.env.PLAYWRIGHT_CHANNEL === 'chrome' ? 'chrome' : null;

  try {
    const summary = await runToyotaIngestion({
      skipDb: true,
      headless,
      userDataDir: process.env.TOYOTA_USER_DATA_DIR ?? null,
      storageStatePath: process.env.TOYOTA_STORAGE_STATE_PATH ?? null,
      channel,
      updatedBy: null,
    });
    const previewRows = summary.previewRows ?? [];
    const validation = summarizePreviewValidation(previewRows as Record<string, unknown>[]);

    return {
      success: summary.success,
      runId: summary.runId,
      errors: summary.errors,
      rawOfferCount: summary.rawOfferCount,
      normalizedCount: summary.normalizedCount,
      dedupedCount: summary.dedupedCount,
      skippedCount: summary.skippedCount,
      skipReasons: summary.skipReasons,
      skippedOffers: summary.skippedOffers ?? [],
      byOfferType: summary.byOfferType,
      rows: previewRows,
      validationErrors: validation.errors,
      validationWarnings: validation.warnings,
    };
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    return {
      success: false,
      runId: '',
      errors: [`Preview failed: ${message}`],
      rawOfferCount: 0,
      normalizedCount: 0,
      dedupedCount: 0,
      skippedCount: 0,
      skipReasons: {},
      skippedOffers: [],
      byOfferType: { Lease: 0, Finance: 0, Other: 0 },
      rows: [],
    };
  }
}

/**
 * Manual refresh of Toyota offers: runs scraper → extract → normalize → dedupe → DB write.
 * Requires auth. Uses current user id as updatedBy for DB writes.
 * Does not run on Vercel (Playwright unsupported); returns a clear message instead.
 */
export async function refreshToyotaOffers(): Promise<RefreshToyotaResult> {
  if (isDemoMode()) {
    return demoBlocked({
      success: false,
      inserted: 0,
      updated: 0,
      inactivated: 0,
      errors: [],
      runId: '',
    });
  }
  const userId = await ingestionAdminId();
  if (!userId) {
    return {
      success: false,
      inserted: 0,
      updated: 0,
      inactivated: 0,
      errors: ['Admin access required to refresh Toyota offers.'],
      runId: '',
    };
  }

  if (isVercel) {
    return {
      success: false,
      inserted: 0,
      updated: 0,
      inactivated: 0,
      errors: [
        'Toyota refresh cannot run on Vercel (no browser in serverless). Use the CLI locally (npx tsx scripts/run-toyota-ingestion.ts) or configure GitHub Actions dispatch above.',
      ],
      runId: '',
    };
  }

  // Default to headed (false) so spec-line content can inject; set TOYOTA_HEADLESS=1 for headless
  const headless = process.env.TOYOTA_HEADLESS === '1';
  const channel = process.env.PLAYWRIGHT_CHANNEL === 'chrome' ? 'chrome' : null;

  try {
    const summary: ToyotaRunSummary = await runToyotaIngestion({
      skipDb: false,
      headless,
      // Use the same persisted Playwright profile as CLI runs when set locally.
      userDataDir: process.env.TOYOTA_USER_DATA_DIR ?? null,
      // Alternative to userDataDir: load cookies/localStorage from a saved storageState file.
      storageStatePath: process.env.TOYOTA_STORAGE_STATE_PATH ?? null,
      channel,
      updatedBy: userId,
    });

    revalidatePath('/admin/offers');
    revalidatePath('/admin/offers/import');

    return {
      success: summary.success,
      inserted: summary.inserted,
      updated: summary.updated,
      inactivated: summary.inactivated,
      errors: summary.errors,
      runId: summary.runId,
      rawOfferCount: summary.rawOfferCount,
      normalizedCount: summary.normalizedCount,
      dedupedCount: summary.dedupedCount,
      skippedCount: summary.skippedCount,
      skipReasons: summary.skipReasons,
      skippedOffers: summary.skippedOffers,
      byOfferType: summary.byOfferType,
    };
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    return {
      success: false,
      inserted: 0,
      updated: 0,
      inactivated: 0,
      errors: [`Toyota refresh failed: ${message}`],
      runId: '',
    };
  }
}

const NUMERIC_OFFER_KEYS = [
  'year', 'leasePayment', 'leaseTerm', 'leaseMiles', 'dueAtSigning', 'acquisitionFee', 'downPayment',
  'capCostReduction', 'grossCapCost', 'netCapCost', 'securityDeposit', 'perExcessMile',
  'msrp', 'discount', 'buyFor', 'aprRate', 'aprTermMonths',
  'rebateTotal', 'customerCash', 'leaseCash', 'aprCash', 'bonusCash',
] as const;

function coerceModelCode(value: unknown): string | null {
  if (value == null || value === '') return null;
  return String(value).replace(/\.0$/, '').trim() || null;
}

function coercePreviewRowToOfferInput(row: ToyotaPreviewRow): OfferInput {
  const out: Record<string, unknown> = { ...row };
  for (const key of NUMERIC_OFFER_KEYS) {
    const v = out[key];
    if (v === '' || v === undefined) out[key] = null;
    else if (typeof v === 'string') {
      const n = parseFloat(v.replace(/[,$\s]/g, ''));
      out[key] = Number.isNaN(n) ? null : n;
    }
  }
  out.modelCode = coerceModelCode(out.modelCode);
  return out as unknown as OfferInput;
}

function summarizePreviewValidation(rows: Record<string, unknown>[]): {
  errors: string[];
  warnings: string[];
} {
  const aggregate = new Map<string, { count: number; sampleRows: number[] }>();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? {};
    const offer = coercePreviewRowToOfferInput(row as ToyotaPreviewRow);
    const result = validateOfferImport(offer);
    for (const issue of result.issues) {
      const key = `${issue.severity}|${issue.code}|${issue.field ?? ''}|${issue.message}`;
      const existing = aggregate.get(key);
      if (!existing) {
        aggregate.set(key, { count: 1, sampleRows: [i + 1] });
      } else {
        existing.count += 1;
        if (existing.sampleRows.length < 5) existing.sampleRows.push(i + 1);
      }
    }
  }

  const errors: string[] = [];
  const warnings: string[] = [];
  const entries = Array.from(aggregate.entries()).sort((a, b) => b[1].count - a[1].count);
  for (const [key, meta] of entries) {
    const [severity, code, field, message] = key.split('|');
    const sample = meta.sampleRows.join(', ');
    const line = `${code}${field ? ` (${field})` : ''}: ${message} [${meta.count} row${meta.count === 1 ? '' : 's'}; sample rows: ${sample}]`;
    if (severity === 'error') errors.push(line);
    else warnings.push(line);
  }
  return { errors, warnings };
}

/**
 * Write Toyota preview rows to the database (after user has edited the preview table).
 * Rows are the same shape as from previewToyotaOffers; numeric strings are coerced.
 */
export async function pushToyotaOffers(rows: ToyotaPreviewRow[]): Promise<RefreshToyotaResult> {
  if (isDemoMode()) {
    return demoBlocked({
      success: false,
      inserted: 0,
      updated: 0,
      inactivated: 0,
      errors: [],
      runId: '',
    });
  }
  const userId = await ingestionAdminId();
  if (!userId) {
    return {
      success: false,
      inserted: 0,
      updated: 0,
      inactivated: 0,
      errors: ['Admin access required to push Toyota offers live.'],
      runId: '',
    };
  }

  if (!rows.length) {
    return {
      success: true,
      inserted: 0,
      updated: 0,
      inactivated: 0,
      errors: [],
      runId: '',
    };
  }

  try {
    const offerRows: OfferInput[] = rows.map(coercePreviewRowToOfferInput);
    const writeResult = await writeToyotaOffers(offerRows, { updatedBy: userId });

    revalidatePath('/admin/offers');
    revalidatePath('/admin/offers/import');

    const byOfferType = { Lease: 0, Finance: 0, Other: 0 };
    for (const row of offerRows) {
      const ot = String(row.offerType ?? '');
      if (ot === 'Lease') byOfferType.Lease++;
      else if (ot === 'Finance') byOfferType.Finance++;
      else byOfferType.Other++;
    }

    return {
      success: !writeResult.error,
      inserted: writeResult.inserted,
      updated: writeResult.updated,
      inactivated: writeResult.inactivated,
      errors: writeResult.error ? [writeResult.error as string] : [],
      runId: '',
      dedupedCount: rows.length,
      byOfferType,
    };
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    return {
      success: false,
      inserted: 0,
      updated: 0,
      inactivated: 0,
      errors: [`Push failed: ${message}`],
      runId: '',
    };
  }
}

/**
 * Dispatch Toyota ingestion workflow in GitHub Actions (alternative to running Playwright in-app).
 * Requires GITHUB_TOKEN and GITHUB_REPO env vars (e.g., "owner/repo").
 */
export async function dispatchToyotaIngestionWorkflow(): Promise<DispatchToyotaWorkflowResult> {
  if (isDemoMode()) {
    return demoBlocked({ success: false, errors: [] });
  }
  const userId = await ingestionAdminId();
  if (!userId) {
    return {
      success: false,
      errors: ['Admin access required to dispatch the Toyota ingestion workflow.'],
    };
  }

  const githubToken = process.env.GITHUB_TOKEN;
  const githubRepo = process.env.GITHUB_REPO; // Format: "owner/repo"

  if (!githubToken || !githubRepo) {
    return {
      success: false,
      errors: [
        'GitHub integration not configured. Set GITHUB_TOKEN and GITHUB_REPO environment variables.',
      ],
    };
  }

  try {
    const [owner, repo] = githubRepo!.split('/');
    if (!owner || !repo) {
      return {
        success: false,
        errors: [`Invalid GITHUB_REPO format. Expected "owner/repo", got: ${githubRepo}`],
      };
    }

    const workflowId = 'toyota-ingestion.yml';
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: 'main', // or 'master' depending on your default branch
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        success: false,
        errors: [
          `GitHub API error (${response.status}): ${errorText}`,
        ],
      };
    }

    // Get the workflow run ID from the response (GitHub may return it in headers or we need to query)
    // For now, construct the URL manually - GitHub will redirect to the actual run
    const workflowRunUrl = `https://github.com/${owner}/${repo}/actions/workflows/${workflowId}`;

    revalidatePath('/admin/offers');
    revalidatePath('/admin/offers/import');

    return {
      success: true,
      workflowRunUrl,
      errors: [],
    };
  } catch (err: unknown) {
    return {
      success: false,
      errors: [getErrorMessage(err)],
    };
  }
}

/**
 * Preview Lexus offers: calls OEM JSON APIs (NEW + CPO), normalizes rows for both Lexus
 * stores (LEXDT, LEXWG), and returns a preview without writing to DB.
 */
export async function previewLexusOffers(formData?: FormData): Promise<PreviewLexusResult> {
  if (isDemoMode()) {
    return demoBlocked({
      success: false,
      runId: '',
      errors: [],
      rawOfferCount: 0,
      normalizedCount: 0,
      dedupedCount: 0,
      skippedCount: 0,
      skipReasons: {},
      skippedOffers: [],
      warningCount: 0,
      warningGroups: [],
      sourceMode: 'api_with_optional_pdf' as LexusPreviewSourceMode,
      byOfferType: { Lease: 0, Finance: 0, Other: 0 },
      rows: [],
    });
  }
  const userId = await ingestionAdminId();
  const sourceModeRaw = formData?.get('sourceMode');
  const sourceMode: LexusPreviewSourceMode =
    sourceModeRaw === 'pdf_only' ? 'pdf_only' : 'api_with_optional_pdf';
  if (!userId) {
    return {
      success: false,
      runId: '',
      errors: ['Admin access required to preview Lexus offers.'],
      rawOfferCount: 0,
      normalizedCount: 0,
      dedupedCount: 0,
      skippedCount: 0,
      skipReasons: {},
      skippedOffers: [],
      warningCount: 0,
      warningGroups: [],
      sourceMode,
      byOfferType: { Lease: 0, Finance: 0, Other: 0 },
      rows: [],
    };
  }

  try {
    let pdfRows: Awaited<ReturnType<typeof parseLexusLeaseExamplesPdf>>['rows'] = [];
    const parseDiagnostics: string[] = [];
    const pdfFile = formData?.get('pdfFile');
    if (pdfFile instanceof File && pdfFile.size > 0) {
      if (pdfFile.size > MAX_UPLOAD_BYTES) {
        return {
          success: false,
          runId: '',
          errors: [`PDF exceeds ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit`],
          rawOfferCount: 0,
          normalizedCount: 0,
          dedupedCount: 0,
          skippedCount: 0,
          skipReasons: {},
          skippedOffers: [],
          warningCount: 0,
          warningGroups: [],
          sourceMode,
          byOfferType: { Lease: 0, Finance: 0, Other: 0 },
          rows: [],
        };
      }
      const arr = await pdfFile.arrayBuffer();
      const parsed = await parseLexusLeaseExamplesPdf(Buffer.from(arr));
      pdfRows = parsed.rows;
      parseDiagnostics.push(...parsed.diagnostics);
    }

    if (sourceMode === 'pdf_only') {
      const dbOffers = await prisma.offer.findMany({
        where: { make: 'Lexus', offerType: 'Lease' },
        select: {
          id: true,
          storeCode: true,
          storeCodes: true,
          make: true,
          model: true,
          year: true,
          trim: true,
          condition: true,
          startDate: true,
          endDate: true,
          status: true,
          offerType: true,
          leasePayment: true,
          leaseTerm: true,
          leaseMiles: true,
          dueAtSigning: true,
          capCostReduction: true,
          msrp: true,
        },
        take: 5000,
      });
      const dbRows = dbOffers.map((o) => ({
        ...o,
        startDate: o.startDate ? o.startDate.toISOString().slice(0, 10) : null,
        endDate: o.endDate ? o.endDate.toISOString().slice(0, 10) : null,
      })) as LexusPreviewRow[];
      const cross = buildPdfOnlyRowsAndCrosscheck(pdfRows, dbRows);
      cross.summary.parseDiagnostics.push(...parseDiagnostics);
      const validation = summarizePreviewValidation(cross.rows as Record<string, unknown>[]);
      return {
        success: true,
        runId: '',
        errors: [],
        rawOfferCount: pdfRows.length,
        normalizedCount: cross.rows.length,
        dedupedCount: cross.rows.length,
        skippedCount: 0,
        skipReasons: {},
        skippedOffers: [],
        warningCount: cross.warnings.length,
        warningGroups: [],
        sourceMode,
        crosscheckSummary: cross.summary,
        crosscheckWarnings: cross.warnings,
        byOfferType: { Lease: cross.rows.length, Finance: 0, Other: 0 },
        rows: cross.rows,
        validationErrors: validation.errors,
        validationWarnings: validation.warnings,
      };
    }

    const summary: LexusRunSummary = await runLexusIngestion({
      skipDb: true,
      updatedBy: null,
    });
    let previewRows = summary.previewRows ?? [];
    let crosscheckSummary: CrosscheckSummary | undefined;
    let crosscheckWarnings: CrosscheckWarning[] | undefined;
    let errors = summary.errors;
    if (pdfRows.length > 0) {
      const cross = crosscheckApiWithPdf(previewRows, pdfRows);
      cross.summary.parseDiagnostics.push(...parseDiagnostics);
      // Safety invariant for API mode: never allow PDF-origin rows to be introduced
      // into the import list; PDF is enrichment-only here.
      previewRows = cross.rows.filter((r) => String(r.fieldSource ?? 'api') !== 'pdf');
      crosscheckSummary = cross.summary;
      crosscheckWarnings = cross.warnings;
    } else if (parseDiagnostics.length > 0) {
      errors = [...errors, ...parseDiagnostics];
    }
    const validation = summarizePreviewValidation(previewRows as Record<string, unknown>[]);

    return {
      success: summary.success,
      runId: summary.runId,
      errors,
      rawOfferCount: summary.rawOfferCount,
      normalizedCount: summary.normalizedCount,
      dedupedCount: summary.dedupedCount,
      skippedCount: summary.skipped,
      skipReasons: summary.skipReasons,
      skippedOffers: summary.skippedOffers ?? [],
      warningCount: summary.warningCount,
      warningGroups: summary.warningGroups,
      sourceMode,
      crosscheckSummary,
      crosscheckWarnings,
      byOfferType: summary.byOfferType,
      rows: previewRows,
      validationErrors: validation.errors,
      validationWarnings: validation.warnings,
    };
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    return {
      success: false,
      runId: '',
      errors: [`Lexus preview failed: ${message}`],
      rawOfferCount: 0,
      normalizedCount: 0,
      dedupedCount: 0,
      skippedCount: 0,
      skipReasons: {},
      skippedOffers: [],
      warningCount: 0,
      warningGroups: [],
      sourceMode,
      byOfferType: { Lease: 0, Finance: 0, Other: 0 },
      rows: [],
    };
  }
}

/**
 * Write Lexus preview rows to the database (after user has edited the preview table).
 * Rows are the same shape as from previewLexusOffers; numeric strings are coerced.
 */
export async function pushLexusOffers(rows: LexusPreviewRowOnClient[]): Promise<RefreshLexusResult> {
  if (isDemoMode()) {
    return demoBlocked({
      success: false,
      inserted: 0,
      updated: 0,
      inactivated: 0,
      errors: [],
      runId: '',
    });
  }
  const userId = await ingestionAdminId();
  if (!userId) {
    return {
      success: false,
      inserted: 0,
      updated: 0,
      inactivated: 0,
      errors: ['Admin access required to push Lexus offers live.'],
      runId: '',
    };
  }

  if (!rows.length) {
    return {
      success: true,
      inserted: 0,
      updated: 0,
      inactivated: 0,
      errors: [],
      runId: '',
    };
  }

  try {
    const offerRows: OfferInput[] = rows.map(coercePreviewRowToOfferInput);
    const writeResult = await writeLexusOffers(offerRows, { updatedBy: userId });

    revalidatePath('/admin/offers');
    revalidatePath('/admin/offers/import');

    const byOfferType = { Lease: 0, Finance: 0, Other: 0 };
    for (const row of offerRows) {
      const ot = String(row.offerType ?? '');
      if (ot === 'Lease') byOfferType.Lease++;
      else if (ot === 'Finance') byOfferType.Finance++;
      else byOfferType.Other++;
    }

    return {
      success: !writeResult.error,
      inserted: writeResult.inserted,
      updated: writeResult.updated,
      inactivated: writeResult.inactivated,
      errors: writeResult.error ? [writeResult.error] : [],
      runId: '',
      dedupedCount: rows.length,
      skippedCount: 0,
      skipReasons: {},
      skippedOffers: [],
      warningCount: 0,
      warningGroups: [],
      byOfferType,
    };
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    return {
      success: false,
      inserted: 0,
      updated: 0,
      inactivated: 0,
      errors: [`Lexus push failed: ${message}`],
      runId: '',
    };
  }
}

// ---------------------------------------------------------------------------
// BMW
// ---------------------------------------------------------------------------

export type RefreshBmwResult = {
  success: boolean;
  inserted: number;
  updated: number;
  inactivated: number;
  errors: string[];
  runId: string;
  rawOfferCount?: number;
  normalizedCount?: number;
  dedupedCount?: number;
  skippedCount?: number;
  skipReasons?: Record<string, number>;
  skippedOffers?: Array<Record<string, unknown>>;
  byOfferType?: { Lease: number; Finance: number; Other: number };
};

/** Serializable row for BMW preview table (dates as strings, includes preview-only extras). */
export type BmwPreviewRow = Record<string, unknown>;

/** Result of BMW preview (parse + normalize, no DB write). */
export type PreviewBmwResult = {
  success: boolean;
  errors: string[];
  rawOfferCount: number;
  normalizedCount: number;
  skippedCount: number;
  skipReasons: Record<string, number>;
  skippedOffers: Array<Record<string, unknown>>;
  byOfferType: { Lease: number; Finance: number; Other: number };
  rows: BmwPreviewRow[];
  validationErrors?: string[];
  validationWarnings?: string[];
};

/**
 * Preview BMW offers: parse uploaded .xlsx, normalize, return rows for editable preview.
 * Accepts FormData with "file" (xlsx), "startDate", "endDate".
 */
export async function previewBmwOffers(formData: FormData): Promise<PreviewBmwResult> {
  if (isDemoMode()) {
    return demoBlocked({
      success: false,
      errors: [],
      rawOfferCount: 0,
      normalizedCount: 0,
      skippedCount: 0,
      skipReasons: {},
      skippedOffers: [],
      byOfferType: { Lease: 0, Finance: 0, Other: 0 },
      rows: [],
    });
  }
  const userId = await ingestionAdminId();
  if (!userId) {
    return {
      success: false,
      errors: ['Admin access required to preview BMW offers.'],
      rawOfferCount: 0,
      normalizedCount: 0,
      skippedCount: 0,
      skipReasons: {},
      skippedOffers: [],
      byOfferType: { Lease: 0, Finance: 0, Other: 0 },
      rows: [],
    };
  }

  const file = formData.get('file') as File | null;
  const startDate = formData.get('startDate') as string | null;
  const endDate = formData.get('endDate') as string | null;

  if (!file) {
    return {
      success: false,
      errors: ['No file provided'],
      rawOfferCount: 0,
      normalizedCount: 0,
      skippedCount: 0,
      skipReasons: {},
      skippedOffers: [],
      byOfferType: { Lease: 0, Finance: 0, Other: 0 },
      rows: [],
    };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      success: false,
      errors: [`File exceeds ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit`],
      rawOfferCount: 0,
      normalizedCount: 0,
      skippedCount: 0,
      skipReasons: {},
      skippedOffers: [],
      byOfferType: { Lease: 0, Finance: 0, Other: 0 },
      rows: [],
    };
  }

  if (!startDate || !endDate) {
    return {
      success: false,
      errors: ['Start date and end date are required'],
      rawOfferCount: 0,
      normalizedCount: 0,
      skippedCount: 0,
      skipReasons: {},
      skippedOffers: [],
      byOfferType: { Lease: 0, Finance: 0, Other: 0 },
      rows: [],
    };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = parseBmwExcel(buffer);

    const allRaw = [...parsed.leaseOffers, ...parsed.loanOffers];
    const normalized = normalizeBmwOffers(parsed, startDate, endDate);
    const validation = summarizePreviewValidation(normalized as unknown as Record<string, unknown>[]);

    const byOfferType = { Lease: 0, Finance: 0, Other: 0 };
    for (const row of normalized) {
      const ot = String(row.offerType ?? '');
      if (ot === 'Lease') byOfferType.Lease++;
      else if (ot === 'Finance') byOfferType.Finance++;
      else byOfferType.Other++;
    }

    return {
      success: parsed.errors.length === 0 || normalized.length > 0,
      errors: parsed.errors,
      rawOfferCount: allRaw.length,
      normalizedCount: normalized.length,
      skippedCount: parsed.skippedCount,
      skipReasons: parsed.skippedReasons,
      skippedOffers: parsed.skippedOffers ?? [],
      byOfferType,
      rows: normalized as unknown as BmwPreviewRow[],
      validationErrors: validation.errors,
      validationWarnings: validation.warnings,
    };
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    return {
      success: false,
      errors: [`BMW preview failed: ${message}`],
      rawOfferCount: 0,
      normalizedCount: 0,
      skippedCount: 0,
      skipReasons: {},
      skippedOffers: [],
      byOfferType: { Lease: 0, Finance: 0, Other: 0 },
      rows: [],
    };
  }
}

/**
 * Write BMW preview rows to the database (after user has edited the preview table).
 * Strips preview-only fields before DB write. Numeric strings are coerced.
 */
export async function pushBmwOffers(rows: BmwPreviewRow[]): Promise<RefreshBmwResult> {
  if (isDemoMode()) {
    return demoBlocked({
      success: false,
      inserted: 0,
      updated: 0,
      inactivated: 0,
      errors: [],
      runId: '',
    });
  }
  const userId = await ingestionAdminId();
  if (!userId) {
    return {
      success: false,
      inserted: 0,
      updated: 0,
      inactivated: 0,
      errors: ['Admin access required to push BMW offers live.'],
      runId: '',
    };
  }

  if (!rows.length) {
    return {
      success: true,
      inserted: 0,
      updated: 0,
      inactivated: 0,
      errors: [],
      runId: '',
    };
  }

  try {
    const offerRows: OfferInput[] = rows.map((row) =>
      coercePreviewRowToOfferInput(row as ToyotaPreviewRow)
    );

    const writeResult = await writeBmwOffers(offerRows, { updatedBy: userId });

    revalidatePath('/admin/offers');
    revalidatePath('/admin/offers/import');

    const byOfferType = { Lease: 0, Finance: 0, Other: 0 };
    for (const row of offerRows) {
      const ot = String(row.offerType ?? '');
      if (ot === 'Lease') byOfferType.Lease++;
      else if (ot === 'Finance') byOfferType.Finance++;
      else byOfferType.Other++;
    }

    return {
      success: !writeResult.error,
      inserted: writeResult.inserted,
      updated: writeResult.updated,
      inactivated: writeResult.inactivated,
      errors: writeResult.error ? [writeResult.error] : [],
      runId: '',
      dedupedCount: rows.length,
      byOfferType,
    };
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    return {
      success: false,
      inserted: 0,
      updated: 0,
      inactivated: 0,
      errors: [`BMW push failed: ${message}`],
      runId: '',
    };
  }
}
