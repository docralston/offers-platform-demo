import * as XLSX from 'xlsx';
import { getMakeForStoreCode } from '@/lib/config/stores';
import type { OfferInput } from '@/lib/domain/validation';
import { OfferStatus, VehicleCondition } from '@/lib/domain/offer-status';
import { OFFER_TYPE_EXPLICIT, type OfferTypeExplicit } from '@/lib/domain/offer-type';

/** Normalize header for matching: lowercase, remove spaces/underscores/dashes */
function normalizeHeader(h: string): string {
  return String(h ?? '')
    .toLowerCase()
    .replace(/[\s_\-\.]/g, '');
}

/** Map normalized header -> OfferInput field name */
const HEADER_TO_FIELD: Record<string, keyof OfferInput> = {
  storecode: 'storeCode',
  store: 'storeCode',
  storecodes: 'storeCodes',
  make: 'make',
  model: 'model',
  series: 'series',
  modelcode: 'modelCode',
  year: 'year',
  trim: 'trim',
  condition: 'condition',
  startdate: 'startDate',
  start: 'startDate',
  enddate: 'endDate',
  end: 'endDate',
  status: 'status',
  inventoryurl: 'inventoryUrl',
  inventory: 'inventoryUrl',
  inventory_url: 'inventoryUrl',
  imageurl: 'imageUrl',
  image: 'imageUrl',
  image_url: 'imageUrl',
  leasepayment: 'leasePayment',
  lease_payment: 'leasePayment',
  leaseterm: 'leaseTerm',
  lease_term: 'leaseTerm',
  leasemiles: 'leaseMiles',
  lease_miles: 'leaseMiles',
  dueatsigning: 'dueAtSigning',
  due_at_signing: 'dueAtSigning',
  capcostreduction: 'capCostReduction',
  cap_cost_reduction: 'capCostReduction',
  grosscapcost: 'grossCapCost',
  gross_cap_cost: 'grossCapCost',
  netcapcost: 'netCapCost',
  net_cap_cost: 'netCapCost',
  securitydeposit: 'securityDeposit',
  security_deposit: 'securityDeposit',
  perexcessmile: 'perExcessMile',
  per_excess_mile: 'perExcessMile',
  excessmilecharge: 'perExcessMile',
  excess_mile_charge: 'perExcessMile',
  acquisitionfee: 'acquisitionFee',
  acquisition_fee: 'acquisitionFee',
  downpayment: 'downPayment',
  down_payment: 'downPayment',
  msrp: 'msrp',
  discount: 'discount',
  buyfor: 'buyFor',
  buy_for: 'buyFor',
  stocknumber: 'stockNumber',
  stock_number: 'stockNumber',
  stock: 'stockNumber',
  offertype: 'offerType',
  offer_type: 'offerType',
  aprrate: 'aprRate',
  apr_rate: 'aprRate',
  apr: 'aprRate',
  aprtermmonths: 'aprTermMonths',
  apr_term_months: 'aprTermMonths',
  aprterm: 'aprTermMonths',
  rebatetotal: 'rebateTotal',
  rebate_total: 'rebateTotal',
  rebate: 'rebateTotal',
  customercash: 'customerCash',
  customer_cash: 'customerCash',
  leasecash: 'leaseCash',
  lease_cash: 'leaseCash',
  aprcash: 'aprCash',
  apr_cash: 'aprCash',
  bonuscash: 'bonusCash',
  bonus_cash: 'bonusCash',
  disclaimer: 'disclaimer',
  additionalnotes: 'additionalNotes',
  additional_notes: 'additionalNotes',
  notes: 'additionalNotes',
};

/** Parse a value to Date. Handles Excel serial, ISO, MM/DD/YYYY, etc. */
function parseDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (typeof v === 'number' && !isNaN(v)) {
    // Excel serial: days since 1900-01-01 (with 1900 leap bug)
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return new Date(d.y, d.m - 1, d.d);
  }
  const s = String(v).trim();
  if (!s) return null;
  // ISO
  const iso = /^\d{4}-\d{2}-\d{2}/.exec(s);
  if (iso) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  // MM/DD/YYYY or M/D/YY
  const us = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(s);
  if (us) {
    const m = parseInt(us[1], 10) - 1;
    let y = parseInt(us[3], 10);
    if (y < 100) y += 2000; // 24 -> 2024
    const d = new Date(y, m, parseInt(us[2], 10));
    return isNaN(d.getTime()) ? null : d;
  }
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

function parseNum(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && !isNaN(v)) return v;
  const n = parseFloat(String(v).replace(/[,$\s]/g, ''));
  return isNaN(n) ? null : n;
}

function parseIntVal(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  const n = parseInt(String(v).replace(/[,$\s]/g, ''), 10);
  return isNaN(n) ? null : n;
}

function parseStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function parseCondition(v: unknown): VehicleCondition | null {
  const s = String(v ?? '').toUpperCase().trim();
  if (['NEW', 'N'].includes(s)) return VehicleCondition.NEW;
  if (['USED', 'U'].includes(s)) return VehicleCondition.USED;
  if (['CERTIFIED', 'C', 'CPO'].includes(s)) return VehicleCondition.CERTIFIED;
  return null;
}

function parseStatus(v: unknown): OfferStatus | null {
  const s = String(v ?? '').toUpperCase().trim();
  if (['DRAFT', 'D', 'INACTIVE', 'I'].includes(s)) return OfferStatus.INACTIVE;
  if (['LIVE', 'L', 'PUBLISHED', 'ACTIVE'].includes(s)) return OfferStatus.LIVE;
  return null;
}

function parseOfferType(v: unknown): OfferTypeExplicit | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === 'lease') return 'Lease';
  if (lower === 'finance') return 'Finance';
  if (lower === 'cash') return 'Cash';
  if (lower === 'other') return 'Other';
  return OFFER_TYPE_EXPLICIT.includes(s as OfferTypeExplicit) ? (s as OfferTypeExplicit) : null;
}

export interface ParsedImport {
  headers: string[];
  rows: Array<{ offer: OfferInput; rowIndex: number }>;
  errors: Array<{ rowIndex: number; errors: Array<{ field: string; message: string }> }>;
}

/**
 * Parse XLSX or CSV buffer into OfferInput rows.
 * Uses first sheet. First row = headers. Flexible column names (see HEADER_TO_FIELD).
 * Returns parsed offers and per-row validation errors (e.g. missing required fields).
 */
export function parseSpreadsheetToOffers(buffer: Buffer): ParsedImport {
  const wb = XLSX.read(buffer, { type: 'buffer', raw: false, cellDates: false });
  const first = wb.SheetNames[0];
  if (!first) {
    return { headers: [], rows: [], errors: [{ rowIndex: 0, errors: [{ field: 'general', message: 'Workbook has no sheets' }] }] };
  }
  const sheet = wb.Sheets[first];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });

  if (json.length === 0) {
    return { headers: [], rows: [], errors: [] };
  }

  const rawHeaders = Object.keys(json[0] ?? {});
  const headerToField = new Map<string, keyof OfferInput>();
  for (const h of rawHeaders) {
    const n = normalizeHeader(h);
    const f = HEADER_TO_FIELD[n];
    if (f) headerToField.set(h, f);
  }

  const rows: Array<{ offer: OfferInput; rowIndex: number }> = [];
  const errors: Array<{ rowIndex: number; errors: Array<{ field: string; message: string }> }> = [];

  for (let i = 0; i < json.length; i++) {
    const raw = json[i] as Record<string, unknown>;
    const rowIndex = i + 2; // 1-based + header row
    const rowErrors: Array<{ field: string; message: string }> = [];

    const get = (field: keyof OfferInput): unknown => {
      for (const [h, f] of headerToField) {
        if (f === field && raw[h] != null && raw[h] !== '') return raw[h];
      }
      return undefined;
    };

    const storeCode = parseStr(get('storeCode'));
    const model = parseStr(get('model'));
    // Parse year and remove ".0" suffix if present (e.g., "2024.0" -> 2024)
    const yearRaw = get('year');
    const yearStr = yearRaw != null ? String(yearRaw).replace(/\.0$/, '') : undefined;
    const year = parseIntVal(yearStr);
    const startDate = parseDate(get('startDate'));
    const endDate = parseDate(get('endDate'));
    const condition = parseCondition(get('condition')) ?? VehicleCondition.NEW;
    const offerType = parseOfferType(get('offerType'));
    const makeRaw = parseStr(get('make'));
    const make =
      condition === VehicleCondition.USED
        ? makeRaw
        : (makeRaw || getMakeForStoreCode(storeCode!) || null);

    if (!storeCode) rowErrors.push({ field: 'storeCode', message: 'Store code is required' });
    if (!model) rowErrors.push({ field: 'model', message: 'Model is required' });
    // Year is optional for certified finance offers (applies to all certified vehicles)
    const isCertifiedFinance = condition === VehicleCondition.CERTIFIED && offerType === 'Finance';
    if (!isCertifiedFinance && (year == null || year < 1900 || year > 2100)) {
      rowErrors.push({ field: 'year', message: 'Year is required and must be 1900–2100' });
    } else if (year != null && (year < 1900 || year > 2100)) {
      rowErrors.push({ field: 'year', message: 'Year must be 1900–2100 if provided' });
    }
    if (!startDate) rowErrors.push({ field: 'startDate', message: 'Start date is required and must be a valid date' });
    if (!endDate) rowErrors.push({ field: 'endDate', message: 'End date is required and must be a valid date' });
    if (condition === VehicleCondition.USED && !make) rowErrors.push({ field: 'make', message: 'Make is required when condition is Used' });

    if (rowErrors.length > 0) {
      errors.push({ rowIndex, errors: rowErrors });
      continue;
    }

    const series = parseStr(get('series'));
    const modelCodeRaw = get('modelCode');
    const modelCode =
      modelCodeRaw != null && modelCodeRaw !== ''
        ? String(modelCodeRaw).replace(/\.0$/, '').trim() || null
        : null;
    const storeCodesRaw = parseStr(get('storeCodes'));
    const storeCodes =
      storeCodesRaw != null && storeCodesRaw.length > 0
        ? storeCodesRaw.split(',').map((s) => s.trim()).filter(Boolean)
        : null;

    const offer: OfferInput = {
      storeCode: storeCode!,
      storeCodes: storeCodes,
      make: make ?? null,
      model: model!,
      series,
      year: year ?? null,
      modelCode,
      trim: parseStr(get('trim')),
      condition,
      startDate: startDate!.toISOString().slice(0, 10),
      endDate: endDate!.toISOString().slice(0, 10),
      status: parseStatus(get('status')) ?? OfferStatus.INACTIVE,
      inventoryUrl: parseStr(get('inventoryUrl')),
      imageUrl: parseStr(get('imageUrl')),
      leasePayment: parseIntVal(get('leasePayment')),
      leaseTerm: parseIntVal(get('leaseTerm')),
      leaseMiles: parseIntVal(get('leaseMiles')),
      dueAtSigning: parseIntVal(get('dueAtSigning')),
      capCostReduction: parseIntVal(get('capCostReduction')),
      grossCapCost: parseIntVal(get('grossCapCost')),
      netCapCost: parseIntVal(get('netCapCost')),
      securityDeposit: parseIntVal(get('securityDeposit')),
      perExcessMile: parseNum(get('perExcessMile')),
      acquisitionFee: parseIntVal(get('acquisitionFee')),
      downPayment: parseIntVal(get('downPayment')),
      msrp: parseIntVal(get('msrp')),
      discount: parseIntVal(get('discount')),
      buyFor: parseIntVal(get('buyFor')),
      stockNumber: parseStr(get('stockNumber')),
      offerType: offerType ?? null,
      aprRate: parseNum(get('aprRate')),
      aprTermMonths: parseIntVal(get('aprTermMonths')),
      rebateTotal: parseNum(get('rebateTotal')),
      customerCash: parseNum(get('customerCash')),
      leaseCash: parseNum(get('leaseCash')),
      aprCash: parseNum(get('aprCash')),
      bonusCash: parseNum(get('bonusCash')),
      disclaimer: parseStr(get('disclaimer')),
      additionalNotes: parseStr(get('additionalNotes')),
    };

    rows.push({ offer, rowIndex });
  }

  return { headers: rawHeaders, rows, errors };
}

/** Accepted MIME types and extensions for import */
export const IMPORT_ACCEPT = '.csv,.xlsx,.xls';
export const IMPORT_MIMES = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
