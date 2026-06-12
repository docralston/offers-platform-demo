'use client';

import { useState, useCallback } from 'react';
import {
  importOffers,
  previewImportFile,
  generateImportTemplate,
  type ImportOffersResult,
  type PreviewResult,
} from '@/app/actions/offers';
import {
  refreshToyotaOffers,
  previewToyotaOffers,
  pushToyotaOffers,
  dispatchToyotaIngestionWorkflow,
  previewLexusOffers,
  pushLexusOffers,
  previewBmwOffers,
  pushBmwOffers,
  type RefreshToyotaResult,
  type PreviewToyotaResult,
  type ToyotaPreviewRow,
  type DispatchToyotaWorkflowResult,
  type PreviewLexusResult,
  type RefreshLexusResult,
  type LexusPreviewRowOnClient,
  type PreviewBmwResult,
  type RefreshBmwResult,
  type BmwPreviewRow,
} from '@/app/actions/ingestion';
import { OFFERS_TABLE_COLUMN_ORDER } from '@/lib/ingestion/constants';
import { Alert, Breadcrumbs, Button, FormGroup, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { formatConditionLabel } from '@/lib/domain/offer-type';
import { IMPORT_ACCEPT } from '@/lib/import/parse-spreadsheet';
import { applyCheckboxSelection } from '@/lib/utils/checkbox-selection';

const TEMPLATE_HEADERS = OFFERS_TABLE_COLUMN_ORDER;

const TEMPLATE_EXAMPLE: Record<string, unknown> = {
  status: 'INACTIVE',
  storeCode: 'TOY',
  stockNumber: 'ST12345',
  condition: 'NEW',
  year: 2025,
  make: '',
  model: 'Camry',
  trim: 'LE',
  msrp: '',
  offerType: 'Lease',
  leasePayment: 299,
  leaseTerm: 36,
  leaseMiles: 12000,
  downPayment: 0,
  dueAtSigning: 2500,
  acquisitionFee: 650,
  aprRate: '',
  aprTermMonths: '',
  discount: '',
  buyFor: '',
  customerCash: '',
  leaseCash: '',
  aprCash: '',
  bonusCash: '',
  rebateTotal: '',
  disclaimer: '',
  inventoryUrl: 'https://example.com/vehicle/1',
  imageUrl: 'https://example.com/images/camry.jpg',
  additionalNotes: 'Special lease promotion',
  startDate: '2025-01-01',
  endDate: '2025-01-31',
};

const TEMPLATE_CSV =
  'data:text/csv;charset=utf-8,' +
  encodeURIComponent(
    [
      TEMPLATE_HEADERS.join(','),
      TEMPLATE_HEADERS.map((h) => {
        const v = TEMPLATE_EXAMPLE[h];
        return v === null || v === undefined ? '' : String(v);
      }).join(','),
    ].join('\n'),
  );

export default function ImportOffersPage() {
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [result, setResult] = useState<ImportOffersResult | null>(null);
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  // Store edits: Map<rowIndex, Map<column, value>>
  const [edits, setEdits] = useState<Map<number, Map<string, unknown>>>(new Map());
  const [toyotaLoading, setToyotaLoading] = useState(false);
  const [toyotaResult, setToyotaResult] = useState<RefreshToyotaResult | null>(null);
  const [toyotaPreview, setToyotaPreview] = useState<PreviewToyotaResult | null>(null);
  const [toyotaPreviewLoading, setToyotaPreviewLoading] = useState(false);
  const [toyotaEdits, setToyotaEdits] = useState<Map<number, Map<string, unknown>>>(new Map());
  const [toyotaDispatchResult, setToyotaDispatchResult] =
    useState<DispatchToyotaWorkflowResult | null>(null);
  const [lexusLoading, setLexusLoading] = useState(false);
  const [lexusPreviewLoading, setLexusPreviewLoading] = useState(false);
  const [lexusPreview, setLexusPreview] = useState<PreviewLexusResult | null>(null);
  const [lexusEdits, setLexusEdits] = useState<Map<number, Map<string, unknown>>>(new Map());
  const [selectedLexusRowIds, setSelectedLexusRowIds] = useState<string[]>([]);
  const [lastLexusSelectedIndex, setLastLexusSelectedIndex] = useState<number | null>(null);
  const [lexusResult, setLexusResult] = useState<RefreshLexusResult | null>(null);
  const [lexusSourceMode, setLexusSourceMode] = useState<'api_with_optional_pdf' | 'pdf_only'>('api_with_optional_pdf');
  const [lexusPdfFile, setLexusPdfFile] = useState<File | null>(null);
  const [bmwFile, setBmwFile] = useState<File | null>(null);
  const [bmwStartDate, setBmwStartDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [bmwEndDate, setBmwEndDate] = useState(() => {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  });
  const [bmwPreviewLoading, setBmwPreviewLoading] = useState(false);
  const [bmwPreview, setBmwPreview] = useState<PreviewBmwResult | null>(null);
  const [bmwEdits, setBmwEdits] = useState<Map<number, Map<string, unknown>>>(new Map());
  const [bmwLoading, setBmwLoading] = useState(false);
  const [bmwResult, setBmwResult] = useState<RefreshBmwResult | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) {
      setFile(null);
      setPreviewData(null);
      setPreviewError(null);
      setShowPreview(false);
      return;
    }

    setFile(selectedFile);
    setPreviewLoading(true);
    setPreviewData(null);
    setPreviewError(null);
    setShowPreview(false);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      const preview = await previewImportFile(formData);
      setPreviewData(preview);
      setShowPreview(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setPreviewError(message);
      setShowPreview(false);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleDownloadTemplate() {
    try {
      const base64 = await generateImportTemplate();
      // Convert base64 to blob
      const byteCharacters = atob(base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'offers-import-template.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading template:', error);
      alert('Failed to download template. Please try again.');
    }
  }

  async function handleImport() {
    if (!file || !previewData) return;

    setLoading(true);
    setResult(null);
    
    // Apply edits to file before importing
    const formData = new FormData();
    if (edits.size > 0) {
      // Create modified file with edits applied
      const modifiedFile = await applyEditsToFile(file, previewData, edits);
      formData.append('file', modifiedFile);
    } else {
      formData.append('file', file);
    }
    
    const res = await importOffers(formData);
    setResult(res);
    setLoading(false);
    setShowPreview(false);
    if (res.insertedRows > 0) {
      setFile(null);
      setPreviewData(null);
      setEdits(new Map());
    }
  }

  function handleCellEdit(rowIndex: number, column: string, value: unknown) {
    setEdits(prev => {
      const newEdits = new Map(prev);
      if (!newEdits.has(rowIndex)) {
        newEdits.set(rowIndex, new Map());
      }
      const rowEdits = newEdits.get(rowIndex)!;
      rowEdits.set(column, value);
      return newEdits;
    });
    
    // Update preview data immediately for UI feedback
    if (previewData) {
      setPreviewData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: prev.rows.map(row => {
            if (row.rowIndex === rowIndex) {
              return {
                ...row,
                rawData: {
                  ...row.rawData,
                  [column]: value,
                },
              };
            }
            return row;
          }),
        };
      });
    }
  }

  async function applyEditsToFile(
    originalFile: File,
    previewData: PreviewResult,
    edits: Map<number, Map<string, unknown>>
  ): Promise<File> {
    // Import XLSX library dynamically
    const XLSX = await import('xlsx');
    
    // Read the original file
    const arrayBuffer = await originalFile.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: 'array', raw: false, cellDates: false });
    const firstSheet = wb.SheetNames[0];
    if (!firstSheet) throw new Error('No sheet found');
    
    const sheet = wb.Sheets[firstSheet];
    
    // Convert to array of arrays to apply edits (header: 1 => AOA)
    const json = XLSX.utils.sheet_to_json<unknown[]>(sheet, { defval: '', raw: false, header: 1 });
    
    // Apply edits (json[0] is headers, json[1+] are data rows)
    // rowIndex in previewData is 1-based + header row, so rowIndex 2 = json[1]
    edits.forEach((rowEdits, rowIndex) => {
      const jsonRowIndex = rowIndex - 2; // Convert to 0-based array index
      if (jsonRowIndex >= 0 && jsonRowIndex < json.length) {
        const headers = (json[0] ?? []) as string[];
        rowEdits.forEach((value, column) => {
          const colIndex = headers.indexOf(column);
          if (colIndex >= 0 && json[jsonRowIndex]) {
            const row = json[jsonRowIndex] as unknown[];
            // Ensure row has enough columns
            while (row.length <= colIndex) {
              row.push('');
            }
            row[colIndex] = value;
          }
        });
      }
    });
    
    // Convert back to worksheet
    const newSheet = XLSX.utils.aoa_to_sheet(json);
    wb.Sheets[firstSheet] = newSheet;
    
    // Determine file type
    const isCSV = originalFile.name.toLowerCase().endsWith('.csv');
    const bookType = isCSV ? 'csv' : 'xlsx';
    
    // Convert to array buffer and create new File
    const newArrayBuffer = XLSX.write(wb, { type: 'array', bookType });
    const mimeType = isCSV ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    return new File([newArrayBuffer], originalFile.name, { type: mimeType });
  }

  function handleCancel() {
    setFile(null);
    setPreviewData(null);
    setPreviewError(null);
    setShowPreview(false);
    setResult(null);
    // Reset file input
    const fileInput = document.getElementById('file') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  }

  const TOYOTA_PREVIEW_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes (scraper opens each lease offer-detail in a new tab)

  async function handlePreviewToyota() {
    setToyotaPreviewLoading(true);
    setToyotaPreview(null);
    setToyotaEdits(new Map());
    setToyotaResult(null);
    setToyotaDispatchResult(null);
    const timeoutPromise = new Promise<PreviewToyotaResult>((_, reject) => {
      setTimeout(
        () => reject(new Error('Preview timed out. The scraper may still be running on the server. Try again or run the scraper from the CLI (e.g. npx tsx scripts/run-toyota-ingestion.ts).')),
        TOYOTA_PREVIEW_TIMEOUT_MS
      );
    });
    try {
      const preview = await Promise.race([previewToyotaOffers(), timeoutPromise]);
      setToyotaPreview(preview);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setToyotaPreview({
        success: false,
        runId: '',
        errors: [message],
        rawOfferCount: 0,
        normalizedCount: 0,
        dedupedCount: 0,
        skippedCount: 0,
        skipReasons: {},
        skippedOffers: [],
        byOfferType: { Lease: 0, Finance: 0, Other: 0 },
        rows: [],
      });
    } finally {
      setToyotaPreviewLoading(false);
    }
  }

  async function handlePreviewLexus() {
    setLexusPreviewLoading(true);
    setLexusPreview(null);
    setLexusEdits(new Map());
    setSelectedLexusRowIds([]);
    setLastLexusSelectedIndex(null);
    setLexusResult(null);

    try {
      const formData = new FormData();
      formData.append('sourceMode', lexusSourceMode);
      if (lexusPdfFile) formData.append('pdfFile', lexusPdfFile);
      const preview = await previewLexusOffers(formData);
      setLexusPreview(preview);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLexusPreview({
        success: false,
        runId: '',
        errors: [message],
        rawOfferCount: 0,
        normalizedCount: 0,
        dedupedCount: 0,
        skippedCount: 0,
        skipReasons: {},
        skippedOffers: [],
        warningCount: 0,
        warningGroups: [],
        sourceMode: lexusSourceMode,
        byOfferType: { Lease: 0, Finance: 0, Other: 0 },
        rows: [],
      });
    } finally {
      setLexusPreviewLoading(false);
    }
  }

  function handleToyotaCellEdit(rowIndex: number, column: string, value: unknown) {
    setToyotaEdits(prev => {
      const next = new Map(prev);
      if (!next.has(rowIndex)) next.set(rowIndex, new Map());
      const rowEdits = next.get(rowIndex)!;
      rowEdits.set(column, value);
      return next;
    });
    setToyotaPreview(prev => {
      if (!prev?.rows?.length) return prev;
      const row = prev.rows[rowIndex];
      if (!row) return prev;
      return {
        ...prev,
        rows: prev.rows.map((r, i) =>
          i === rowIndex ? { ...r, [column]: value } : r
        ),
      };
    });
  }

  function handleLexusCellEdit(rowIndex: number, column: string, value: unknown) {
    setLexusEdits((prev) => {
      const next = new Map(prev);
      if (!next.has(rowIndex)) next.set(rowIndex, new Map());
      const rowEdits = next.get(rowIndex)!;
      rowEdits.set(column, value);
      return next;
    });
    setLexusPreview((prev) => {
      if (!prev?.rows?.length) return prev;
      const row = prev.rows[rowIndex];
      if (!row) return prev;
      const nextRows = prev.rows.map((r, i) =>
        i === rowIndex ? { ...r, [column]: value } : r
      );
      return { ...prev, rows: nextRows };
    });
  }

  async function handlePushToyotaLive() {
    if (!toyotaPreview?.rows?.length) return;
    setToyotaLoading(true);
    setToyotaResult(null);
    try {
      const mergedRows: ToyotaPreviewRow[] = toyotaPreview.rows.map((row, i) => {
        const rowEdits = toyotaEdits.get(i);
        if (!rowEdits?.size) return { ...row };
        return { ...row, ...Object.fromEntries(rowEdits) };
      });
      const res = await pushToyotaOffers(mergedRows);
      setToyotaResult(res);
      if (res.success && (res.inserted > 0 || res.updated > 0)) {
        setToyotaPreview(null);
        setToyotaEdits(new Map());
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'An unexpected response was received from the server.';
      setToyotaResult({
        success: false,
        inserted: 0,
        updated: 0,
        inactivated: 0,
        errors: [message],
        runId: '',
      });
    } finally {
      setToyotaLoading(false);
    }
  }

  async function handlePushLexusLive() {
    if (!lexusPreview?.rows?.length) return;
    setLexusLoading(true);
    setLexusResult(null);
    try {
      const selectedRowSet = new Set(selectedLexusRowIds);
      const mergedRows: LexusPreviewRowOnClient[] = [];
      lexusPreview.rows.forEach((row, originalIndex) => {
        if (selectedRowSet.has(String(originalIndex))) return;
        const rowEdits = lexusEdits.get(originalIndex);
        if (!rowEdits?.size) {
          mergedRows.push({ ...row });
          return;
        }
        mergedRows.push({ ...row, ...Object.fromEntries(rowEdits) });
      });
      if (mergedRows.length === 0) {
        setLexusResult({
          success: false,
          inserted: 0,
          updated: 0,
          inactivated: 0,
          errors: ['All Lexus preview rows are removed. Keep at least one row to push live.'],
          runId: '',
        });
        return;
      }
      const res = await pushLexusOffers(mergedRows);
      setLexusResult(res);
      if (res.success && (res.inserted > 0 || res.updated > 0)) {
        setLexusPreview(null);
        setLexusEdits(new Map());
        setSelectedLexusRowIds([]);
        setLastLexusSelectedIndex(null);
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'An unexpected response was received from the server.';
      setLexusResult({
        success: false,
        inserted: 0,
        updated: 0,
        inactivated: 0,
        errors: [message],
        runId: '',
      });
    } finally {
      setLexusLoading(false);
    }
  }

  function handleToggleSelectLexusPreviewRow(
    rowId: string,
    rowIndex: number,
    event: React.MouseEvent<HTMLInputElement>
  ) {
    const displayedRowIds = (lexusPreview?.rows ?? []).map((_, i) => String(i));
    setSelectedLexusRowIds((prev) => {
      const result = applyCheckboxSelection({
        selectedIds: new Set(prev),
        displayedRowIds,
        clickedId: rowId,
        clickedIndex: rowIndex,
        lastSelectedIndex: lastLexusSelectedIndex,
        shiftKey: event.shiftKey,
      });
      setLastLexusSelectedIndex(result.nextLastSelectedIndex);
      return Array.from(result.nextSelectedIds);
    });
  }

  function handleSelectAllLexusPreviewRows() {
    setSelectedLexusRowIds((lexusPreview?.rows ?? []).map((_, i) => String(i)));
  }

  function handleClearLexusPreviewSelection() {
    setSelectedLexusRowIds([]);
  }

  function handleRemoveSelectedLexusRows() {
    if (!lexusPreview || selectedLexusRowIds.length === 0) return;
    const selectedSet = new Set(selectedLexusRowIds);
    const nextRows = lexusPreview.rows.filter((_, i) => !selectedSet.has(String(i)));
    setLexusPreview({
      ...lexusPreview,
      dedupedCount: nextRows.length,
      rows: nextRows,
    });
    setLexusEdits(new Map());
    setSelectedLexusRowIds([]);
    setLastLexusSelectedIndex(null);
  }

  async function handlePreviewBmw() {
    if (!bmwFile) return;
    setBmwPreviewLoading(true);
    setBmwPreview(null);
    setBmwEdits(new Map());
    setBmwResult(null);

    try {
      const formData = new FormData();
      formData.append('file', bmwFile);
      formData.append('startDate', bmwStartDate);
      formData.append('endDate', bmwEndDate);
      const preview = await previewBmwOffers(formData);
      setBmwPreview(preview);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setBmwPreview({
        success: false,
        errors: [message],
        rawOfferCount: 0,
        normalizedCount: 0,
        skippedCount: 0,
        skipReasons: {},
        skippedOffers: [],
        byOfferType: { Lease: 0, Finance: 0, Other: 0 },
        rows: [],
      });
    } finally {
      setBmwPreviewLoading(false);
    }
  }

  function handleBmwCellEdit(rowIndex: number, column: string, value: unknown) {
    setBmwEdits((prev) => {
      const next = new Map(prev);
      if (!next.has(rowIndex)) next.set(rowIndex, new Map());
      const rowEdits = next.get(rowIndex)!;
      rowEdits.set(column, value);
      return next;
    });
    setBmwPreview((prev) => {
      if (!prev?.rows?.length) return prev;
      const row = prev.rows[rowIndex];
      if (!row) return prev;
      const nextRows = prev.rows.map((r, i) =>
        i === rowIndex ? { ...r, [column]: value } : r
      );
      return { ...prev, rows: nextRows };
    });
  }

  async function handlePushBmwLive() {
    if (!bmwPreview?.rows?.length) return;
    setBmwLoading(true);
    setBmwResult(null);
    try {
      const mergedRows: BmwPreviewRow[] = bmwPreview.rows.map((row, i) => {
        const rowEdits = bmwEdits.get(i);
        if (!rowEdits?.size) return { ...row };
        return { ...row, ...Object.fromEntries(rowEdits) };
      });
      const res = await pushBmwOffers(mergedRows);
      setBmwResult(res);
      if (res.success && (res.inserted > 0 || res.updated > 0)) {
        setBmwPreview(null);
        setBmwEdits(new Map());
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'An unexpected response was received from the server.';
      setBmwResult({
        success: false,
        inserted: 0,
        updated: 0,
        inactivated: 0,
        errors: [message],
        runId: '',
      });
    } finally {
      setBmwLoading(false);
    }
  }

  async function handleRefreshToyota() {
    setToyotaLoading(true);
    setToyotaResult(null);
    setToyotaPreview(null);
    setToyotaDispatchResult(null);

    try {
      // Try GitHub Actions dispatch first (if configured), otherwise run Playwright directly
      const dispatchRes = await dispatchToyotaIngestionWorkflow();
      if (dispatchRes.success) {
        setToyotaDispatchResult(dispatchRes);
      } else if (
        dispatchRes.errors.some((e) => e.includes('not configured') || e.includes('GITHUB'))
      ) {
        // GitHub not configured, fall back to direct Playwright
        const res = await refreshToyotaOffers();
        setToyotaResult(res);
      } else {
        // GitHub dispatch failed for other reasons
        setToyotaDispatchResult(dispatchRes);
      }
    } catch (err) {
      // Fallback to direct Playwright on any error
      try {
        const res = await refreshToyotaOffers();
        setToyotaResult(res);
      } catch (fallbackErr) {
        setToyotaResult({
          success: false,
          inserted: 0,
          updated: 0,
          inactivated: 0,
          errors: [fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)],
          runId: '',
        });
      }
    } finally {
      setToyotaLoading(false);
    }
  }

  const validRows = previewData?.rows.filter(r => r.cellErrors.length === 0 && r.rowErrors.length === 0).length || 0;
  const errorRows = previewData ? previewData.rows.length - validRows : 0;

  return (
    <div className="space-y-6">
      <header className="border-b border-neutral-200 pb-4 dark:border-neutral-700">
        <Breadcrumbs
          items={[
            { label: 'Offers', href: '/admin/offers' },
            { label: 'Import' },
          ]}
        />
        <h1 className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
          Import offers
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Import offers from Toyota, Lexus, BMW, or upload a CSV/XLSX file.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <section className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-4 dark:border-neutral-700 dark:bg-neutral-900/40 sm:px-6">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Toyota offers</h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Preview, then upsert Toyota offers pulled from{' '}
            <a
              href="https://www.buyatoyota.com/centralatlantic/offers/?limit=all"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-accent-600 hover:text-accent-700 dark:text-accent-400"
            >
              CAT offers
            </a>
            . The scraper normalizes lease, finance, and cash rows into a single offer format, applies soft-block
            validation, and shows you exactly what would change before anything is written to the database.
          </p>
          <div className="mt-3">
            <Button
              type="button"
              onClick={handlePreviewToyota}
              disabled={toyotaPreviewLoading || toyotaLoading}
            >
              {toyotaPreviewLoading ? 'Loading preview…' : 'Preview Toyota offers'}
            </Button>
          </div>
        </section>

        <section className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-4 dark:border-neutral-700 dark:bg-neutral-900/40 sm:px-6">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Lexus offers</h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Preview, then upsert Lexus New and CPO offers fetched from the{' '}
            <a
              href="https://www.lexus.com/dealers/api/v1/offers?zip=18901"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-accent-600 hover:text-accent-700 dark:text-accent-400"
            >
              JSON API
            </a>
            {' '}for the Philadelphia market (ZIP 18901). The importer maps OEM fields into the shared offer schema for
            both Lexus stores (DT and WG), so you can review all rows in one place before committing them.
          </p>
          <div className="mt-4 rounded-md border border-neutral-200 bg-white/70 p-3 dark:border-neutral-700 dark:bg-neutral-900/30">
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                    Source mode
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-4 text-sm">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="lexus-source-mode"
                        checked={lexusSourceMode === 'api_with_optional_pdf'}
                        onChange={() => setLexusSourceMode('api_with_optional_pdf')}
                      />
                      API + optional PDF crosscheck
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="radio"
                        name="lexus-source-mode"
                        checked={lexusSourceMode === 'pdf_only'}
                        onChange={() => setLexusSourceMode('pdf_only')}
                      />
                      PDF only
                    </label>
                  </div>
                </div>
                <FormGroup label="Lease examples PDF (optional)" htmlFor="lexus-pdf-file" className="mb-0">
                  <input
                    id="lexus-pdf-file"
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(e) => setLexusPdfFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-neutral-600 file:mr-4 file:rounded-md file:border-0 file:bg-accent-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-accent-700 hover:file:bg-accent-100 dark:file:bg-accent-900/40 dark:file:text-accent-300 dark:hover:file:bg-accent-900/60"
                  />
                </FormGroup>
              </div>
              <Button
                type="button"
                onClick={handlePreviewLexus}
                disabled={lexusPreviewLoading || lexusLoading}
                className="md:self-end"
              >
                {lexusPreviewLoading ? 'Loading preview…' : 'Preview Lexus offers'}
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-4 dark:border-neutral-700 dark:bg-neutral-900/40 sm:px-6">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">BMW offers</h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Upload a BMW Excel file, preview normalized lease/loan rows, then upsert BMW offers into the standard schema.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <div className="flex flex-col gap-0.5">
              <label htmlFor="bmw-start" className="text-xs text-neutral-500 dark:text-neutral-400">
                Start
              </label>
              <Input
                id="bmw-start"
                type="date"
                value={bmwStartDate}
                onChange={(e) => setBmwStartDate(e.target.value)}
                className="w-32 text-xs"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <label htmlFor="bmw-end" className="text-xs text-neutral-500 dark:text-neutral-400">
                End
              </label>
              <Input
                id="bmw-end"
                type="date"
                value={bmwEndDate}
                onChange={(e) => setBmwEndDate(e.target.value)}
                className="w-32 text-xs"
              />
            </div>
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <FormGroup label="BMW Excel file" htmlFor="bmw-file" className="mb-0 sm:min-w-0 sm:flex-1">
              <input
                id="bmw-file"
                type="file"
                accept=".xlsx"
                onChange={(e) => {
                  setBmwFile(e.target.files?.[0] ?? null);
                  setBmwPreview(null);
                  setBmwResult(null);
                }}
                className="block w-full text-sm text-neutral-600 file:mr-4 file:rounded-md file:border-0 file:bg-accent-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-accent-700 hover:file:bg-accent-100 dark:file:bg-accent-900/40 dark:file:text-accent-300 dark:hover:file:bg-accent-900/60"
              />
            </FormGroup>
            <Button
              type="button"
              onClick={handlePreviewBmw}
              disabled={!bmwFile || bmwPreviewLoading || bmwLoading}
              className="shrink-0"
            >
              {bmwPreviewLoading ? 'Loading preview…' : 'Preview BMW offers'}
            </Button>
          </div>
        </section>
      </div>

      {(toyotaPreview || lexusPreview || bmwPreview || toyotaDispatchResult || toyotaResult || lexusResult || bmwResult) && (
        <section className="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-4 dark:border-neutral-700 dark:bg-neutral-900/40 sm:px-6">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Preview results</h2>
          <div className="mt-4 space-y-6">
            {toyotaPreview && (
              <ToyotaPreviewResult
                result={toyotaPreview}
                edits={toyotaEdits}
                onCellEdit={handleToyotaCellEdit}
                onPushLive={handlePushToyotaLive}
                pushLiveLoading={toyotaLoading}
              />
            )}
            {toyotaDispatchResult && <ToyotaDispatchResult result={toyotaDispatchResult} />}
            {toyotaResult && <ToyotaRefreshResult result={toyotaResult} />}
            {lexusPreview && (
              <LexusPreviewResult
                result={lexusPreview}
                edits={lexusEdits}
                selectedRowIds={selectedLexusRowIds}
                onCellEdit={handleLexusCellEdit}
                onToggleSelectRow={handleToggleSelectLexusPreviewRow}
                onSelectAllRows={handleSelectAllLexusPreviewRows}
                onClearSelection={handleClearLexusPreviewSelection}
                onRemoveSelectedRows={handleRemoveSelectedLexusRows}
                onPushLive={handlePushLexusLive}
                pushLiveLoading={lexusLoading}
              />
            )}
            {lexusResult && <LexusRefreshResult result={lexusResult} />}
            {bmwPreview && (
              <BmwPreviewResult
                result={bmwPreview}
                edits={bmwEdits}
                onCellEdit={handleBmwCellEdit}
                onPushLive={handlePushBmwLive}
                pushLiveLoading={bmwLoading}
              />
            )}
            {bmwResult && <BmwRefreshResult result={bmwResult} />}
          </div>
        </section>
      )}

      <section className="rounded-md border border-neutral-200 bg-surface-amber/70 px-4 py-4 dark:border-neutral-700 dark:bg-surface-amber-dark/60 sm:px-6">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Import from file</h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Upload an XLSX or CSV file to see a preview of what will be imported, then choose to import or cancel.
        </p>
        <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">Max 500 rows.</p>
        {!showPreview && (
          <form className="mt-4">
            <FormGroup label="File" htmlFor="file">
              <input
                id="file"
                name="file"
                type="file"
                accept={IMPORT_ACCEPT}
                onChange={handleFileChange}
                className="block w-full text-sm text-neutral-600 file:mr-4 file:rounded-md file:border-0 file:bg-accent-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-accent-700 hover:file:bg-accent-100 dark:file:bg-accent-900/40 dark:file:text-accent-300 dark:hover:file:bg-accent-900/60"
              />
            </FormGroup>
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              Accepted: .csv, .xlsx, .xls. First row = headers. Required: storeCode, model, year (optional for certified finance offers), startDate, endDate. Make required when condition is USED.{' '}
              <a href={TEMPLATE_CSV} download="offers-import-template.csv" className="font-medium text-accent-600 hover:text-accent-700 dark:text-accent-400">
                Download CSV template
              </a>
              {' or '}
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="font-medium text-accent-600 hover:text-accent-700 dark:text-accent-400"
              >
                Download XLSX template
              </button>
            </p>
            {previewLoading && (
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Loading preview...</p>
            )}
            {previewError && (
              <Alert tone="error" title="Preview failed" className="mt-3">
                {previewError}
              </Alert>
            )}
          </form>
        )}
        {showPreview && previewData && (
          <div className="mt-4 space-y-4">
            <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800/50">
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                <span className="font-medium">Importing from:</span> {file?.name ?? 'file'}
                {' · '}
                <button
                  type="button"
                  onClick={handleCancel}
                  className="font-medium text-accent-600 hover:text-accent-700 dark:text-accent-400"
                >
                  Choose different file
                </button>
              </p>
            </div>
            <div>
              <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100 mb-2">Preview</h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {validRows} row{validRows !== 1 ? 's' : ''} will import successfully
                {errorRows > 0 && `, ${errorRows} row${errorRows !== 1 ? 's' : ''} have errors`}
              </p>
              {previewData.skippedCount > 0 && (
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-500">
                  Skipped reasons:{' '}
                  {Object.entries(previewData.skipReasons)
                    .filter(([, count]) => count > 0)
                    .sort((a, b) => b[1] - a[1])
                    .map(([reason, count]) => `${reason} (${count})`)
                    .join(', ')}
                </p>
              )}
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                APR values in import files should be provided as percentages (e.g. 3.99 for 3.99% APR),
                not fractional rates (0.0399).
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button onClick={handleImport} disabled={loading || validRows === 0}>
                  {loading ? 'Importing…' : `Import ${validRows} Row${validRows !== 1 ? 's' : ''}`}
                </Button>
                <Button type="button" variant="secondary" onClick={handleCancel}>
                  Cancel
                </Button>
              </div>
            </div>
            <PreviewTable previewData={previewData} onCellEdit={handleCellEdit} edits={edits} />
          </div>
        )}
      </section>

      {result && (
        <ImportResult result={result} />
      )}
    </div>
  );
}

function ToyotaPreviewResult({
  result,
  edits,
  onCellEdit,
  onPushLive,
  pushLiveLoading,
}: {
  result: PreviewToyotaResult;
  edits: Map<number, Map<string, unknown>>;
  onCellEdit: (rowIndex: number, column: string, value: unknown) => void;
  onPushLive: () => void;
  pushLiveLoading: boolean;
}) {
  const ok = result.success && result.errors.length === 0;
  const rows = result.rows ?? [];
  const headers = rows.length > 0
    ? [...new Set([...OFFERS_TABLE_COLUMN_ORDER.filter(k => k in rows[0]), ...Object.keys(rows[0])])]
    : [];

  return (
    <div className="mt-4 space-y-4">
      <div className={`rounded-md border px-3 py-2 text-sm ${ok ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20' : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'}`}>
        <p className="font-medium">
          {ok ? 'Preview: what would be imported' : 'Preview had issues'}
        </p>
        <p className="mt-1 text-neutral-600 dark:text-neutral-400">
          {result.dedupedCount} offer{result.dedupedCount !== 1 ? 's' : ''} would be imported
          {result.byOfferType && (
            <> (Lease: {result.byOfferType.Lease}, Finance: {result.byOfferType.Finance}, Other: {result.byOfferType.Other})</>
          )}
          {result.skippedCount > 0 && <> · Skipped: {result.skippedCount}</>}
        </p>
        {renderSkipReasons(result.skipReasons)}
        {renderSkippedOffers(result.skippedOffers, 'toyota-skipped-offers')}
        {renderValidationFindings(result.validationErrors, result.validationWarnings)}
        {ok && rows.length > 0 && (
          <Button
            type="button"
            onClick={onPushLive}
            disabled={pushLiveLoading}
            className="mt-3"
          >
            {pushLiveLoading ? 'Pushing…' : 'Push live'}
          </Button>
        )}
        {result.errors.length > 0 && (
          <ul className="mt-2 list-inside list-disc text-amber-800 dark:text-amber-200">
            {result.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
      </div>
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-700">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-surface-slate/80 dark:bg-surface-slate-dark/80 w-10">#</TableHead>
                {headers.map((header) => (
                  <TableHead key={header} className="whitespace-nowrap">{header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  <TableCell className="sticky left-0 z-10 bg-surface-slate/60 dark:bg-surface-slate-dark/80 font-medium">
                    {rowIndex + 1}
                  </TableCell>
                  {headers.map((header) => {
                    const rowEdits = edits.get(rowIndex);
                    const editedValue = rowEdits?.get(header);
                    const cellValue = editedValue !== undefined ? editedValue : row[header];
                    return (
                      <TableCell key={header} className="whitespace-nowrap">
                        <EditableCell
                          value={cellValue}
                          formatDisplay={header === 'condition' ? (v) => formatConditionLabel(String(v ?? '')) : undefined}
                          onChange={(value) => onCellEdit(rowIndex, header, value)}
                        />
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function LexusPreviewResult({
  result,
  edits,
  selectedRowIds,
  onCellEdit,
  onToggleSelectRow,
  onSelectAllRows,
  onClearSelection,
  onRemoveSelectedRows,
  onPushLive,
  pushLiveLoading,
}: {
  result: PreviewLexusResult;
  edits: Map<number, Map<string, unknown>>;
  selectedRowIds: string[];
  onCellEdit: (rowIndex: number, column: string, value: unknown) => void;
  onToggleSelectRow: (
    rowId: string,
    rowIndex: number,
    event: React.MouseEvent<HTMLInputElement>
  ) => void;
  onSelectAllRows: () => void;
  onClearSelection: () => void;
  onRemoveSelectedRows: () => void;
  onPushLive: () => void;
  pushLiveLoading: boolean;
}) {
  const ok = result.success && result.errors.length === 0;
  const rows = result.rows ?? [];
  const headers =
    rows.length > 0
      ? [
          ...new Set([
            ...OFFERS_TABLE_COLUMN_ORDER.filter((k) => rows.some((r) => k in r || k === 'capCostReduction')),
            ...Object.keys(rows[0]),
          ]),
        ]
      : [];

  return (
    <div className="mt-4 space-y-4">
      <div
        className={`rounded-md border px-3 py-2 text-sm ${
          ok
            ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20'
            : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
        }`}
      >
        <p className="font-medium">
          {ok ? 'Preview: what would be imported' : 'Preview had issues'}
        </p>
        <p className="mt-1 text-neutral-600 dark:text-neutral-400">
          {result.dedupedCount} offer{result.dedupedCount !== 1 ? 's' : ''} would be imported
          {result.byOfferType && (
            <>
              {' '}
              (Lease: {result.byOfferType.Lease}, Finance: {result.byOfferType.Finance}, Other:{' '}
              {result.byOfferType.Other})
            </>
          )}
          {result.skippedCount > 0 && <> · Skipped: {result.skippedCount}</>}
          {result.warningCount > 0 && <> · Warnings: {result.warningCount}</>}
          {result.sourceMode === 'pdf_only' && <> · Source: PDF only</>}
        </p>
        {result.crosscheckSummary && (
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            Crosscheck matched: {result.crosscheckSummary.matchedCount}, conflicts: {result.crosscheckSummary.conflicts},
            enriched fields: {result.crosscheckSummary.enrichedFields}, unmatched API: {result.crosscheckSummary.unmatchedApiCount},
            unmatched PDF: {result.crosscheckSummary.unmatchedPdfCount}, unmatched DB: {result.crosscheckSummary.unmatchedDbCount}
          </p>
        )}
        {result.crosscheckSummary?.totalPdfRows != null &&
        result.crosscheckSummary?.comparablePdfRows != null ? (
          <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
            Comparable PDF rows: {result.crosscheckSummary.comparablePdfRows} / {result.crosscheckSummary.totalPdfRows}
          </p>
        ) : null}
        {result.crosscheckWarnings && result.crosscheckWarnings.length > 0 && (
          <details className="mt-2 rounded border border-amber-200 bg-amber-50/60 px-2 py-1 dark:border-amber-800 dark:bg-amber-900/20">
            <summary className="cursor-pointer text-xs font-medium text-amber-800 dark:text-amber-200">
              API/PDF crosscheck warnings ({result.crosscheckWarnings.length})
            </summary>
            <ul className="mt-2 list-inside list-disc text-xs text-amber-900 dark:text-amber-100">
              {result.crosscheckWarnings.map((w, i) => (
                <li key={`${w.code}-${i}`}>{w.message}</li>
              ))}
            </ul>
          </details>
        )}
        {result.crosscheckSummary?.parseDiagnostics.length ? (
          <ul className="mt-2 list-inside list-disc text-xs text-neutral-700 dark:text-neutral-300">
            {result.crosscheckSummary.parseDiagnostics.map((d, i) => (
              <li key={`diag-${i}`}>{d}</li>
            ))}
          </ul>
        ) : null}
        {result.warningCount > 0 && (
          <details className="mt-2 rounded border border-amber-200 bg-amber-50/60 px-2 py-1 dark:border-amber-800 dark:bg-amber-900/20">
            <summary className="cursor-pointer text-xs font-medium text-amber-800 dark:text-amber-200">
              Near-duplicate warning groups ({result.warningCount})
            </summary>
            <div className="mt-2 max-h-48 overflow-auto rounded border border-neutral-200 dark:border-neutral-700">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Model</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Offer IDs</TableHead>
                    <TableHead>Differing fields</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.warningGroups.map((g) => (
                    <TableRow key={g.key}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {[g.year, g.model, g.trim].filter(Boolean).join(' ')}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{g.offerType ?? ''}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {g.offerIds.length > 0 ? g.offerIds.join(', ') : 'n/a'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{g.differingFields.join(', ')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </details>
        )}
        {renderSkipReasons(result.skipReasons)}
        {renderSkippedOffers(result.skippedOffers, 'lexus-skipped-offers')}
        {renderValidationFindings(result.validationErrors, result.validationWarnings)}
        {rows.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onSelectAllRows}>
              Select all rows
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={onClearSelection}>
              Clear selection
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onRemoveSelectedRows}
              disabled={selectedRowIds.length === 0}
            >
              Remove selected rows ({selectedRowIds.length})
            </Button>
          </div>
        )}
        {ok && rows.length > 0 && (
          <Button
            type="button"
            onClick={onPushLive}
            disabled={pushLiveLoading}
            className="mt-3"
          >
            {pushLiveLoading ? 'Pushing…' : 'Push live'}
          </Button>
        )}
        {result.errors.length > 0 && (
          <ul className="mt-2 list-inside list-disc text-amber-800 dark:text-amber-200">
            {result.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
      </div>
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-700">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-20 bg-surface-slate/80 dark:bg-surface-slate-dark/80 w-10">
                  Sel
                </TableHead>
                <TableHead className="sticky left-0 z-10 bg-surface-slate/80 dark:bg-surface-slate-dark/80 w-10">
                  #
                </TableHead>
                {headers.map((header) => (
                  <TableHead key={header} className="whitespace-nowrap">
                    {header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  <TableCell className="sticky left-0 z-20 bg-surface-slate/60 dark:bg-surface-slate-dark/80">
                    <input
                      type="checkbox"
                      checked={selectedRowIds.includes(String(rowIndex))}
                      onClick={(event) => onToggleSelectRow(String(rowIndex), rowIndex, event)}
                      readOnly
                    />
                  </TableCell>
                  <TableCell className="sticky left-10 z-10 bg-surface-slate/60 dark:bg-surface-slate-dark/80 font-medium">
                    {rowIndex + 1}
                  </TableCell>
                  {headers.map((header) => {
                    const rowEdits = edits.get(rowIndex);
                    const editedValue = rowEdits?.get(header);
                    const cellValue = editedValue !== undefined ? editedValue : row[header];
                    return (
                      <TableCell key={header} className="whitespace-nowrap">
                        <EditableCell
                          value={cellValue}
                          formatDisplay={
                            header === 'condition'
                              ? (v) => formatConditionLabel(String(v ?? ''))
                              : undefined
                          }
                          onChange={(value) => onCellEdit(rowIndex, header, value)}
                        />
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function ToyotaDispatchResult({ result }: { result: DispatchToyotaWorkflowResult }) {
  const ok = result.success && result.errors.length === 0;
  return (
    <div className={`mt-4 rounded-md border px-3 py-2 text-sm ${ok ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'}`}>
      <p className="font-medium">
        {result.success ? 'GitHub Actions workflow triggered' : 'Failed to trigger workflow'}
      </p>
      {result.success && result.workflowRunUrl && (
        <p className="mt-1 text-neutral-600 dark:text-neutral-400">
          <a
            href={result.workflowRunUrl}
            target="_blank"
            rel="noreferrer"
            className="text-accent-600 hover:text-accent-700 dark:text-accent-400"
          >
            View workflow run →
          </a>
        </p>
      )}
      {result.errors.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-amber-800 dark:text-amber-200">
          {result.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ToyotaRefreshResult({ result }: { result: RefreshToyotaResult }) {
  const ok = result.success && result.errors.length === 0;
  return (
    <div className={`mt-4 rounded-md border px-3 py-2 text-sm ${ok ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'}`}>
      <p className="font-medium">
        {result.success ? `Run ${result.runId} completed.` : `Run had issues.`}
      </p>
      <p className="mt-1 text-neutral-600 dark:text-neutral-400">
        Inserted: {result.inserted}, Updated: {result.updated}, Inactivated: {result.inactivated}
        {result.dedupedCount != null && ` · Deduped rows: ${result.dedupedCount}`}
      </p>
      {result.byOfferType && (
        <p className="mt-0.5 text-neutral-500 dark:text-neutral-500">
          Lease: {result.byOfferType.Lease}, Finance: {result.byOfferType.Finance}, Other: {result.byOfferType.Other}
        </p>
      )}
      {result.errors.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-amber-800 dark:text-amber-200">
          {result.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LexusRefreshResult({ result }: { result: RefreshLexusResult }) {
  const ok = result.success && result.errors.length === 0;
  return (
    <div
      className={`mt-4 rounded-md border px-3 py-2 text-sm ${
        ok
          ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
          : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
      }`}
    >
      <p className="font-medium">
        {result.success ? `Run ${result.runId || 'completed.'}` : `Run had issues.`}
      </p>
      <p className="mt-1 text-neutral-600 dark:text-neutral-400">
        Inserted: {result.inserted}, Updated: {result.updated}, Inactivated: {result.inactivated}
        {result.dedupedCount != null && ` · Deduped rows: ${result.dedupedCount}`}
      </p>
      {result.byOfferType && (
        <p className="mt-0.5 text-neutral-500 dark:text-neutral-500">
          Lease: {result.byOfferType.Lease}, Finance: {result.byOfferType.Finance}, Other:{' '}
          {result.byOfferType.Other}
        </p>
      )}
      {result.errors.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-amber-800 dark:text-amber-200">
          {result.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BmwPreviewResult({
  result,
  edits,
  onCellEdit,
  onPushLive,
  pushLiveLoading,
}: {
  result: PreviewBmwResult;
  edits: Map<number, Map<string, unknown>>;
  onCellEdit: (rowIndex: number, column: string, value: unknown) => void;
  onPushLive: () => void;
  pushLiveLoading: boolean;
}) {
  const ok = result.success && result.errors.length === 0;
  const rows = result.rows ?? [];
  const headers = (() => {
    if (!rows.length) return [];

    // Collect all keys that appear across BMW rows (lease + finance)
    const allKeys = new Set<string>();
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        allKeys.add(key);
      }
    }

    // Known offer columns first, then any extras
    const orderedKnown = OFFERS_TABLE_COLUMN_ORDER.filter((k) =>
      allKeys.has(k as string)
    );
    const extras = Array.from(allKeys).filter(
      (k) =>
        !OFFERS_TABLE_COLUMN_ORDER.includes(
          k as (typeof OFFERS_TABLE_COLUMN_ORDER)[number]
        )
    );

    return [...orderedKnown, ...extras];
  })();

  return (
    <div className="mt-4 space-y-4">
      <div
        className={`rounded-md border px-3 py-2 text-sm ${
          ok
            ? 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20'
            : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
        }`}
      >
        <p className="font-medium">
          {ok ? 'Preview: what would be imported' : 'Preview had issues'}
        </p>
        <p className="mt-1 text-neutral-600 dark:text-neutral-400">
          {result.normalizedCount} offer{result.normalizedCount !== 1 ? 's' : ''} would be imported
          {result.byOfferType && (
            <>
              {' '}
              (Lease: {result.byOfferType.Lease}, Finance: {result.byOfferType.Finance})
            </>
          )}
          {result.skippedCount > 0 && <> · Skipped: {result.skippedCount}</>}
        </p>
        {renderSkipReasons(result.skipReasons)}
        {renderSkippedOffers(result.skippedOffers, 'bmw-skipped-offers')}
        {renderValidationFindings(result.validationErrors, result.validationWarnings)}
        {ok && rows.length > 0 && (
          <Button
            type="button"
            onClick={onPushLive}
            disabled={pushLiveLoading}
            className="mt-3"
          >
            {pushLiveLoading ? 'Pushing…' : 'Push live'}
          </Button>
        )}
        {result.errors.length > 0 && (
          <ul className="mt-2 list-inside list-disc text-amber-800 dark:text-amber-200">
            {result.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
      </div>
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-700">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-surface-slate/80 dark:bg-surface-slate-dark/80 w-10">
                  #
                </TableHead>
                {headers.map((header) => (
                  <TableHead key={header} className="whitespace-nowrap">
                    {header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  <TableCell className="sticky left-0 z-10 bg-surface-slate/60 dark:bg-surface-slate-dark/80 font-medium">
                    {rowIndex + 1}
                  </TableCell>
                  {headers.map((header) => {
                    const rowEdits = edits.get(rowIndex);
                    const editedValue = rowEdits?.get(header);
                    const cellValue = editedValue !== undefined ? editedValue : row[header];
                    return (
                      <TableCell key={header} className="whitespace-nowrap">
                        <EditableCell
                          value={cellValue}
                          formatDisplay={
                            header === 'condition'
                              ? (v) => formatConditionLabel(String(v ?? ''))
                              : undefined
                          }
                          onChange={(value) => onCellEdit(rowIndex, header, value)}
                        />
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function BmwRefreshResult({ result }: { result: RefreshBmwResult }) {
  const ok = result.success && result.errors.length === 0;
  return (
    <div
      className={`mt-4 rounded-md border px-3 py-2 text-sm ${
        ok
          ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
          : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20'
      }`}
    >
      <p className="font-medium">
        {result.success ? 'BMW import completed.' : 'Import had issues.'}
      </p>
      <p className="mt-1 text-neutral-600 dark:text-neutral-400">
        Inserted: {result.inserted}, Updated: {result.updated}, Inactivated: {result.inactivated}
        {result.dedupedCount != null && ` · Total rows: ${result.dedupedCount}`}
      </p>
      {result.byOfferType && (
        <p className="mt-0.5 text-neutral-500 dark:text-neutral-500">
          Lease: {result.byOfferType.Lease}, Finance: {result.byOfferType.Finance}
        </p>
      )}
      {result.errors.length > 0 && (
        <ul className="mt-2 list-inside list-disc text-amber-800 dark:text-amber-200">
          {result.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function renderSkipReasons(skipReasons: Record<string, number> | undefined) {
  if (!skipReasons) return null;
  const entries = Object.entries(skipReasons)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  return (
    <p className="mt-0.5 text-neutral-500 dark:text-neutral-500">
      Skipped reasons:{' '}
      {entries.map(([reason, count]) => `${reason} (${count})`).join(', ')}
    </p>
  );
}

function renderValidationFindings(
  validationErrors: string[] | undefined,
  validationWarnings: string[] | undefined
) {
  const errors = validationErrors ?? [];
  const warnings = validationWarnings ?? [];
  if (errors.length === 0 && warnings.length === 0) return null;
  return (
    <details className="mt-2 rounded border border-amber-200 bg-amber-50/60 px-2 py-1 dark:border-amber-800 dark:bg-amber-900/20">
      <summary className="cursor-pointer text-xs font-medium text-amber-800 dark:text-amber-200">
        Validation findings (errors: {errors.length}, warnings: {warnings.length})
      </summary>
      {errors.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-amber-900 dark:text-amber-100">Errors</p>
          <ul className="mt-1 list-inside list-disc text-xs text-amber-900 dark:text-amber-100">
            {errors.map((item, i) => (
              <li key={`val-err-${i}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-amber-900 dark:text-amber-100">Warnings</p>
          <ul className="mt-1 list-inside list-disc text-xs text-amber-900 dark:text-amber-100">
            {warnings.map((item, i) => (
              <li key={`val-warn-${i}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}

function renderSkippedOffers(
  skippedOffers: Array<Record<string, unknown>> | undefined,
  exportFileBaseName: string
) {
  if (!skippedOffers || skippedOffers.length === 0) return null;
  const exportSkippedOffers = () => {
    if (!skippedOffers.length) return;
    const preferredHeaders = [
      'reason',
      'model',
      'year',
      'programType',
      'offerType',
      'seriesShortName',
      'trimName',
      'sheet',
      'columnIndex',
      'status',
      'apr',
      'aprTermMonths',
      'monthlyPayment',
      'termMonths',
      'amount',
      'term',
    ];
    const extraHeaders = Array.from(
      new Set(
        skippedOffers.flatMap((row) => Object.keys(row))
      )
    ).filter((h) => !preferredHeaders.includes(h));
    const headers = [...preferredHeaders, ...extraHeaders];
    const escapeCsv = (value: unknown) => {
      const s = value == null ? '' : String(value);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [
      headers.join(','),
      ...skippedOffers.map((row) => headers.map((h) => escapeCsv(row[h])).join(',')),
    ];
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${exportFileBaseName}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <details className="mt-2 rounded border border-neutral-200 bg-white/60 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900/40">
      <summary className="cursor-pointer text-xs font-medium text-neutral-600 dark:text-neutral-300">
        Skipped offers details ({skippedOffers.length})
      </summary>
      <div className="mt-2">
        <Button type="button" variant="secondary" size="sm" onClick={exportSkippedOffers}>
          Export skipped rows (.csv)
        </Button>
      </div>
      <div className="mt-2 max-h-56 overflow-auto rounded border border-neutral-200 dark:border-neutral-700">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">#</TableHead>
              {['reason', 'model', 'year', 'programType', 'offerType', 'seriesShortName', 'trimName', 'sheet', 'columnIndex', 'status', 'apr', 'aprTermMonths', 'monthlyPayment', 'termMonths', 'amount', 'term'].map((header) => (
                <TableHead key={header} className="whitespace-nowrap">{header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {skippedOffers.map((row, index) => (
              <TableRow key={index}>
                <TableCell>{index + 1}</TableCell>
                {['reason', 'model', 'year', 'programType', 'offerType', 'seriesShortName', 'trimName', 'sheet', 'columnIndex', 'status', 'apr', 'aprTermMonths', 'monthlyPayment', 'termMonths', 'amount', 'term'].map((header) => (
                  <TableCell key={header} className="whitespace-nowrap text-xs">
                    {row[header] == null ? '' : String(row[header])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </details>
  );
}

function PreviewTable({
  previewData,
  onCellEdit,
  edits,
}: {
  previewData: PreviewResult;
  onCellEdit: (rowIndex: number, column: string, value: unknown) => void;
  edits: Map<number, Map<string, unknown>>;
}) {
  if (previewData.rows.length === 0) {
    return (
      <Alert tone="warning" title="No data found">
        The file appears to be empty or could not be parsed.
      </Alert>
    );
  }

  // Create error map for quick lookup: rowIndex -> column -> error message
  const errorMap = new Map<number, Map<string, string>>();
  for (const row of previewData.rows) {
    const rowErrors = new Map<string, string>();
    for (const cellError of row.cellErrors) {
      rowErrors.set(cellError.column, cellError.message);
    }
    if (rowErrors.size > 0) {
      errorMap.set(row.rowIndex, rowErrors);
    }
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 z-10 bg-surface-blue dark:bg-surface-blue-dark">Row</TableHead>
            {previewData.headers.map((header) => (
              <TableHead key={header}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {previewData.rows.map((row) => {
            const rowErrors = errorMap.get(row.rowIndex);
            const rowEdits = edits.get(row.rowIndex);
            return (
              <TableRow key={row.rowIndex}>
                <TableCell className="sticky left-0 z-10 bg-surface-slate/60 dark:bg-surface-slate-dark/80 font-medium">
                  {row.rowIndex}
                </TableCell>
                {previewData.headers.map((header) => {
                  // Use edited value if available, otherwise use raw data
                  const editedValue = rowEdits?.get(header);
                  const cellValue = editedValue !== undefined ? editedValue : row.rawData[header];
                  const error = rowErrors?.get(header);
                  const isEmpty = cellValue === null || cellValue === undefined || cellValue === '';

                  return (
                    <TableCell
                      key={header}
                      className={error ? 'border-2 border-red-500 bg-red-50/50 dark:bg-red-900/20' : ''}
                    >
                      <EditableCell
                        value={cellValue}
                        formatDisplay={header === 'condition' ? (v) => formatConditionLabel(String(v ?? '')) : undefined}
                        error={error}
                        onChange={(value) => onCellEdit(row.rowIndex, header, value)}
                      />
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function EditableCell({
  value,
  error,
  formatDisplay,
  onChange,
}: {
  value: unknown;
  error?: string;
  /** When set, used to render the cell when not editing (e.g. condition → "New", "Used", "Certified") */
  formatDisplay?: (v: unknown) => string;
  onChange: (value: unknown) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value ?? ''));

  const isEmpty = value === null || value === undefined || value === '';

  const handleBlur = () => {
    setIsEditing(false);
    // Convert empty string to null for consistency
    const finalValue = editValue.trim() === '' ? null : editValue;
    onChange(finalValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    } else if (e.key === 'Escape') {
      setEditValue(String(value ?? ''));
      setIsEditing(false);
    }
  };

  const displayText = formatDisplay ? formatDisplay(value) : String(value ?? '');

  if (isEditing) {
    return (
      <Input
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="min-w-[100px] h-7 text-sm"
        autoFocus
        title={error}
      />
    );
  }

  return (
    <span
      onClick={() => {
        setIsEditing(true);
        setEditValue(String(value ?? ''));
      }}
      className="cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 px-1 py-0.5 rounded min-w-[100px] inline-block"
      title={error || 'Click to edit'}
    >
      {isEmpty ? (
        <span className="text-neutral-400 dark:text-neutral-500 italic">—</span>
      ) : (
        displayText
      )}
    </span>
  );
}

function ImportResult({ result }: { result: ImportOffersResult }) {
  const hasFailures = result.failed.length > 0 || result.parseErrors.length > 0;
  const inactiveWithIssues = result.inactiveCount > 0;

  return (
    <section className="space-y-4">
      {result.insertedRows > 0 && (
        <Alert tone="success" title={`Imported ${result.insertedRows} offer${result.insertedRows === 1 ? '' : 's'}`}>
          <div className="space-y-2">
            <p>
              {result.insertedRows} of {result.totalRows} row{result.totalRows !== 1 ? 's' : ''} imported successfully.
            </p>
            {inactiveWithIssues && (
              <div>
                <p className="font-medium">
                  {result.inactiveCount} offer{result.inactiveCount === 1 ? '' : 's'} marked inactive due to validation issues
                </p>
              </div>
            )}
            {result.issueSummary.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Top issues:</p>
                <ul className="mt-1 list-inside list-disc text-xs text-neutral-600 dark:text-neutral-400">
                  {result.issueSummary.slice(0, 5).map((item) => (
                    <li key={item.code}>
                      {item.code}: {item.count} occurrence{item.count !== 1 ? 's' : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Alert>
      )}

      {inactiveWithIssues && (
        <Alert tone="warning" title="Some offers were set inactive">
          <p className="text-sm">
            {result.inactiveCount} offer{result.inactiveCount === 1 ? '' : 's'} {result.inactiveCount === 1 ? 'has' : 'have'} validation issues and {result.inactiveCount === 1 ? 'was' : 'were'} marked as INACTIVE.
          </p>
        </Alert>
      )}

      {hasFailures && (
        <Alert tone="error" title="Some rows had parse errors">
          <div className="space-y-3 text-sm">
            {result.parseErrors.length > 0 && (
              <div>
                <p className="font-medium text-neutral-900 dark:text-neutral-100">Parse errors (missing or invalid required fields):</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-neutral-600 dark:text-neutral-400">
                  {result.parseErrors.map((e, i) => (
                    <li key={`p-${i}`}>
                      Row {e.rowIndex}: {e.errors.map((x) => `${x.field}: ${x.message}`).join('; ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.failed.length > 0 && (
              <div>
                <p className="font-medium text-neutral-900 dark:text-neutral-100">Failed to create (database errors):</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-neutral-600 dark:text-neutral-400">
                  {result.failed.map((f, i) => (
                    <li key={`f-${i}`}>
                      Row {f.rowIndex}: {f.errors.map((x) => `${x.field}: ${x.message}`).join('; ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Alert>
      )}

      {result.insertedRows === 0 && !hasFailures && (
        <Alert tone="warning" title="No offers imported">
          The file had no rows, or no rows could be mapped. Check that the first row contains headers and that required columns exist.
        </Alert>
      )}
    </section>
  );
}
