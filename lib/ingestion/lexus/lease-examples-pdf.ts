import pdfParse from 'pdf-parse/lib/pdf-parse.js';

export interface PdfLeaseExampleRow {
  sourceId: string;
  model: string;
  trim: string | null;
  year: number;
  dateFrom: string | null;
  dateTo: string | null;
  states: string;
  leaseTerm: number | null;
  leaseMiles: number | null;
  leasePayment: number | null;
  baseMsrp: number | null;
  msrpPlusDph: number | null;
  dueAtSigning: number | null;
  capCostReduction: number | null;
}

export interface PdfLeaseParseResult {
  rows: PdfLeaseExampleRow[];
  diagnostics: string[];
}

function inRange(value: number | null, min: number, max: number): number | null {
  if (value == null) return null;
  return value >= min && value <= max ? value : null;
}

function sanitizePdfRow(row: PdfLeaseExampleRow): PdfLeaseExampleRow {
  return {
    ...row,
    leaseTerm: inRange(row.leaseTerm, 24, 60),
    leaseMiles: inRange(row.leaseMiles, 5000, 20000),
    leasePayment: inRange(row.leasePayment, 100, 3000),
    dueAtSigning: inRange(row.dueAtSigning, 0, 20000),
    capCostReduction: inRange(row.capCostReduction, 0, 20000),
    baseMsrp: inRange(row.baseMsrp, 20000, 150000),
    msrpPlusDph: inRange(row.msrpPlusDph, 20000, 150000),
  };
}

function completenessScore(row: PdfLeaseExampleRow): number {
  let s = 0;
  if (row.leaseTerm != null) s += 3;
  if (row.leasePayment != null) s += 3;
  if (row.dueAtSigning != null) s += 2;
  if (row.capCostReduction != null) s += 2;
  if (row.baseMsrp != null) s += 1;
  if (row.msrpPlusDph != null) s += 1;
  if (row.leaseMiles != null) s += 1;
  if (row.dateFrom != null && row.dateTo != null) s += 1;
  const st = (row.states ?? '').toUpperCase();
  if (st && !st.includes('INFERRED')) s += 1;
  return s;
}

function collapse(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function inferLeaseFieldsFromInlineText(
  lines: string[],
  row: PdfLeaseExampleRow
): Pick<PdfLeaseExampleRow, 'leasePayment' | 'leaseTerm'> {
  const modelNeedle = collapse(`${row.year} ${row.model} ${row.trim ?? ''}`);
  const modelNeedleLoose = collapse(`${row.year} ${row.model}`);
  const withIndex = lines.map((line, i) => ({ i, line, collapsed: collapse(line) }));
  const anchor =
    withIndex.find((x) => x.collapsed.includes(modelNeedle)) ??
    withIndex.find((x) => x.collapsed.includes(modelNeedleLoose));
  if (!anchor) return { leasePayment: row.leasePayment, leaseTerm: row.leaseTerm };

  const window = withIndex
    .filter((x) => Math.abs(x.i - anchor.i) <= 3)
    .map((x) => x.line)
    .join(' ');

  let leasePayment = row.leasePayment;
  let leaseTerm = row.leaseTerm;

  if (leasePayment == null) {
    const payMatch = window.match(/\$?\s*([1-9]\d{2,4})\s*(?:\/\s*mo|per\s*month|monthly|mo\b)/i);
    if (payMatch) leasePayment = parseInt(payMatch[1]!, 10);
  }
  if (leaseTerm == null) {
    const termMatch = window.match(/(\d{2})\s*(?:months?|mos?\b)/i);
    if (termMatch) leaseTerm = parseInt(termMatch[1]!, 10);
  }

  return { leasePayment, leaseTerm };
}

function dedupePdfRows(rows: PdfLeaseExampleRow[]): PdfLeaseExampleRow[] {
  const byModelKey = new Map<string, PdfLeaseExampleRow>();

  for (const row of rows) {
    const key = [row.year, (row.model ?? '').toUpperCase(), (row.trim ?? '').toUpperCase()].join('\0');
    const current = byModelKey.get(key);
    if (!current || completenessScore(row) > completenessScore(current)) {
      byModelKey.set(key, row);
    }
  }
  return Array.from(byModelKey.values());
}

function toNum(v: string): number | null {
  const n = parseInt(String(v || '').replace(/[^\d]/g, ''), 10);
  return Number.isNaN(n) ? null : n;
}

function setNumericIfParsed<T extends keyof PdfLeaseExampleRow>(
  row: PdfLeaseExampleRow,
  key: T,
  value: string
): void {
  const n = toNum(value);
  if (n != null) {
    (row as unknown as Record<string, unknown>)[key as string] = n;
  }
}

function parseDateRange(value: string): { from: string | null; to: string | null } {
  const m = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return { from: null, to: null };
  return {
    from: `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`,
    to: `${m[6]}-${m[4].padStart(2, '0')}-${m[5].padStart(2, '0')}`,
  };
}

function normalizePaState(value: string): string {
  const s = String(value ?? '').toUpperCase();
  if (s.includes('PA') || s.includes('PENNSYLVANIA')) return 'PA';
  return value;
}

function modelVariantKey(year: number | null, model: string | null, trim: string | null): string {
  return [String(year ?? ''), String(model ?? '').toUpperCase(), String(trim ?? '').toUpperCase()].join('\0');
}

function extractCapCostHintsFromConcatenatedBlocks(lines: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // Money-factor rows in these PDFs are a strong anchor; cap cost row is usually i-2.
    if (!/0\.\d{4,5}/.test(line)) continue;
    const capLine = lines[i - 2] ?? '';
    const money = capLine.match(/\$(?:\d{1,3}(?:,\d{3})*|\d+)/g);
    if (!money || money.length < 2) continue;
    const nums = money.map((m) => toNum(m)).filter((n): n is number => n != null);
    if (nums.length < 2) continue;
    if (!nums.every((n) => n >= 1000 && n <= 10000)) continue;

    let headerIdx = -1;
    for (let j = i - 1; j >= Math.max(0, i - 35); j--) {
      const tokens = extractModelTokens(lines[j] ?? '');
      if (tokens.length >= 2) {
        headerIdx = j;
        break;
      }
    }
    if (headerIdx < 0) continue;

    const headerTokens: string[] = [];
    let headerStart = headerIdx;
    while (headerStart - 1 >= 0) {
      const prevTokens = extractModelTokens(lines[headerStart - 1] ?? '');
      if (prevTokens.length === 0) break;
      headerStart -= 1;
    }
    for (let j = headerStart; j < Math.min(lines.length, headerStart + 4); j++) {
      const tokens = extractModelTokens(lines[j] ?? '');
      if (tokens.length === 0) break;
      headerTokens.push(...tokens);
    }
    const models = headerTokens
      .map((t) => normalizeModelToken(t))
      .filter((v): v is { model: string; trim: string | null; year: number } => Boolean(v));
    if (models.length < 2) continue;

    for (let c = 0; c < models.length && c < nums.length; c++) {
      const m = models[c]!;
      const v = nums[c]!;
      const key = modelVariantKey(m.year, m.model, m.trim);
      const prev = out.get(key);
      if (prev == null || v > prev) out.set(key, v);
    }
  }
  return out;
}

function extractLeasePaymentHintsFromConcatenatedBlocks(lines: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    // Use money-factor row as anchor in concatenated tables.
    if (!/0\.\d{4,5}/.test(line)) continue;

    let headerIdx = -1;
    for (let j = i - 1; j >= Math.max(0, i - 35); j--) {
      const tokens = extractModelTokens(lines[j] ?? '');
      if (tokens.length >= 2) {
        headerIdx = j;
        break;
      }
    }
    if (headerIdx < 0) continue;

    let headerStart = headerIdx;
    while (headerStart - 1 >= 0) {
      const prevTokens = extractModelTokens(lines[headerStart - 1] ?? '');
      if (prevTokens.length === 0) break;
      headerStart -= 1;
    }
    const headerTokens: string[] = [];
    for (let j = headerStart; j < Math.min(lines.length, headerStart + 4); j++) {
      const tokens = extractModelTokens(lines[j] ?? '');
      if (tokens.length === 0) break;
      headerTokens.push(...tokens);
    }
    const models = headerTokens
      .map((t) => normalizeModelToken(t))
      .filter((v): v is { model: string; trim: string | null; year: number } => Boolean(v));
    if (models.length < 2) continue;

    // Payment row usually sits several lines above money-factor and can be split
    // across two adjacent lines. Collect candidates in that window.
    const paymentNums: number[] = [];
    for (let j = Math.max(0, i - 8); j <= i - 3; j++) {
      const money = (lines[j] ?? '').match(/\$(?:\d{1,3}(?:,\d{3})*|\d+)/g);
      if (!money || money.length === 0) continue;
      const nums = money.map((m) => toNum(m)).filter((n): n is number => n != null);
      if (nums.length === 0) continue;
      // Monthly payments are generally 3-4 digits and much smaller than DAS/cap rows.
      const inRange = nums.filter((n) => n >= 250 && n <= 1500);
      if (inRange.length === 0) continue;
      paymentNums.push(...inRange);
      if (paymentNums.length >= models.length) break;
    }
    if (paymentNums.length < models.length) continue;

    for (let c = 0; c < models.length && c < paymentNums.length; c++) {
      const m = models[c]!;
      const v = paymentNums[c]!;
      const key = modelVariantKey(m.year, m.model, m.trim);
      const prev = out.get(key);
      if (prev == null) out.set(key, v);
    }
  }
  return out;
}

function normalizeModelToken(token: string): { model: string; trim: string | null; year: number } | null {
  const m = token.match(/(20\d{2})\s+(.+)/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const raw = m[2]
    .trim()
    .toUpperCase()
    .replace(/^LEXUS\s+/, '')
    .replace(/\s+/g, ' ')
    .replace(/[^A-Z0-9\s+\-]/g, '');
  if (!raw) return null;
  if (!/[A-Z]/.test(raw)) return null;
  // Ignore non-vehicle banner/header artifacts that can appear in OCR text
  // (e.g. "2026 FEATURED LEA..."), which otherwise desync table parsing.
  const hasKnownFamily = /^(IS|RX|UX|TX|GX|NX|RZ|ES|LS|LC|LX)(\b|[0-9]|H\+?|PHV)/.test(raw);
  const isNumericHybridVariant = /^\d{3}H\+?$/.test(raw);
  if (!hasKnownFamily && !isNumericHybridVariant) return null;

  if (raw.includes('PLUG-IN HYBRID') || raw.includes('PLUG IN HYBRID')) {
    return {
      model: raw.replace(/\s+PLUG-?IN HYBRID/g, '').trim(),
      trim: 'Plug-In Hybrid',
      year,
    };
  }
  // Compact Lexus family tokens in headers (e.g. RXH+, TXH+, NXH+) indicate plug-in hybrid.
  if (/^[A-Z]{2,4}H\+$/.test(raw)) {
    return { model: raw.replace(/H\+$/, ''), trim: 'Plug-In Hybrid', year };
  }
  // Numeric variants ending in h+ (e.g. 450h+) indicate plug-in hybrid.
  if (/^\d{3}H\+$/.test(raw)) {
    return { model: raw.replace(/H\+$/, ''), trim: 'Plug-In Hybrid', year };
  }
  if (raw.endsWith(' PHV')) {
    return { model: raw.replace(/\s+PHV$/, ''), trim: 'Plug-In Hybrid', year };
  }
  // Numeric variants ending in h (e.g. 350h, 500h) indicate hybrid.
  if (/^\d{3}H$/.test(raw)) {
    return { model: raw.replace(/H$/, ''), trim: 'Hybrid', year };
  }
  if (raw.endsWith('H') && raw.length > 2) {
    return { model: raw.slice(0, -1), trim: 'Hybrid', year };
  }
  if (raw.includes(' HYBRID')) {
    return { model: raw.replace(/\s+HYBRID$/, ''), trim: 'Hybrid', year };
  }
  return { model: raw, trim: null, year };
}

function splitColumns(line: string): string[] {
  return line
    .split(/\t+|\s{2,}/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractModelTokens(line: string): string[] {
  // Allow concatenated headers like "2026 RX PHV2026 RZ" (no separator before next year).
  const matches = line.match(/20\d{2}\s*[A-Z][A-Z0-9+\s-]*?(?=20\d{2}\s*[A-Z]|$)/gi);
  if (!matches) return [];
  return matches.map((m) => m.trim()).filter(Boolean);
}

function normalizeLabel(raw: string): string {
  const label = raw.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (label === 'date' || label.startsWith('offer date')) return 'date';
  if (label === 'state' || label === 'states' || label.includes('eligible state')) return 'states';
  if (label.startsWith('term')) return 'term';
  if (label.startsWith('mileage') || label.includes('mile per')) return 'mileage';
  if (label.includes('special payment') || label.includes('monthly payment')) return 'special payment';
  if (label.includes('base msrp')) return 'base msrp';
  if (label.includes('msrp') && label.includes('dph')) return 'msrp + dph';
  if (label.includes('due at lease inception') || label.includes('drive off')) return 'due at lease inception';
  if (label.includes('cap cost reduction')) return 'cap cost reduction';
  return label;
}

function parseMergedLabelLine(line: string): { label: string; blob: string } | null {
  const pairs: Array<{ re: RegExp; label: string }> = [
    { re: /^date/i, label: 'date' },
    { re: /^states?/i, label: 'states' },
    { re: /^ports?/i, label: 'ports' },
    { re: /^term/i, label: 'term' },
    { re: /^mileage/i, label: 'mileage' },
    { re: /^special\s*payment/i, label: 'special payment' },
    { re: /^base\s*msrp/i, label: 'base msrp' },
    { re: /^msrp\s*\+\s*dph/i, label: 'msrp + dph' },
    { re: /^cap\s*cost\s*reduction/i, label: 'cap cost reduction' },
    { re: /^due\s*at\s*lease\s*inception/i, label: 'due at lease inception' },
  ];
  const trimmed = line.trim();
  for (const { re, label } of pairs) {
    const m = trimmed.match(re);
    if (!m) continue;
    return { label, blob: trimmed.slice(m[0].length).trim() };
  }
  return null;
}

function splitMergedValues(label: string, blob: string, expectedCount: number): string[] {
  const text = blob.trim();
  if (!text) return [];
  const money = text.match(/\$(?:\d{1,3}(?:,\d{3})*|\d+)/g);
  const dates = text.match(/\d{1,2}\/\d{1,2}\/\d{4}\s*-\s*\d{1,2}\/\d{1,2}\/\d{4}/g);
  const mileage = text.match(/\d{1,3},\d{3}/g);
  const percents = text.match(/\d{1,3}%/g);
  const terms = text.match(/\d{2}/g);
  if (label === 'date' && dates && dates.length > 0) return dates.slice(0, Math.min(expectedCount, dates.length));
  if (label === 'special payment' && money && money.length > 0) return money.slice(0, Math.min(expectedCount, money.length));
  if (label === 'due at lease inception' && money && money.length > 0) return money.slice(0, Math.min(expectedCount, money.length));
  if (label === 'base msrp' && money && money.length > 0) return money.slice(0, Math.min(expectedCount, money.length));
  if (label === 'msrp + dph' && money && money.length > 0) return money.slice(0, Math.min(expectedCount, money.length));
  if (label === 'cap cost reduction' && money && money.length > 0) return money.slice(0, Math.min(expectedCount, money.length));
  if (label === 'mileage' && mileage && mileage.length > 0) return mileage.slice(0, Math.min(expectedCount, mileage.length));
  if (label === 'term' && terms && terms.length > 0) return terms.slice(0, Math.min(expectedCount, terms.length));
  if (label === 'states') {
    const region = 'CT, DE, MD, ME, NH, NJ, NY, PA, RI, VA, VT, WV';
    const marked = text.split(region).join('|REGION|');
    const tokens = marked
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => (s === 'REGION' ? region : s));
    if (tokens.length > 0) return tokens.slice(0, Math.min(expectedCount, tokens.length));
    if (text.includes('PA')) return Array.from({ length: expectedCount }, () => 'PA (inferred-shared)');
  }
  if (label === 'residual-percent' && percents && percents.length > 0) {
    return percents.slice(0, Math.min(expectedCount, percents.length));
  }
  return [];
}

const UNLABELED_ROW_ORDER: string[] = [
  'date',
  'states',
  'ports',
  'term',
  'mileage',
  'vin',
  'model',
  'accessories',
  'msrp + dph',
  'base msrp',
  'residual-percent',
  'residual-amount',
  'special payment',
  'gross-cap',
  'net-cap',
  'cap cost reduction',
  'dealer-gross',
  'money-factor',
  'acq-fee',
  'doc-fee',
  'subvention-cash',
  'additional-cash',
  'due at lease inception',
];

function isMostlyEmptyRow(row: PdfLeaseExampleRow): boolean {
  return (
    row.dateFrom == null &&
    row.dateTo == null &&
    row.leaseTerm == null &&
    row.leaseMiles == null &&
    row.leasePayment == null &&
    row.baseMsrp == null &&
    row.msrpPlusDph == null &&
    row.dueAtSigning == null &&
    row.capCostReduction == null &&
    !row.states
  );
}

export function parseLexusLeaseExamplesText(text: string): PdfLeaseParseResult {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const diagnostics: string[] = [];
  const out: PdfLeaseExampleRow[] = [];
  const allRows: PdfLeaseExampleRow[] = [];

  let currentRows: PdfLeaseExampleRow[] = [];
  let currentIdPrefix = 0;
  let pendingLabel: string | null = null;
  let unlabeledRowIndex = 0;
  let pendingPositionalLabel: string | null = null;
  let pendingPositionalOffset = 0;
  const flushCurrentRows = () => {
    if (currentRows.length === 0) return;
    for (const row of currentRows) allRows.push(row);
    currentRows = [];
    pendingLabel = null;
    unlabeledRowIndex = 0;
    pendingPositionalLabel = null;
    pendingPositionalOffset = 0;
  };

  for (const line of lines) {
    if (/^20\d{2}\s+/.test(line) && !line.includes('\t')) {
      const headerModels = extractModelTokens(line);
      flushCurrentRows();
      currentIdPrefix += 1;
      currentRows = headerModels.flatMap((token, idx): PdfLeaseExampleRow[] => {
        const n = normalizeModelToken(token);
        if (!n) return [];
        return [
          {
            sourceId: `pdf-${currentIdPrefix}-${idx}`,
            model: n.model,
            trim: n.trim,
            year: n.year,
            dateFrom: null,
            dateTo: null,
            states: '',
            leaseTerm: null,
            leaseMiles: null,
            leasePayment: null,
            baseMsrp: null,
            msrpPlusDph: null,
            dueAtSigning: null,
            capCostReduction: null,
          },
        ];
      });
      unlabeledRowIndex = 0;
      continue;
    }

    const cols = splitColumns(line);
    if (cols.length < 2) {
      const mergedLabel = parseMergedLabelLine(line);
      if (currentRows.length > 0 && mergedLabel) {
        const merged = splitMergedValues(mergedLabel.label, mergedLabel.blob, currentRows.length);
        if (merged.length > 0) {
          const width = Math.min(merged.length, currentRows.length);
          for (let i = 0; i < width; i++) {
            const row = currentRows[i];
            const value = merged[i];
            if (!row || !value) continue;
            if (mergedLabel.label === 'states') row.states = normalizePaState(value);
            else if (mergedLabel.label === 'term') setNumericIfParsed(row, 'leaseTerm', value);
            else if (mergedLabel.label === 'mileage') setNumericIfParsed(row, 'leaseMiles', value);
            else if (mergedLabel.label === 'special payment') {
              const n = toNum(value);
              if (n != null) row.leasePayment = n;
            }
            else if (mergedLabel.label === 'base msrp') setNumericIfParsed(row, 'baseMsrp', value);
            else if (mergedLabel.label === 'msrp + dph') setNumericIfParsed(row, 'msrpPlusDph', value);
            else if (mergedLabel.label === 'due at lease inception') setNumericIfParsed(row, 'dueAtSigning', value);
            else if (mergedLabel.label === 'cap cost reduction') setNumericIfParsed(row, 'capCostReduction', value);
            else if (mergedLabel.label === 'date') {
              const d = parseDateRange(value);
              row.dateFrom = d.from;
              row.dateTo = d.to;
            }
          }
          unlabeledRowIndex += 1;
          continue;
        }
      }

      const headerModels = extractModelTokens(line);
      if (headerModels.length > 0) {
        const appendToCurrent =
          currentRows.length > 0 &&
          currentRows.every(isMostlyEmptyRow) &&
          pendingLabel == null;
        if (!appendToCurrent) {
          flushCurrentRows();
          currentIdPrefix += 1;
        }
        const baseIdx = appendToCurrent ? currentRows.length : 0;
        const mapped = headerModels.flatMap((token, idx): PdfLeaseExampleRow[] => {
          const n = normalizeModelToken(token);
          if (!n) return [];
          return [
            {
              sourceId: `pdf-${currentIdPrefix}-${baseIdx + idx}`,
              model: n.model,
              trim: n.trim,
              year: n.year,
              dateFrom: null,
              dateTo: null,
              states: '',
              leaseTerm: null,
              leaseMiles: null,
              leasePayment: null,
              baseMsrp: null,
              msrpPlusDph: null,
              dueAtSigning: null,
              capCostReduction: null,
            },
          ];
        });
        currentRows = appendToCurrent ? [...currentRows, ...mapped] : mapped;
        continue;
      }

      let consumedPendingValue = false;
      const singleLabel = normalizeLabel(line);
      if (
        singleLabel === 'states' ||
        singleLabel === 'term' ||
        singleLabel === 'mileage' ||
        singleLabel === 'special payment' ||
        singleLabel === 'base msrp' ||
        singleLabel === 'msrp + dph' ||
        singleLabel === 'due at lease inception' ||
        singleLabel === 'cap cost reduction' ||
        singleLabel === 'date'
      ) {
        pendingLabel = singleLabel;
        continue;
      }
      if (currentRows.length > 0 && pendingLabel) {
        const maybeValues = splitColumns(line);
        if (maybeValues.length > 0) {
          const width = Math.min(maybeValues.length, currentRows.length);
          const applyToAll = maybeValues.length === 1 && currentRows.length > 1;
          for (let i = 0; i < width; i++) {
            const row = currentRows[i];
            const value = maybeValues[i];
            if (!row || !value) continue;
            if (pendingLabel === 'states') row.states = normalizePaState(value);
            else if (pendingLabel === 'term') setNumericIfParsed(row, 'leaseTerm', value);
            else if (pendingLabel === 'mileage') setNumericIfParsed(row, 'leaseMiles', value);
            else if (pendingLabel === 'special payment') {
              const n = toNum(value);
              if (n != null) row.leasePayment = n;
            }
            else if (pendingLabel === 'base msrp') setNumericIfParsed(row, 'baseMsrp', value);
            else if (pendingLabel === 'msrp + dph') setNumericIfParsed(row, 'msrpPlusDph', value);
            else if (pendingLabel === 'due at lease inception') setNumericIfParsed(row, 'dueAtSigning', value);
            else if (pendingLabel === 'cap cost reduction') setNumericIfParsed(row, 'capCostReduction', value);
            else if (pendingLabel === 'date') {
              const d = parseDateRange(value);
              row.dateFrom = d.from;
              row.dateTo = d.to;
            }
          }
          if (applyToAll) {
            for (let i = 1; i < currentRows.length; i++) {
              const row = currentRows[i];
              if (!row) continue;
              const value = maybeValues[0]!;
              if (pendingLabel === 'states') row.states = normalizePaState(value);
              else if (pendingLabel === 'term') setNumericIfParsed(row, 'leaseTerm', value);
              else if (pendingLabel === 'mileage') setNumericIfParsed(row, 'leaseMiles', value);
              else if (pendingLabel === 'special payment') {
                const n = toNum(value);
                if (n != null) row.leasePayment = n;
              }
              else if (pendingLabel === 'base msrp') setNumericIfParsed(row, 'baseMsrp', value);
              else if (pendingLabel === 'msrp + dph') setNumericIfParsed(row, 'msrpPlusDph', value);
              else if (pendingLabel === 'due at lease inception') setNumericIfParsed(row, 'dueAtSigning', value);
              else if (pendingLabel === 'cap cost reduction') setNumericIfParsed(row, 'capCostReduction', value);
              else if (pendingLabel === 'date') {
                const d = parseDateRange(value);
                row.dateFrom = d.from;
                row.dateTo = d.to;
              }
            }
          }
          pendingLabel = null;
          consumedPendingValue = true;
        }
      }
      if (currentRows.length > 0 && pendingLabel == null && !consumedPendingValue) {
        const positionalLabel: string | null =
          pendingPositionalLabel ?? UNLABELED_ROW_ORDER[unlabeledRowIndex] ?? null;
        if (positionalLabel) {
          const merged = splitMergedValues(positionalLabel, line, currentRows.length);
          if (merged.length > 0) {
            const startIndex =
              pendingPositionalLabel === positionalLabel ? pendingPositionalOffset : 0;
            const width = Math.min(merged.length, Math.max(0, currentRows.length - startIndex));
            for (let i = 0; i < width; i++) {
              const row = currentRows[startIndex + i];
              const value = merged[i];
              if (!row || !value) continue;
              if (positionalLabel === 'states') row.states = normalizePaState(value);
              else if (positionalLabel === 'term') setNumericIfParsed(row, 'leaseTerm', value);
              else if (positionalLabel === 'mileage') setNumericIfParsed(row, 'leaseMiles', value);
              else if (positionalLabel === 'special payment') {
                const n = toNum(value);
                if (n != null) row.leasePayment = n;
              }
              else if (positionalLabel === 'base msrp') setNumericIfParsed(row, 'baseMsrp', value);
              else if (positionalLabel === 'msrp + dph') setNumericIfParsed(row, 'msrpPlusDph', value);
              else if (positionalLabel === 'due at lease inception') setNumericIfParsed(row, 'dueAtSigning', value);
              else if (positionalLabel === 'cap cost reduction') setNumericIfParsed(row, 'capCostReduction', value);
              else if (positionalLabel === 'date') {
                const d = parseDateRange(value);
                row.dateFrom = d.from;
                row.dateTo = d.to;
              }
            }
            const nextOffset = startIndex + width;
            if (nextOffset < currentRows.length) {
              pendingPositionalLabel = positionalLabel;
              pendingPositionalOffset = nextOffset;
              continue;
            }
            pendingPositionalLabel = null;
            pendingPositionalOffset = 0;
          }
          else if (pendingPositionalLabel) {
            // If a continuation label can't parse this line, abandon continuation
            // and advance to avoid getting stuck.
            pendingPositionalLabel = null;
            pendingPositionalOffset = 0;
          }
          unlabeledRowIndex += 1;
        }
      }
      continue;
    }

    const modelCols = cols.filter((c) => /^20\d{2}\s+/.test(c));
    const looksLikeModelHeader =
      /^20\d{2}\s+/.test(line) || /(^|[\s\t])model($|[\s\t])/i.test(line);
    const extractedModels =
      modelCols.length > 0 ? modelCols : looksLikeModelHeader ? extractModelTokens(line) : [];
    if (extractedModels.length >= 1 && (modelCols.length === cols.length || extractedModels.length > 1)) {
      flushCurrentRows();
      currentIdPrefix += 1;
      currentRows = extractedModels.flatMap((c, idx): PdfLeaseExampleRow[] => {
        const n = normalizeModelToken(c);
        if (!n) return [];
        return [
          {
            sourceId: `pdf-${currentIdPrefix}-${idx}`,
            model: n.model,
            trim: n.trim,
            year: n.year,
            dateFrom: null,
            dateTo: null,
            states: '',
            leaseTerm: null,
            leaseMiles: null,
            leasePayment: null,
            baseMsrp: null,
            msrpPlusDph: null,
            dueAtSigning: null,
            capCostReduction: null,
          },
        ];
      });
      unlabeledRowIndex = 0;
      continue;
    }

    if (currentRows.length === 0) continue;

    let label = normalizeLabel(cols[0]);
    const isKnownLabel =
      label === 'date' ||
      label === 'states' ||
      label === 'term' ||
      label === 'mileage' ||
      label === 'special payment' ||
      label === 'base msrp' ||
      label === 'msrp + dph' ||
      label === 'due at lease inception' ||
      label === 'cap cost reduction';

    // Pages 2+ in this Lexus PDF often omit row labels entirely.
    // When that happens, map rows by known sequence position.
    let usedPositionalMapping = false;
    if (!isKnownLabel && currentRows.length > 0 && cols.length >= 1 && cols.length <= currentRows.length) {
      label = UNLABELED_ROW_ORDER[unlabeledRowIndex] ?? label;
      unlabeledRowIndex += 1;
      usedPositionalMapping = true;
      if (label !== cols[0]) {
        // Treat full row as values (no leading label cell).
        cols.unshift(label);
      }
    }
    let values = cols.slice(1);
    if (values.length === 0 && currentRows.length > 0) {
      // Fallback for lines that collapse to a single chunk after PDF extraction.
      values = line
        .replace(new RegExp(`^${cols[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*`), '')
        .split(/\s{2,}/g)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (values.length === 0) {
      pendingLabel = label;
      continue;
    }
    const width = Math.min(values.length, currentRows.length);
    const applyToAll = values.length === 1 && currentRows.length > 1;

    for (let i = 0; i < width; i++) {
      const row = currentRows[i];
      const value = values[i];
      if (!row || !value) continue;

      if (label === 'date') {
        const d = parseDateRange(value);
        row.dateFrom = d.from;
        row.dateTo = d.to;
      } else if (label === 'states') {
        row.states = normalizePaState(value);
      } else if (label === 'term') {
        setNumericIfParsed(row, 'leaseTerm', value);
      } else if (label === 'mileage') {
        setNumericIfParsed(row, 'leaseMiles', value);
      } else if (label === 'special payment') {
        const n = toNum(value);
        if (n != null) row.leasePayment = n;
      } else if (label === 'base msrp') {
        setNumericIfParsed(row, 'baseMsrp', value);
      } else if (label === 'msrp + dph') {
        setNumericIfParsed(row, 'msrpPlusDph', value);
      } else if (label.includes('due at lease inception')) {
        setNumericIfParsed(row, 'dueAtSigning', value);
      } else if (label === 'cap cost reduction') {
        setNumericIfParsed(row, 'capCostReduction', value);
      }
    }
    if (applyToAll) {
      for (let i = 1; i < currentRows.length; i++) {
        const row = currentRows[i];
        if (!row) continue;
        const value = values[0]!;
        if (label === 'states') row.states = normalizePaState(value);
        else if (label === 'term') setNumericIfParsed(row, 'leaseTerm', value);
        else if (label === 'mileage') setNumericIfParsed(row, 'leaseMiles', value);
        else if (label === 'special payment') {
          const n = toNum(value);
          if (n != null) row.leasePayment = n;
        }
        else if (label === 'base msrp') setNumericIfParsed(row, 'baseMsrp', value);
        else if (label === 'msrp + dph') setNumericIfParsed(row, 'msrpPlusDph', value);
        else if (label === 'due at lease inception') setNumericIfParsed(row, 'dueAtSigning', value);
        else if (label === 'cap cost reduction') setNumericIfParsed(row, 'capCostReduction', value);
        else if (label === 'date') {
          const d = parseDateRange(value);
          row.dateFrom = d.from;
          row.dateTo = d.to;
        }
      }
    }

    // Do not flush on "date" row: many Lexus tables put date first, followed by
    // states/term/payment/cap-cost rows. We flush when a new model header starts
    // (or end-of-file), so all rows in the block can populate.
  }

  flushCurrentRows();

  const hasPaInDocument = /\bPA\b|\bPENNSYLVANIA\b/i.test(text);
  const explicitPaRows = allRows.filter((row) => {
    const s = (row.states ?? '').toUpperCase();
    return s.includes('PA') || s.includes('PENNSYLVANIA');
  });
  const explicitNonPaRows = allRows.filter((row) => {
    const s = (row.states ?? '').trim();
    if (!s) return false;
    const up = s.toUpperCase();
    return !up.includes('PA') && !up.includes('PENNSYLVANIA');
  });
  for (const row of allRows) {
    const s = (row.states ?? '').toUpperCase();
    if (s.includes('PA') || s.includes('PENNSYLVANIA')) {
      out.push(row);
      continue;
    }
    // Fallback: if PDF clearly contains PA but row-level state collapsed/missing, keep the row.
    if (!row.states && hasPaInDocument) {
      const hasMeaningfulLeaseData =
        row.leaseTerm != null ||
        row.leasePayment != null ||
        row.dueAtSigning != null ||
        row.capCostReduction != null ||
        row.baseMsrp != null ||
        row.msrpPlusDph != null;
      if (hasMeaningfulLeaseData) out.push({ ...row, states: 'PA' });
    }
  }

  // Some PDFs apply "PA" as a shared state banner and only one parsed row retains it.
  // If that happens, treat all rows as PA-scoped so crosscheck can still run.
  if (
    out.length <= 1 &&
    allRows.length > 1 &&
    explicitPaRows.length <= 1 &&
    explicitNonPaRows.length === 0 &&
    hasPaInDocument
  ) {
    const inferred = allRows.map((row) => ({
      ...row,
      states: row.states && row.states.trim().length > 0 ? normalizePaState(row.states) : 'PA',
    }));
    out.length = 0;
    out.push(...inferred);
    diagnostics.push('Applied shared-PA fallback across detected rows.');
  }

  // Recovery for concatenated blocks where state tokenization can drop a variant
  // even though the document is PA-scoped. Backfill missing model/trim variants
  // from the full parsed set, preferring rows that already mention PA.
  if (hasPaInDocument) {
    const keyOf = (r: PdfLeaseExampleRow) => modelVariantKey(r.year, r.model, r.trim);
    const outKeys = new Set(out.map(keyOf));
    const allByKey = new Map<string, PdfLeaseExampleRow[]>();
    for (const r of allRows) {
      const key = keyOf(r);
      const arr = allByKey.get(key) ?? [];
      arr.push(r);
      allByKey.set(key, arr);
    }
    for (const [key, group] of allByKey) {
      if (outKeys.has(key) || group.length === 0) continue;
      const best = [...group].sort((a, b) => {
        const aPa = /\bPA\b|\bPENNSYLVANIA\b/i.test(String(a.states ?? '')) ? 1 : 0;
        const bPa = /\bPA\b|\bPENNSYLVANIA\b/i.test(String(b.states ?? '')) ? 1 : 0;
        if (aPa !== bPa) return bPa - aPa;
        const scoreA = completenessScore(a);
        const scoreB = completenessScore(b);
        if (scoreA !== scoreB) return scoreB - scoreA;
        const capA = a.capCostReduction ?? -1;
        const capB = b.capCostReduction ?? -1;
        if (capA !== capB) return capB - capA;
        return 0;
      })[0]!;
      const sameFamilyAlreadyInPaOut = out.some(
        (r) => r.year === best.year && String(r.model ?? '').toUpperCase() === String(best.model ?? '').toUpperCase()
      );
      if (!sameFamilyAlreadyInPaOut) continue;
      const meaningful =
        best.leaseTerm != null ||
        best.leasePayment != null ||
        best.dueAtSigning != null ||
        best.capCostReduction != null ||
        best.baseMsrp != null ||
        best.msrpPlusDph != null;
      if (!meaningful) continue;
      out.push({ ...best, states: 'PA' });
      outKeys.add(key);
    }
  }

  // Enrich sparse PA rows from richer same-model rows seen in the same PDF.
  // This handles pages where state-scoped rows are sparse but value rows are present
  // in adjacent blocks with the same model/trim/year.
  const richestByKey = new Map<string, PdfLeaseExampleRow>();
  for (const row of allRows) {
    const key = [row.year, (row.model ?? '').toUpperCase(), (row.trim ?? '').toUpperCase()].join('\0');
    const prev = richestByKey.get(key);
    if (!prev || completenessScore(row) > completenessScore(prev)) richestByKey.set(key, row);
  }
  const enrichedBySibling = out.map((row) => {
    const key = [row.year, (row.model ?? '').toUpperCase(), (row.trim ?? '').toUpperCase()].join('\0');
    const rich = richestByKey.get(key);
    if (!rich) return row;
    return {
      ...row,
      dateFrom: row.dateFrom ?? rich.dateFrom,
      dateTo: row.dateTo ?? rich.dateTo,
      leaseTerm: row.leaseTerm ?? rich.leaseTerm,
      leaseMiles: row.leaseMiles ?? rich.leaseMiles,
      leasePayment: row.leasePayment ?? rich.leasePayment,
      baseMsrp: row.baseMsrp ?? rich.baseMsrp,
      msrpPlusDph: row.msrpPlusDph ?? rich.msrpPlusDph,
      dueAtSigning: row.dueAtSigning ?? rich.dueAtSigning,
      capCostReduction: row.capCostReduction ?? rich.capCostReduction,
    };
  });

  const inferredOut = enrichedBySibling.map((row) => {
    if (row.leasePayment != null && row.leaseTerm != null) return row;
    const inferred = inferLeaseFieldsFromInlineText(lines, row);
    return {
      ...row,
      leasePayment: row.leasePayment ?? inferred.leasePayment,
      leaseTerm: row.leaseTerm ?? inferred.leaseTerm,
    };
  }).map(sanitizePdfRow);

  const capHints = extractCapCostHintsFromConcatenatedBlocks(lines);
  const paymentHints = extractLeasePaymentHintsFromConcatenatedBlocks(lines);
  const hintedOut = inferredOut.map((row) => {
    const key = modelVariantKey(row.year, row.model, row.trim);
    const next: PdfLeaseExampleRow = { ...row };
    if (next.capCostReduction == null) {
      const hint = capHints.get(key);
      if (hint != null) next.capCostReduction = hint;
    }
    if (next.leasePayment == null) {
      const hint = paymentHints.get(key);
      if (hint != null) next.leasePayment = hint;
    }
    return next;
  });
  const hintedKeys = new Set(hintedOut.map((r) => modelVariantKey(r.year, r.model, r.trim)));
  const syntheticHintRows: PdfLeaseExampleRow[] = [];
  for (const [key, cap] of capHints) {
    if (hintedKeys.has(key)) continue;
    const [yearStr, modelUpper, trimUpper] = key.split('\0');
    const year = toNum(yearStr);
    if (year == null || !modelUpper) continue;
    const trim =
      trimUpper === 'PLUG-IN HYBRID'
        ? 'Plug-In Hybrid'
        : trimUpper === 'HYBRID'
        ? 'Hybrid'
        : trimUpper
        ? trimUpper
        : null;
    syntheticHintRows.push({
      sourceId: `pdf-hint-${modelUpper.toLowerCase()}-${String(trimUpper || 'base').toLowerCase()}-${year}`,
      model: modelUpper,
      trim,
      year,
      dateFrom: null,
      dateTo: null,
      states: 'PA',
      leaseTerm: null,
      leaseMiles: null,
      leasePayment: paymentHints.get(key) ?? null,
      baseMsrp: null,
      msrpPlusDph: null,
      dueAtSigning: null,
      capCostReduction: cap,
    });
  }
  const hintedWithSynthetic = [...hintedOut, ...syntheticHintRows];

  const beforeDedupe = hintedWithSynthetic.length;
  const dedupedOut = dedupePdfRows(hintedWithSynthetic);
  if (dedupedOut.length === 0) diagnostics.push('No PA lease rows parsed from PDF.');
  diagnostics.push(`PDF lines parsed: ${lines.length}`);
  diagnostics.push(`Model header blocks detected: ${currentIdPrefix}`);
  diagnostics.push(
    `Unique parsed models: ${new Set(dedupedOut.map((r) => `${r.year}|${r.model}|${r.trim ?? ''}`)).size}`
  );
  diagnostics.push(`Total rows detected before PA filter: ${allRows.length}`);
  diagnostics.push(`PA rows detected: ${dedupedOut.length}`);
  if (beforeDedupe !== dedupedOut.length) {
    diagnostics.push(`Deduped PA rows: ${beforeDedupe} -> ${dedupedOut.length}`);
  }
  if (dedupedOut.length > 0) {
    const samples = dedupedOut
      .slice(0, 5)
      .map(
        (r) =>
          `${r.year} ${r.model} ${r.trim ?? ''} | term=${r.leaseTerm ?? 'n/a'} | pay=${r.leasePayment ?? 'n/a'} | state=${r.states || 'n/a'}`
      );
    diagnostics.push(`PA row samples: ${samples.join(' || ')}`);
  }
  return { rows: dedupedOut, diagnostics };
}

export async function parseLexusLeaseExamplesPdf(buffer: Buffer): Promise<PdfLeaseParseResult> {
  const parsed = await pdfParse(buffer);
  return parseLexusLeaseExamplesText(String(parsed.text ?? ''));
}

