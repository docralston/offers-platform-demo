import type { OfferInput } from '@/lib/domain/validation';
import type { NormalizedLexusOffer } from './normalize';

const SEP = '\0';

const CONFLICT_FIELDS = [
  'msrp',
  'dueAtSigning',
  'downPayment',
  'leasePayment',
  'leaseTerm',
  'aprRate',
  'aprTermMonths',
  'disclaimer',
  'additionalNotes',
  'msrpSource',
] as const;

type ConflictField = (typeof CONFLICT_FIELDS)[number];

export interface LexusDuplicateWarningGroup {
  key: string;
  offerType: string | null;
  model: string | null;
  year: number | null;
  trim: string | null;
  offerIds: string[];
  rowIndexes: number[];
  differingFields: ConflictField[];
  message: string;
}

export interface LexusDedupeResult {
  rows: OfferInput[];
  previewRows: NormalizedLexusOffer[];
  warningGroups: LexusDuplicateWarningGroup[];
}

function datePart(value: OfferInput['startDate'] | OfferInput['endDate']): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const iso = value.toISOString?.();
  return iso ? iso.slice(0, 10) : '';
}

function canonicalVehicleKey(row: NormalizedLexusOffer): string {
  return [
    (row.offerType ?? '').toString(),
    (row.model ?? '').trim(),
    String(row.year ?? ''),
    (row.trim ?? '').trim(),
    (row.condition ?? '').toString(),
    datePart(row.startDate),
    datePart(row.endDate),
  ].join(SEP);
}

function strictKey(row: NormalizedLexusOffer): string {
  const withProgram = [
    canonicalVehicleKey(row),
    // For finance, offerId is program-level; include it to avoid cross-program collapse.
    row.offerType === 'Finance' ? (row.sourceOfferId ?? '') : '',
  ];
  return withProgram.join(SEP);
}

function fieldValue(row: NormalizedLexusOffer, field: ConflictField): unknown {
  return row[field];
}

function differingFields(rows: NormalizedLexusOffer[]): ConflictField[] {
  const out: ConflictField[] = [];
  for (const field of CONFLICT_FIELDS) {
    const values = new Set(rows.map((r) => String(fieldValue(r, field) ?? '')));
    if (values.size > 1) out.push(field);
  }
  return out;
}

function hasExplicitDphIndicator(row: NormalizedLexusOffer): boolean {
  const text = `${row.disclaimer ?? ''} ${row.additionalNotes ?? ''}`.toUpperCase();
  return text.includes('DPH') || text.includes('DELIVERY PROCESSING AND HANDLING');
}

function chooseMsrpPreferred(rows: NormalizedLexusOffer[]): NormalizedLexusOffer {
  return [...rows].sort((a, b) => {
    const aDph = hasExplicitDphIndicator(a) ? 1 : 0;
    const bDph = hasExplicitDphIndicator(b) ? 1 : 0;
    if (aDph !== bDph) return bDph - aDph;
    // If neither/ both have DPH hints, prefer row with non-null MSRP.
    const aHas = a.msrp != null ? 1 : 0;
    const bHas = b.msrp != null ? 1 : 0;
    if (aHas !== bHas) return bHas - aHas;
    // Stable deterministic fallback.
    return (a.sourceFingerprint ?? '').localeCompare(b.sourceFingerprint ?? '', 'en');
  })[0];
}

function toWarning(
  key: string,
  rows: NormalizedLexusOffer[],
  rowIndexes: number[],
  fields: ConflictField[],
  message: string
): LexusDuplicateWarningGroup {
  return {
    key,
    offerType: (rows[0]?.offerType as string | null) ?? null,
    model: rows[0]?.model ?? null,
    year: rows[0]?.year ?? null,
    trim: rows[0]?.trim ?? null,
    offerIds: [...new Set(rows.map((r) => r.sourceOfferId).filter((id): id is string => Boolean(id)))],
    rowIndexes,
    differingFields: fields,
    message,
  };
}

function stripMetadata(row: NormalizedLexusOffer): OfferInput {
  const { sourceOfferId: _offerId, sourceFingerprint: _fp, msrpSource: _msrpSource, ...rest } = row;
  return rest as OfferInput;
}

function leaseCollisionKey(row: NormalizedLexusOffer): string | null {
  if (row.offerType !== 'Lease') return null;
  if (row.leaseTerm == null || row.leasePayment == null) return null;
  return [
    (row.model ?? '').trim(),
    String(row.year ?? ''),
    String(row.leaseTerm ?? ''),
    String(row.leasePayment ?? ''),
    (row.condition ?? '').toString(),
    datePart(row.startDate),
    datePart(row.endDate),
  ].join(SEP);
}

function richnessScore(row: NormalizedLexusOffer): number {
  let s = 0;
  if (row.trim) s += 2;
  if (row.dueAtSigning != null) s += 2;
  if (row.capCostReduction != null) s += 2;
  if (row.msrp != null) s += 1;
  if (row.disclaimer) s += 1;
  if (row.additionalNotes) s += 1;
  return s;
}

export function dedupeAndWarnLexusRows(rows: NormalizedLexusOffer[]): LexusDedupeResult {
  const byStrict = new Map<string, Array<{ row: NormalizedLexusOffer; index: number }>>();
  rows.forEach((row, index) => {
    const k = strictKey(row);
    if (!byStrict.has(k)) byStrict.set(k, []);
    byStrict.get(k)!.push({ row, index });
  });

  const warnings: LexusDuplicateWarningGroup[] = [];
  const kept: OfferInput[] = [];
  const keptPreview: NormalizedLexusOffer[] = [];

  for (const [key, group] of byStrict) {
    if (group.length === 1) {
      kept.push(stripMetadata(group[0].row));
      keptPreview.push(group[0].row);
      continue;
    }

    const groupRows = group.map((g) => g.row);
    const groupIndexes = group.map((g) => g.index);
    const diffs = differingFields(groupRows);

    // If the conflict is MSRP-basis-only noise, dedupe with explicit MSRP preference.
    const msrpOnly = diffs.every((f) => ['msrp', 'disclaimer', 'additionalNotes', 'msrpSource'].includes(f));
    if (msrpOnly) {
      const preferred = chooseMsrpPreferred(groupRows);
      kept.push(stripMetadata(preferred));
      keptPreview.push(preferred);
      warnings.push(
        toWarning(
          key,
          groupRows,
          groupIndexes,
          diffs,
          'Near-duplicate offers detected with MSRP-basis differences; preferred MSRP + DPH when available.'
        )
      );
      continue;
    }

    // Keep all rows for broader conflicts, but alert strongly.
    for (const row of groupRows) {
      kept.push(stripMetadata(row));
      keptPreview.push(row);
    }
    warnings.push(
      toWarning(
        key,
        groupRows,
        groupIndexes,
        diffs,
        'Near-duplicate offers detected with limited field differences; review before push.'
      )
    );
  }

  // Second pass: red-flag lease collisions where same model/year + same term/payment
  // appears more than once. Keep the richest row to avoid duplicate output rows.
  const byLeaseCollision = new Map<string, Array<{ row: NormalizedLexusOffer; index: number }>>();
  keptPreview.forEach((row, index) => {
    const k = leaseCollisionKey(row);
    if (!k) return;
    if (!byLeaseCollision.has(k)) byLeaseCollision.set(k, []);
    byLeaseCollision.get(k)!.push({ row, index });
  });

  const collisionDrop = new Set<number>();
  for (const [key, group] of byLeaseCollision) {
    if (group.length <= 1) continue;
    const sorted = [...group].sort((a, b) => {
      const scoreDiff = richnessScore(b.row) - richnessScore(a.row);
      if (scoreDiff !== 0) return scoreDiff;
      return (a.row.sourceFingerprint ?? '').localeCompare(b.row.sourceFingerprint ?? '', 'en');
    });
    const keepIndex = sorted[0]!.index;
    for (const g of group) {
      if (g.index !== keepIndex) collisionDrop.add(g.index);
    }
    const groupRows = group.map((g) => g.row);
    const groupIndexes = group.map((g) => g.index);
    const diffs = differingFields(groupRows);
    warnings.push(
      toWarning(
        `lease-collision${SEP}${key}`,
        groupRows,
        groupIndexes,
        diffs,
        'Red-flag duplicate lease rows detected (same model/year + term/payment). Kept one row and dropped duplicates.'
      )
    );
  }

  if (collisionDrop.size > 0) {
    const filteredPreview: NormalizedLexusOffer[] = [];
    const filteredRows: OfferInput[] = [];
    for (let i = 0; i < keptPreview.length; i++) {
      if (collisionDrop.has(i)) continue;
      filteredPreview.push(keptPreview[i]!);
      filteredRows.push(kept[i]!);
    }
    return { rows: filteredRows, previewRows: filteredPreview, warningGroups: warnings };
  }

  return { rows: kept, previewRows: keptPreview, warningGroups: warnings };
}

