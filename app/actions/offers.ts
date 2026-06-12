'use server';

import { requireAdmin, requireUserId } from '@/lib/auth';
import { getSettings } from '@/app/actions/settings';
import { prisma } from '@/lib/prisma';
import { getDisclaimerForFinanceOffer } from '@/lib/domain/apr-disclaimer';
import { computeRebateTotal } from '@/lib/domain/offer-rebate';
import { validateOffer as validateOfferDomain, type OfferInput } from '@/lib/domain/validation';
import { validateOffer as validateOfferImport } from '@/lib/validation/offers';
import { createOfferVersion } from '@/lib/domain/versioning';
import { parseSpreadsheetToOffers } from '@/lib/import/parse-spreadsheet';
import { OfferStatus, VehicleCondition, OfferTypeEnum, Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import { getMakeForStoreCode, getDefaultAcquisitionFee } from '@/lib/config/stores';
import { buildInventoryUrl, buildImageUrl } from '@/lib/domain/offer-assets';
import { createEasternDate, formatEasternDate } from '@/lib/utils/dates';
import * as XLSX from 'xlsx';
import type { ValidationIssue } from '@/lib/validation/offers';
import { MAX_IMPORT_ROWS, MAX_UPLOAD_BYTES, OFFERS_TABLE_COLUMN_ORDER } from '@/lib/ingestion/constants';
import { computeBmwExternalId, computeLexusExternalId, computeToyotaExternalId } from '@/lib/ingestion/external-id';
import { dedupeCertifiedFinanceCount } from '@/lib/domain/dashboard/dedupe';
import { financeRatesPayload, mergeFinanceRowsForImport, toOfferType, yearForOffer } from './offers-helpers';

export interface ActionResult<T = void> {
  success: boolean;
  id?: string;
  errors?: Array<{ field: string; message: string }>;
  data?: T;
}

function getTodayEasternStart(referenceDate = new Date()): Date {
  const todayEasternStr = formatEasternDate(referenceDate);
  return createEasternDate(todayEasternStr);
}

function normalizeOfferStatus(statusInput: OfferStatus | string | null | undefined, endDate: Date, todayStart: Date): OfferStatus {
  let status = (statusInput as OfferStatus) || OfferStatus.INACTIVE;
  const statusStr = String(status);
  if (statusStr === 'Active' || statusStr === 'ACTIVE') {
    status = OfferStatus.LIVE;
  } else if (status !== OfferStatus.LIVE) {
    status = OfferStatus.INACTIVE;
  }

  // Archived offers (past endDate) should never be LIVE.
  if (endDate < todayStart) {
    return OfferStatus.INACTIVE;
  }

  return status;
}

function resolveDisclaimerOnSave(
  data: OfferInput,
  finance: ReturnType<typeof financeRatesPayload>,
): { disclaimer: string | null; disclaimerSource: 'AUTO' | 'MANUAL' } {
  const disclaimerSource = data.disclaimerSource === 'MANUAL' ? 'MANUAL' : 'AUTO';
  if (disclaimerSource === 'MANUAL') {
    return { disclaimer: data.disclaimer ?? null, disclaimerSource };
  }
  const auto =
    getDisclaimerForFinanceOffer({
      ...data,
      aprRate: finance.aprRate,
      aprTermMonths: finance.aprTermMonths,
    }) ?? data.disclaimer ?? null;
  return { disclaimer: auto, disclaimerSource };
}

type CertifiedFinanceExpansionSeed = {
  id: string;
  storeCode: string;
  make: string | null;
  model: string;
  series: string | null;
  condition: VehicleCondition;
  offerType: OfferTypeEnum | null;
  aprRate: Prisma.Decimal | null;
  aprTermMonths: number | null;
};

async function expandCertifiedFinanceCollectionIds(
  ids: string[],
  todayStart: Date,
): Promise<string[]> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) return [];

  const selectedOffers: CertifiedFinanceExpansionSeed[] = await prisma.offer.findMany({
    where: { id: { in: uniqueIds } },
    select: {
      id: true,
      storeCode: true,
      make: true,
      model: true,
      series: true,
      condition: true,
      offerType: true,
      aprRate: true,
      aprTermMonths: true,
    },
  });
  if (selectedOffers.length === 0) return [];

  const expandedIds = new Set(selectedOffers.map((o) => o.id));
  for (const offer of selectedOffers) {
    const isCertifiedFinanceCollectionRow =
      offer.condition === VehicleCondition.CERTIFIED &&
      offer.offerType === OfferTypeEnum.Finance;
    if (!isCertifiedFinanceCollectionRow) continue;

    const siblingWhere: Prisma.OfferWhereInput = {
      storeCode: offer.storeCode,
      condition: VehicleCondition.CERTIFIED,
      offerType: OfferTypeEnum.Finance,
      model: offer.model,
      endDate: { gte: todayStart },
    };
    if (offer.make != null) siblingWhere.make = offer.make;
    if (offer.series != null) siblingWhere.series = offer.series;
    if (offer.aprRate != null) siblingWhere.aprRate = offer.aprRate;
    if (offer.aprTermMonths != null) siblingWhere.aprTermMonths = offer.aprTermMonths;

    const siblings = await prisma.offer.findMany({
      where: siblingWhere,
      select: { id: true },
    });
    for (const sibling of siblings) expandedIds.add(sibling.id);
  }

  return Array.from(expandedIds);
}

/**
 * Creates a new offer
 */
export async function createOffer(
  data: OfferInput,
  options?: { skipValidation?: boolean; validationIssues?: ValidationIssue[] | null }
): Promise<ActionResult> {
  try {
    const userId = await requireAdmin();

    // Validate (unless skipped for import flow)
    if (!options?.skipValidation) {
      const validation = validateOfferDomain(data);
      if (!validation.valid) {
        return {
          success: false,
          errors: validation.errors,
        };
      }
    }

    const rebateTotalVal = computeRebateTotal(data) ?? data.rebateTotal ?? null;

    const makeVal =
      data.condition === VehicleCondition.USED
        ? (data.make?.trim() || null)
        : (data.make?.trim() || getMakeForStoreCode(data.storeCode) || null);

    let acquisitionFeeVal = data.acquisitionFee ?? null;
    if (acquisitionFeeVal == null) {
      const defaultAcq = getDefaultAcquisitionFee(data.storeCode);
      if (defaultAcq != null) acquisitionFeeVal = defaultAcq;
    }

    const todayStart = getTodayEasternStart();
    const endDateVal = typeof data.endDate === 'string' ? createEasternDate(data.endDate) : data.endDate;
    const status = normalizeOfferStatus(data.status as OfferStatus | string | null | undefined, endDateVal, todayStart);

    const finance = financeRatesPayload(data);
    const { disclaimer, disclaimerSource } = resolveDisclaimerOnSave(data, finance);
    const storeCodesVal = data.storeCodes?.length ? data.storeCodes : [data.storeCode];
    const offer = await prisma.offer.create({
      data: {
        storeCode: data.storeCode,
        storeCodes: storeCodesVal,
        make: makeVal,
        model: data.model,
        series: data.series ?? null,
        year: yearForOffer(data),
        trim: data.trim || null,
        modelCode: data.modelCode ?? null,
        fuelType: data.fuelType ?? null,
        condition: (data.condition as VehicleCondition) || VehicleCondition.NEW,
        startDate: typeof data.startDate === 'string' 
          ? createEasternDate(data.startDate)
          : data.startDate,
        endDate: endDateVal,
        status: status as OfferStatus,
        inventoryUrl: data.inventoryUrl || buildInventoryUrl(data.storeCode, data.model) || null,
        imageUrl: data.imageUrl || buildImageUrl(makeVal, data.model, yearForOffer(data)) || null,
        leasePayment: data.leasePayment ?? null,
        leaseTerm: data.leaseTerm ?? null,
        leaseMiles: data.leaseMiles ?? null,
        dueAtSigning: data.dueAtSigning ?? null,
        capCostReduction: data.capCostReduction ?? null,
        grossCapCost: data.grossCapCost ?? null,
        netCapCost: data.netCapCost ?? null,
        securityDeposit: data.securityDeposit ?? null,
        perExcessMile: data.perExcessMile ?? null,
        acquisitionFee: acquisitionFeeVal,
        downPayment: data.downPayment ?? null,
        msrp: data.msrp ?? null,
        discount: data.discount ?? null,
        buyFor: data.buyFor ?? null,
        stockNumber: data.stockNumber || null,
        offerType: toOfferType(data.offerType),
        aprRate: finance.aprRate,
        aprTermMonths: finance.aprTermMonths,
        financeRates: finance.financeRates != null ? (finance.financeRates as Prisma.InputJsonValue) : undefined,
        rebateTotal: rebateTotalVal,
        customerCash: data.customerCash ?? null,
        leaseCash: data.leaseCash ?? null,
        aprCash: data.aprCash ?? null,
        bonusCash: data.bonusCash ?? null,
        disclaimer,
        disclaimerSource,
        additionalNotes: data.additionalNotes || null,
        validationIssues: options?.validationIssues ? (options.validationIssues as any) : null,
        updatedBy: userId,
      },
    });

    // Create initial version
    await createOfferVersion(offer.id, userId, 'Initial version');

    revalidatePath('/admin/offers');
    return {
      success: true,
      id: offer.id,
    };
  } catch (error) {
    console.error('Error creating offer:', error);
    return {
      success: false,
      errors: [{ field: 'general', message: 'Failed to create offer' }],
    };
  }
}

export interface ImportOffersResult {
  success: boolean;
  totalRows: number;
  insertedRows: number;
  inactiveCount: number;
  inactiveIds: string[];
  issueSummary: Array<{ code: string; count: number }>;
  failed: Array<{ rowIndex: number; errors: Array<{ field: string; message: string }> }>;
  parseErrors: Array<{ rowIndex: number; errors: Array<{ field: string; message: string }> }>;
}

/**
 * Import offers from an XLSX or CSV file.
 * File must have a header row. Column names are matched flexibly (e.g. storeCode, store_code, Lease Payment, lease_payment).
 * Required: storeCode, model, year (optional for certified finance offers), startDate, endDate; make when condition is USED.
 * Uses soft-block validation: all rows are inserted, but validation failures force status = INACTIVE.
 */
export async function importOffers(formData: FormData): Promise<ImportOffersResult> {
  const result: ImportOffersResult = {
    success: false,
    totalRows: 0,
    insertedRows: 0,
    inactiveCount: 0,
    inactiveIds: [],
    issueSummary: [],
    failed: [],
    parseErrors: [],
  };

  try {
    await requireAdmin();
  } catch {
    result.failed.push({ rowIndex: 0, errors: [{ field: 'general', message: 'You must be signed in to import' }] });
    return result;
  }

  const file = formData.get('file') as File | null;
  if (!file || !(file instanceof File) || file.size === 0) {
    result.failed.push({ rowIndex: 0, errors: [{ field: 'file', message: 'Please select an XLSX or CSV file' }] });
    return result;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    result.failed.push({
      rowIndex: 0,
      errors: [{ field: 'file', message: `File exceeds ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit` }],
    });
    return result;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { rows: parsedRows, errors: parseErrors } = parseSpreadsheetToOffers(buffer);
  result.parseErrors = parseErrors;
  result.totalRows = parsedRows.length;

  // Group Finance rows by (storeCode, model, year, condition) into one offer per group with financeRates
  const rows = mergeFinanceRowsForImport(parsedRows);

  if (parsedRows.length > MAX_IMPORT_ROWS) {
    result.failed.push({
      rowIndex: 0,
      errors: [{ field: 'file', message: `File contains ${parsedRows.length} rows. Maximum ${MAX_IMPORT_ROWS} rows allowed per import.` }],
    });
    return result;
  }

  const todayStart = getTodayEasternStart();
  // Track issue codes for summary
  const issueCodeCounts = new Map<string, number>();
  const userId = await requireAdmin();

  // Use transaction for batch insert
  try {
    await prisma.$transaction(async (tx) => {
      for (const { offer, rowIndex } of rows) {
        // Run import validation (soft-block)
        const validation = validateOfferImport(offer);
        const normalizedRow = validation.normalizedRow;

        const endDateVal =
          typeof normalizedRow.endDate === 'string' ? createEasternDate(normalizedRow.endDate) : normalizedRow.endDate;
        // Imported offers should default to LIVE unless archived/invalid.
        let status: OfferStatus = normalizeOfferStatus(OfferStatus.LIVE, endDateVal, todayStart);
        let validationIssues: ValidationIssue[] | null = null;

        if (validation.issues.length > 0) {
          // Soft-block: force INACTIVE
          status = OfferStatus.INACTIVE;
          validationIssues = validation.issues;

          // Track issue codes
          for (const issue of validation.issues) {
            issueCodeCounts.set(issue.code, (issueCodeCounts.get(issue.code) || 0) + 1);
          }
        }

        const rebateTotalVal = computeRebateTotal(normalizedRow) ?? normalizedRow.rebateTotal ?? null;
        const makeVal = normalizedRow.condition === VehicleCondition.USED && normalizedRow.make?.trim()
          ? normalizedRow.make.trim()
          : null;

        const finance = financeRatesPayload(normalizedRow);
        normalizedRow.disclaimer =
          getDisclaimerForFinanceOffer({ ...normalizedRow, aprRate: finance.aprRate, aprTermMonths: finance.aprTermMonths }) ?? normalizedRow.disclaimer ?? null;

        const importStoreCodes = normalizedRow.storeCodes?.length ? normalizedRow.storeCodes : [normalizedRow.storeCode];
        // Compute stable externalId for brands that support it so imports can upsert.
        let externalId: string | null = null;
        switch (normalizedRow.storeCode) {
          case 'TOY':
            externalId = computeToyotaExternalId(normalizedRow as OfferInput);
            break;
          case 'BMW':
            externalId = computeBmwExternalId(normalizedRow as OfferInput);
            break;
          case 'LEXDT':
          case 'LEXWG':
            externalId = computeLexusExternalId(normalizedRow as OfferInput);
            break;
          default:
            externalId = null;
        }

        let offerRecord;

        if (externalId) {
          const existing = await tx.offer.findUnique({
            where: {
              storeCode_externalId: { storeCode: normalizedRow.storeCode, externalId },
            },
          });

          const data = {
            storeCode: normalizedRow.storeCode,
            storeCodes: importStoreCodes,
            externalId,
            make: makeVal,
            model: normalizedRow.model,
            series: normalizedRow.series ?? null,
            year: normalizedRow.year,
            trim: normalizedRow.trim || null,
            modelCode: normalizedRow.modelCode ?? null,
            condition: (normalizedRow.condition as VehicleCondition) || VehicleCondition.NEW,
            startDate: typeof normalizedRow.startDate === 'string'
              ? createEasternDate(normalizedRow.startDate)
              : normalizedRow.startDate,
            endDate: endDateVal,
            status,
            inventoryUrl: normalizedRow.inventoryUrl || null,
            imageUrl: normalizedRow.imageUrl || null,
            leasePayment: normalizedRow.leasePayment ?? null,
            leaseTerm: normalizedRow.leaseTerm ?? null,
            leaseMiles: normalizedRow.leaseMiles ?? null,
            dueAtSigning: normalizedRow.dueAtSigning ?? null,
            capCostReduction: normalizedRow.capCostReduction ?? null,
            grossCapCost: normalizedRow.grossCapCost ?? null,
            netCapCost: normalizedRow.netCapCost ?? null,
            securityDeposit: normalizedRow.securityDeposit ?? null,
            perExcessMile: normalizedRow.perExcessMile ?? null,
            acquisitionFee: normalizedRow.acquisitionFee ?? null,
            downPayment: normalizedRow.downPayment ?? null,
            msrp: normalizedRow.msrp ?? null,
            discount: normalizedRow.discount ?? null,
            buyFor: normalizedRow.buyFor ?? null,
            stockNumber: normalizedRow.stockNumber || null,
            offerType: toOfferType(normalizedRow.offerType),
            aprRate: finance.aprRate,
            aprTermMonths: finance.aprTermMonths,
            financeRates: finance.financeRates != null ? (finance.financeRates as Prisma.InputJsonValue) : undefined,
            rebateTotal: rebateTotalVal,
            customerCash: normalizedRow.customerCash ?? null,
            leaseCash: normalizedRow.leaseCash ?? null,
            aprCash: normalizedRow.aprCash ?? null,
            bonusCash: normalizedRow.bonusCash ?? null,
            disclaimer: normalizedRow.disclaimer || null,
            additionalNotes: normalizedRow.additionalNotes || null,
            validationIssues: validationIssues ? (validationIssues as any) : null,
            updatedBy: userId,
          };

          if (existing) {
            offerRecord = await tx.offer.update({
              where: { id: existing.id },
              data,
            });
          } else {
            offerRecord = await tx.offer.create({
              data,
            });
          }
        } else {
          offerRecord = await tx.offer.create({
            data: {
              storeCode: normalizedRow.storeCode,
              storeCodes: importStoreCodes,
              make: makeVal,
              model: normalizedRow.model,
              series: normalizedRow.series ?? null,
              year: normalizedRow.year,
              trim: normalizedRow.trim || null,
              modelCode: normalizedRow.modelCode ?? null,
              condition: (normalizedRow.condition as VehicleCondition) || VehicleCondition.NEW,
              startDate: typeof normalizedRow.startDate === 'string'
                ? createEasternDate(normalizedRow.startDate)
                : normalizedRow.startDate,
              endDate: endDateVal,
              status,
              inventoryUrl: normalizedRow.inventoryUrl || null,
              imageUrl: normalizedRow.imageUrl || null,
              leasePayment: normalizedRow.leasePayment ?? null,
              leaseTerm: normalizedRow.leaseTerm ?? null,
              leaseMiles: normalizedRow.leaseMiles ?? null,
              dueAtSigning: normalizedRow.dueAtSigning ?? null,
              capCostReduction: normalizedRow.capCostReduction ?? null,
              grossCapCost: normalizedRow.grossCapCost ?? null,
              netCapCost: normalizedRow.netCapCost ?? null,
              securityDeposit: normalizedRow.securityDeposit ?? null,
              perExcessMile: normalizedRow.perExcessMile ?? null,
              acquisitionFee: normalizedRow.acquisitionFee ?? null,
              downPayment: normalizedRow.downPayment ?? null,
              msrp: normalizedRow.msrp ?? null,
              discount: normalizedRow.discount ?? null,
              buyFor: normalizedRow.buyFor ?? null,
              stockNumber: normalizedRow.stockNumber || null,
              offerType: toOfferType(normalizedRow.offerType),
              aprRate: finance.aprRate,
              aprTermMonths: finance.aprTermMonths,
              financeRates: finance.financeRates != null ? (finance.financeRates as Prisma.InputJsonValue) : undefined,
              rebateTotal: rebateTotalVal,
              customerCash: normalizedRow.customerCash ?? null,
              leaseCash: normalizedRow.leaseCash ?? null,
              aprCash: normalizedRow.aprCash ?? null,
              bonusCash: normalizedRow.bonusCash ?? null,
              disclaimer: normalizedRow.disclaimer || null,
              additionalNotes: normalizedRow.additionalNotes || null,
              validationIssues: validationIssues ? (validationIssues as any) : null,
              updatedBy: userId,
            },
          });
        }

        // Create snapshot object (Prisma will handle Date/Decimal serialization for Json fields)
        // We construct it explicitly to ensure all fields are included
        const snapshot = {
          storeCode: offerRecord.storeCode,
          storeCodes: offerRecord.storeCodes,
          externalId: offerRecord.externalId,
          make: offerRecord.make,
          model: offerRecord.model,
          series: offerRecord.series,
          year: offerRecord.year,
          trim: offerRecord.trim,
          modelCode: offerRecord.modelCode,
          condition: offerRecord.condition,
          startDate: offerRecord.startDate,
          endDate: offerRecord.endDate,
          acquisitionFee: offerRecord.acquisitionFee,
          downPayment: offerRecord.downPayment,
          stockNumber: offerRecord.stockNumber,
          status: offerRecord.status,
          inventoryUrl: offerRecord.inventoryUrl,
          imageUrl: offerRecord.imageUrl,
          leasePayment: offerRecord.leasePayment,
          leaseTerm: offerRecord.leaseTerm,
          leaseMiles: offerRecord.leaseMiles,
          dueAtSigning: offerRecord.dueAtSigning,
          capCostReduction: offerRecord.capCostReduction,
          grossCapCost: offerRecord.grossCapCost,
          netCapCost: offerRecord.netCapCost,
          securityDeposit: offerRecord.securityDeposit,
          perExcessMile: offerRecord.perExcessMile,
          msrp: offerRecord.msrp,
          discount: offerRecord.discount,
          buyFor: offerRecord.buyFor,
          offerType: offerRecord.offerType,
          aprRate: offerRecord.aprRate,
          aprTermMonths: offerRecord.aprTermMonths,
          financeRates: offerRecord.financeRates,
          rebateTotal: offerRecord.rebateTotal,
          customerCash: offerRecord.customerCash,
          leaseCash: offerRecord.leaseCash,
          aprCash: offerRecord.aprCash,
          bonusCash: offerRecord.bonusCash,
          disclaimer: offerRecord.disclaimer,
          additionalNotes: offerRecord.additionalNotes,
          validationIssues: offerRecord.validationIssues,
          updatedBy: offerRecord.updatedBy,
        };

        // Create initial version
        await tx.offerVersion.create({
          data: {
            offerId: offerRecord.id,
            versionNumber: 1,
            changedBy: userId,
            changeNote: 'Initial version',
            snapshot: snapshot as any,
          },
        });

        // Track results
        result.insertedRows++;
        if (status === OfferStatus.INACTIVE) {
          result.inactiveCount++;
          result.inactiveIds.push(offerRecord.id);
        }
      }
    }, { 
      timeout: 120000, // 2 minutes for large imports
      maxWait: 10000, // Wait up to 10 seconds for transaction to start
    });

    // Build issue summary
    result.issueSummary = Array.from(issueCodeCounts.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);

    result.success = result.insertedRows > 0;
  } catch (error) {
    console.error('Error importing offers:', error);
    result.failed.push({
      rowIndex: 0,
      errors: [{ field: 'general', message: 'Failed to import offers. Please check the file format and try again.' }],
    });
  }

  revalidatePath('/admin/offers');
  return result;
}

/**
 * Preview import file without actually importing
 * Returns parsed data with cell-level error mapping
 */
export interface PreviewResult {
  headers: string[];
  rows: Array<{
    rowIndex: number;
    rawData: Record<string, unknown>;
    cellErrors: Array<{ column: string; message: string }>;
    rowErrors: Array<{ field: string; message: string }>;
  }>;
  parseErrors: Array<{ rowIndex: number; errors: Array<{ field: string; message: string }> }>;
  skippedCount: number;
  skipReasons: Record<string, number>;
}

export async function previewImportFile(formData: FormData): Promise<PreviewResult> {
  await requireAdmin();

  const file = formData.get('file') as File | null;
  if (!file || !(file instanceof File) || file.size === 0) {
    return {
      headers: [],
      rows: [],
      parseErrors: [{ rowIndex: 0, errors: [{ field: 'file', message: 'Please select an XLSX or CSV file' }] }],
      skippedCount: 0,
      skipReasons: {},
    };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      headers: [],
      rows: [],
      parseErrors: [{
        rowIndex: 0,
        errors: [{ field: 'file', message: `File exceeds ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit` }],
      }],
      skippedCount: 0,
      skipReasons: {},
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { headers, rows, errors: parseErrors } = parseSpreadsheetToOffers(buffer);

  // Read raw data for display
  const wb = XLSX.read(buffer, { type: 'buffer', raw: false, cellDates: false });
  const first = wb.SheetNames[0];
  if (!first) {
    return {
      headers: [],
      rows: [],
      parseErrors: [{ rowIndex: 0, errors: [{ field: 'general', message: 'Workbook has no sheets' }] }],
      skippedCount: 0,
      skipReasons: {},
    };
  }
  const sheet = wb.Sheets[first];
  const rawJson = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });

  // Map field names to column names by reading the parsed result
  // We need to match headers to fields using the same logic as parseSpreadsheetToOffers
  const fieldToColumn = new Map<keyof OfferInput, string>();
  
  // Import the HEADER_TO_FIELD mapping logic
  const HEADER_TO_FIELD: Record<string, keyof OfferInput> = {
    storecode: 'storeCode',
    store: 'storeCode',
    make: 'make',
    model: 'model',
    series: 'series',
    year: 'year',
    trim: 'trim',
    modelcode: 'modelCode',
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

  for (const header of headers) {
    const normalized = header.toLowerCase().replace(/[\s_\-\.]/g, '');
    const field = HEADER_TO_FIELD[normalized];
    if (field) {
      fieldToColumn.set(field, header);
    }
  }

  // Build preview rows with cell-level errors
  const previewRows = rawJson.map((rawData, index) => {
    const rowIndex = index + 2; // 1-based + header row
    const parsedRow = rows.find(r => r.rowIndex === rowIndex);
    const parseError = parseErrors.find(e => e.rowIndex === rowIndex);

    const cellErrors: Array<{ column: string; message: string }> = [];
    const rowErrors: Array<{ field: string; message: string }> = [];

    // Map parse errors to cells
    if (parseError) {
      for (const error of parseError.errors) {
        const column = fieldToColumn.get(error.field as keyof OfferInput) || error.field;
        cellErrors.push({ column, message: error.message });
        rowErrors.push(error);
      }
    }

    // Validate parsed offer if it exists (use import validator for preview)
    if (parsedRow?.offer) {
      const validation = validateOfferImport(parsedRow.offer);
      if (validation.issues.length > 0) {
        for (const issue of validation.issues) {
          const column = fieldToColumn.get(issue.field as keyof OfferInput) || issue.field || 'general';
          if (!cellErrors.find(e => e.column === column)) {
            cellErrors.push({ column, message: issue.message });
          }
          rowErrors.push({ field: issue.field || 'general', message: issue.message });
        }
      }
    }

    // Ensure rawData is a deeply plain JSON-serializable object.
    // XLSX may return objects with hidden metadata on the prototype chain, so we
    // round‑trip through JSON to strip any non-plain structure before crossing
    // the server → client boundary.
    const safeRawData: Record<string, unknown> = JSON.parse(JSON.stringify(rawData));

    return {
      rowIndex,
      rawData: safeRawData,
      cellErrors,
      rowErrors,
    };
  });

  const skipReasons: Record<string, number> = {};
  for (const row of previewRows) {
    if (row.rowErrors.length === 0) continue;
    for (const err of row.rowErrors) {
      const key = (err.field || 'general').trim() || 'general';
      skipReasons[key] = (skipReasons[key] ?? 0) + 1;
    }
  }
  const skippedCount = previewRows.filter((row) => row.rowErrors.length > 0).length;

  return {
    headers,
    rows: previewRows,
    parseErrors,
    skippedCount,
    skipReasons,
  };
}

/**
 * Generate XLSX import template with all fields and 4 example rows
 * Returns base64 encoded buffer for client-side download
 */
export async function generateImportTemplate(): Promise<string> {
  await requireAdmin();

  const headers = [...OFFERS_TABLE_COLUMN_ORDER];

  const examples: Array<Record<string, unknown>> = [
    {
      // Example row 1: NEW vehicle with lease
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
    },
    {
      // Example row 2: NEW vehicle with buy
      status: 'LIVE',
      storeCode: 'TOY',
      stockNumber: 'ST12346',
      condition: 'NEW',
      year: 2025,
      make: '',
      model: 'RAV4',
      trim: 'XLE',
      msrp: 30000,
      offerType: 'Cash',
      discount: 1500,
      buyFor: 28500,
      customerCash: 1000,
      rebateTotal: 2000,
      disclaimer: 'See dealer for details',
      inventoryUrl: 'https://example.com/vehicle/2',
      imageUrl: 'https://example.com/images/rav4.jpg',
      additionalNotes: 'Limited time offer',
      startDate: '2025-01-01',
      endDate: '2025-01-31',
    },
    {
      // Example row 3: USED vehicle (shows make requirement)
      status: 'INACTIVE',
      storeCode: 'TOY',
      stockNumber: 'ST12347',
      condition: 'USED',
      year: 2023,
      make: 'Honda',
      model: 'Accord',
      trim: 'EX',
      msrp: 25000,
      offerType: 'Cash',
      buyFor: 23500,
      inventoryUrl: 'https://example.com/vehicle/3',
      imageUrl: 'https://example.com/images/accord.jpg',
      additionalNotes: 'Certified pre-owned',
      startDate: '2025-01-01',
      endDate: '2025-01-31',
    },
    {
      // Example row 4: Mixed offer (both lease and buy)
      status: 'LIVE',
      storeCode: 'BMW',
      stockNumber: 'ST12348',
      condition: 'NEW',
      year: 2025,
      make: '',
      model: '330i',
      series: '3 Series',
      trim: 'xDrive',
      msrp: 45000,
      offerType: 'Lease',
      leasePayment: 499,
      leaseTerm: 36,
      leaseMiles: 10000,
      downPayment: 0,
      dueAtSigning: 3000,
      acquisitionFee: 925,
      aprRate: 2.9,
      aprTermMonths: 60,
      discount: 2000,
      buyFor: 43000,
      customerCash: 500,
      leaseCash: 750,
      aprCash: 1000,
      bonusCash: 250,
      rebateTotal: 1500,
      disclaimer: 'Financing available',
      inventoryUrl: 'https://example.com/vehicle/4',
      imageUrl: 'https://example.com/images/3series.jpg',
      additionalNotes: 'Lease or buy options available',
      startDate: '2025-01-01',
      endDate: '2025-01-31',
    },
  ];

  const rows = examples.map((row) =>
    headers.map((h) => {
      const v = (row as any)[h];
      return v === undefined || v === null ? '' : v;
    }),
  );

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

  // Set column widths
  const colWidths = headers.map(() => ({ wch: 15 }));
  ws['!cols'] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, 'Offers');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // Convert buffer to base64 for serialization
  return buffer.toString('base64');
}

/**
 * Updates an existing offer
 */
export async function updateOffer(id: string, data: OfferInput): Promise<ActionResult> {
  try {
    const userId = await requireAdmin();

    // Validate (use domain validator for edit flow)
    const validation = validateOfferDomain(data);
    if (!validation.valid) {
      return {
        success: false,
        errors: validation.errors,
      };
    }

    const makeVal =
      data.condition === VehicleCondition.USED
        ? (data.make?.trim() || null)
        : (data.make?.trim() || getMakeForStoreCode(data.storeCode) || null);

    let acquisitionFeeValUpdate = data.acquisitionFee ?? null;
    if (acquisitionFeeValUpdate == null) {
      const defaultAcq = getDefaultAcquisitionFee(data.storeCode);
      if (defaultAcq != null) acquisitionFeeValUpdate = defaultAcq;
    }

    const rebateTotalVal = computeRebateTotal(data) ?? data.rebateTotal ?? null;

    const todayStart = getTodayEasternStart();
    const endDateVal = typeof data.endDate === 'string' ? createEasternDate(data.endDate) : data.endDate;
    const status = normalizeOfferStatus(data.status as OfferStatus | string | null | undefined, endDateVal, todayStart);

    const finance = financeRatesPayload(data);
    const { disclaimer, disclaimerSource } = resolveDisclaimerOnSave(data, finance);
    const storeCodesUpdate = data.storeCodes?.length ? data.storeCodes : [data.storeCode];
    await prisma.offer.update({
      where: { id },
      data: {
        storeCode: data.storeCode,
        storeCodes: storeCodesUpdate,
        make: makeVal,
        model: data.model,
        series: data.series ?? null,
        year: yearForOffer(data),
        trim: data.trim || null,
        modelCode: data.modelCode ?? null,
        fuelType: data.fuelType ?? null,
        condition: (data.condition as VehicleCondition) || VehicleCondition.NEW,
        startDate: typeof data.startDate === 'string' 
          ? createEasternDate(data.startDate)
          : data.startDate,
        endDate: endDateVal,
        status: status as OfferStatus,
        inventoryUrl: data.inventoryUrl || buildInventoryUrl(data.storeCode, data.model) || null,
        imageUrl: data.imageUrl || buildImageUrl(makeVal, data.model, yearForOffer(data)) || null,
        leasePayment: data.leasePayment ?? null,
        leaseTerm: data.leaseTerm ?? null,
        leaseMiles: data.leaseMiles ?? null,
        dueAtSigning: data.dueAtSigning ?? null,
        capCostReduction: data.capCostReduction ?? null,
        grossCapCost: data.grossCapCost ?? null,
        netCapCost: data.netCapCost ?? null,
        securityDeposit: data.securityDeposit ?? null,
        perExcessMile: data.perExcessMile ?? null,
        acquisitionFee: acquisitionFeeValUpdate,
        downPayment: data.downPayment ?? null,
        msrp: data.msrp ?? null,
        discount: data.discount ?? null,
        buyFor: data.buyFor ?? null,
        stockNumber: data.stockNumber || null,
        offerType: toOfferType(data.offerType),
        aprRate: finance.aprRate,
        aprTermMonths: finance.aprTermMonths,
        financeRates: finance.financeRates != null ? (finance.financeRates as Prisma.InputJsonValue) : undefined,
        rebateTotal: rebateTotalVal,
        customerCash: data.customerCash ?? null,
        leaseCash: data.leaseCash ?? null,
        aprCash: data.aprCash ?? null,
        bonusCash: data.bonusCash ?? null,
        disclaimer,
        disclaimerSource,
        additionalNotes: data.additionalNotes || null,
        // Note: validationIssues are preserved until edited/resolved explicitly.
        updatedBy: userId,
      },
    });

    // Create new version
    await createOfferVersion(id, userId);

    revalidatePath('/admin/offers');
    revalidatePath(`/admin/offers/${id}`);
    return {
      success: true,
    };
  } catch (error) {
    console.error('Error updating offer:', error);
    return {
      success: false,
      errors: [{ field: 'general', message: 'Failed to update offer' }],
    };
  }
}

/**
 * Updates only the additionalNotes field for an offer (e.g. from detail page inline edit).
 */
export async function updateOfferAdditionalNotes(offerId: string, value: string | null): Promise<ActionResult> {
  try {
    const userId = await requireAdmin();
    await prisma.offer.update({
      where: { id: offerId },
      data: {
        additionalNotes: value?.trim() || null,
        updatedBy: userId,
      },
    });
    await createOfferVersion(offerId, userId, 'Updated additional notes');
    revalidatePath('/admin/offers');
    revalidatePath(`/admin/offers/${offerId}`);
    return { success: true };
  } catch (error) {
    console.error('Error updating additional notes:', error);
    return {
      success: false,
      errors: [{ field: 'general', message: 'Failed to update additional notes' }],
    };
  }
}

/**
 * Toggles offer status between INACTIVE and LIVE
 */
export async function toggleOfferStatus(id: string): Promise<ActionResult> {
  try {
    const userId = await requireAdmin();

    const offer = await prisma.offer.findUnique({
      where: { id },
      select: { status: true, endDate: true },
    });

    if (!offer) {
      return {
        success: false,
        errors: [{ field: 'general', message: 'Offer not found' }],
      };
    }

    const newStatus =
      offer.endDate < getTodayEasternStart()
        ? OfferStatus.INACTIVE
        : offer.status === OfferStatus.LIVE
          ? OfferStatus.INACTIVE
          : OfferStatus.LIVE;

    await prisma.offer.update({
      where: { id },
      data: {
        status: newStatus,
        updatedBy: userId,
      },
    });

    // Create version
    await createOfferVersion(id, userId, `Status changed to ${newStatus}`);

    revalidatePath('/admin/offers');
    revalidatePath(`/admin/offers/${id}`);
    return {
      success: true,
    };
  } catch (error) {
    console.error('Error toggling offer status:', error);
    return {
      success: false,
      errors: [{ field: 'general', message: 'Failed to toggle offer status' }],
    };
  }
}

/**
 * Deletes multiple offers by ID. Offer versions are removed via cascade.
 */
export async function bulkDeleteOffers(ids: string[]): Promise<ActionResult> {
  try {
    await requireAdmin();
    const settings = await getSettings();
    if (!settings.allowBulkDelete) {
      return {
        success: false,
        errors: [{ field: 'general', message: 'Bulk delete is disabled in Settings' }],
      };
    }

    if (!ids || ids.length === 0) {
      return {
        success: false,
        errors: [{ field: 'general', message: 'No offers selected' }],
      };
    }

    const todayStart = getTodayEasternStart();
    const expandedIdList = await expandCertifiedFinanceCollectionIds(ids, todayStart);
    if (expandedIdList.length === 0) {
      return {
        success: false,
        errors: [{ field: 'general', message: 'No matching offers were found' }],
      };
    }

    const result = await prisma.offer.deleteMany({
      where: { id: { in: expandedIdList } },
    });

    revalidatePath('/admin/offers');
    return {
      success: true,
      data: { deletedCount: result.count } as any,
    };
  } catch (error) {
    console.error('Error bulk deleting offers:', error);
    return {
      success: false,
      errors: [{ field: 'general', message: 'Failed to delete offers' }],
    };
  }
}

/**
 * Updates status for multiple offers at once
 */
export async function bulkUpdateOfferStatus(ids: string[], status: OfferStatus): Promise<ActionResult> {
  try {
    const userId = await requireAdmin();
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));

    if (uniqueIds.length === 0) {
      return {
        success: false,
        errors: [{ field: 'general', message: 'No offers selected' }],
      };
    }

    const todayStart = getTodayEasternStart();
    const expandedIdList = await expandCertifiedFinanceCollectionIds(uniqueIds, todayStart);
    const expandedOffers = await prisma.offer.findMany({
      where: { id: { in: expandedIdList } },
      select: { id: true, endDate: true },
    });

    if (expandedOffers.length === 0) {
      return {
        success: false,
        errors: [{ field: 'general', message: 'No matching offers were found' }],
      };
    }

    const finalIds = expandedOffers.map((o) => o.id);

    const finalStatusById = new Map<string, OfferStatus>();
    for (const offer of expandedOffers) {
      const finalStatus = offer.endDate < todayStart ? OfferStatus.INACTIVE : status;
      finalStatusById.set(offer.id, finalStatus);
    }
    const liveIds = finalIds.filter((id) => finalStatusById.get(id) === OfferStatus.LIVE);
    const inactiveIds = finalIds.filter((id) => finalStatusById.get(id) === OfferStatus.INACTIVE);

    // Update all offers and create versions atomically
    await prisma.$transaction(async (tx) => {
      if (liveIds.length > 0) {
        await tx.offer.updateMany({
          where: { id: { in: liveIds } },
          data: {
            status: OfferStatus.LIVE,
            updatedBy: userId,
          },
        });
      }
      if (inactiveIds.length > 0) {
        await tx.offer.updateMany({
          where: { id: { in: inactiveIds } },
          data: {
            status: OfferStatus.INACTIVE,
            updatedBy: userId,
          },
        });
      }

      // Snapshot each offer and create a version record within the same transaction
      for (const id of finalIds) {
        const offer = await tx.offer.findUnique({ where: { id } });
        if (!offer) throw new Error(`Offer ${id} not found`);

        const maxVersion = await tx.offerVersion.findFirst({
          where: { offerId: id },
          orderBy: { versionNumber: 'desc' },
          select: { versionNumber: true },
        });

        await tx.offerVersion.create({
          data: {
            offerId: id,
            versionNumber: (maxVersion?.versionNumber ?? 0) + 1,
            changedBy: userId,
            changeNote: `Status changed to ${finalStatusById.get(id)} (bulk update)`,
            snapshot: {
              storeCode: offer.storeCode,
              storeCodes: offer.storeCodes,
              externalId: offer.externalId,
              make: offer.make,
              model: offer.model,
              series: offer.series,
              year: offer.year,
              trim: offer.trim,
              modelCode: offer.modelCode,
              condition: offer.condition,
              startDate: offer.startDate,
              endDate: offer.endDate,
              acquisitionFee: offer.acquisitionFee,
              downPayment: offer.downPayment,
              stockNumber: offer.stockNumber,
              status: offer.status,
              inventoryUrl: offer.inventoryUrl,
              imageUrl: offer.imageUrl,
              leasePayment: offer.leasePayment,
              leaseTerm: offer.leaseTerm,
              leaseMiles: offer.leaseMiles,
              dueAtSigning: offer.dueAtSigning,
              capCostReduction: offer.capCostReduction,
              grossCapCost: offer.grossCapCost,
              netCapCost: offer.netCapCost,
              securityDeposit: offer.securityDeposit,
              perExcessMile: offer.perExcessMile,
              msrp: offer.msrp,
              discount: offer.discount,
              buyFor: offer.buyFor,
              offerType: offer.offerType,
              aprRate: offer.aprRate,
              aprTermMonths: offer.aprTermMonths,
              financeRates: offer.financeRates,
              rebateTotal: offer.rebateTotal,
              customerCash: offer.customerCash,
              leaseCash: offer.leaseCash,
              aprCash: offer.aprCash,
              bonusCash: offer.bonusCash,
              disclaimer: offer.disclaimer,
              additionalNotes: offer.additionalNotes,
              validationIssues: offer.validationIssues,
              updatedBy: offer.updatedBy,
            },
          },
        });
      }
    }, {
      timeout: 120000,
      maxWait: 10000,
    });

    revalidatePath('/admin/offers');
    return {
      success: true,
    };
  } catch (error) {
    console.error('Error bulk updating offer status:', error);
    const message = error instanceof Error ? error.message : 'Failed to update offer status';
    return {
      success: false,
      errors: [{ field: 'general', message }],
    };
  }
}

/**
 * Restores an offer from a version snapshot
 */
export async function restoreOfferVersion(offerId: string, versionId: string): Promise<ActionResult> {
  try {
    const userId = await requireAdmin();

    const version = await prisma.offerVersion.findUnique({
      where: { id: versionId },
    });

    if (!version || version.offerId !== offerId) {
      return {
        success: false,
        errors: [{ field: 'general', message: 'Version not found' }],
      };
    }

    const snapshot = version.snapshot as any;

    await prisma.offer.update({
      where: { id: offerId },
      data: {
        storeCode: snapshot.storeCode,
        storeCodes: snapshot.storeCodes ?? [],
        make: snapshot.make,
        model: snapshot.model,
        year: snapshot.year,
        trim: snapshot.trim,
        modelCode: snapshot.modelCode ?? null,
        condition: (snapshot.condition as VehicleCondition) || VehicleCondition.NEW,
        startDate: new Date(snapshot.startDate),
        endDate: new Date(snapshot.endDate),
        status: snapshot.status,
        inventoryUrl: snapshot.inventoryUrl,
        imageUrl: snapshot.imageUrl,
        leasePayment: snapshot.leasePayment,
        leaseTerm: snapshot.leaseTerm,
        leaseMiles: snapshot.leaseMiles,
        dueAtSigning: snapshot.dueAtSigning,
        capCostReduction: snapshot.capCostReduction ?? null,
        grossCapCost: snapshot.grossCapCost ?? null,
        netCapCost: snapshot.netCapCost ?? null,
        securityDeposit: snapshot.securityDeposit ?? null,
        perExcessMile: snapshot.perExcessMile ?? null,
        acquisitionFee: snapshot.acquisitionFee ?? null,
        downPayment: snapshot.downPayment ?? null,
        msrp: snapshot.msrp,
        discount: snapshot.discount,
        buyFor: snapshot.buyFor,
        stockNumber: snapshot.stockNumber ?? null,
        offerType: snapshot.offerType ?? null,
        aprRate: snapshot.aprRate ?? null,
        aprTermMonths: snapshot.aprTermMonths ?? null,
        financeRates: snapshot.financeRates ?? null,
        rebateTotal: snapshot.rebateTotal ?? null,
        customerCash: snapshot.customerCash ?? null,
        leaseCash: snapshot.leaseCash ?? null,
        aprCash: snapshot.aprCash ?? null,
        bonusCash: snapshot.bonusCash ?? null,
        disclaimer: snapshot.disclaimer ?? null,
        additionalNotes: snapshot.additionalNotes ?? null,
        updatedBy: userId,
      },
    });

    // Create new version with restore note
    await createOfferVersion(offerId, userId, `Restore v${version.versionNumber}`);

    revalidatePath('/admin/offers');
    revalidatePath(`/admin/offers/${offerId}`);
    revalidatePath(`/admin/offers/${offerId}/history`);
    return {
      success: true,
    };
  } catch (error) {
    console.error('Error restoring offer version:', error);
    return {
      success: false,
      errors: [{ field: 'general', message: 'Failed to restore offer version' }],
    };
  }
}

  const SORT_FIELDS = ['updatedAt', 'endDate', 'startDate', 'make', 'model', 'series', 'modelCode', 'year', 'storeCode', 'status', 'condition', 'trim', 'offerType', 'rebateTotal'] as const;

/**
 * Gets offers with filters
 */
export async function getOffers(filters: {
  storeCode?: string;
  status?: OfferStatus;
  condition?: VehicleCondition;
  offerType?: OfferTypeEnum;
  search?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  includeArchived?: boolean;
  hasIssues?: boolean;
}) {
  await requireUserId();

  const where: any = {};

  if (filters.storeCode) {
    where.OR = [
      { storeCode: filters.storeCode },
      { storeCodes: { has: filters.storeCode } },
    ];
  }
  if (filters.status) where.status = filters.status;
  if (filters.condition) where.condition = filters.condition;
  if (filters.offerType) where.offerType = filters.offerType;
  if (filters.hasIssues) {
    where.validationIssues = { not: Prisma.JsonNull };
  }

  // Exclude archived offers (endDate < today) unless explicitly included
  // Compare using Eastern Time to match how dates are stored
  if (!filters.includeArchived) {
    const now = new Date();
    const todayEasternStr = formatEasternDate(now);
    const todayStart = createEasternDate(todayEasternStr);
    where.endDate = { gte: todayStart };
  }

  if (filters.search) {
    where.OR = [
      { make: { contains: filters.search, mode: 'insensitive' } },
      { model: { contains: filters.search, mode: 'insensitive' } },
      { trim: { contains: filters.search, mode: 'insensitive' } },
    ];
  }

  if (filters.dateFrom || filters.dateTo) {
    where.OR = [
      ...(where.OR || []),
      {
        AND: [
          filters.dateFrom ? { startDate: { lte: filters.dateTo } } : {},
          filters.dateTo ? { endDate: { gte: filters.dateFrom } } : {},
        ].filter(obj => Object.keys(obj).length > 0),
      },
    ];
  }

  type SortField = (typeof SORT_FIELDS)[number];
  const by: SortField = SORT_FIELDS.includes(filters.sortBy as SortField) ? (filters.sortBy as SortField) : 'updatedAt';
  const order = filters.sortOrder === 'asc' ? ('asc' as const) : ('desc' as const);

  const offers = await prisma.offer.findMany({
    where,
    orderBy: [{ [by]: order }] as { [K in SortField]?: 'asc' | 'desc' }[],
  });

  return offers;
}

/** Retry once on connection/termination errors (e.g. serverless cold start). */
async function withConnectionRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/connection terminated|ECONNRESET|connection closed|Connection terminated unexpectedly/i.test(msg)) {
      await new Promise((r) => setTimeout(r, 100));
      return await fn();
    }
    throw e;
  }
}

/**
 * Gets archived offers (endDate < today)
 */
export async function getArchivedOffers(filters?: { sortBy?: string; sortOrder?: 'asc' | 'desc' }) {
  await requireUserId();

  // Get today's date in Eastern Time
  const now = new Date();
  const todayEasternStr = formatEasternDate(now);
  const todayStart = createEasternDate(todayEasternStr);

  type SortField = (typeof SORT_FIELDS)[number];
  const by: SortField = SORT_FIELDS.includes(filters?.sortBy as SortField) ? (filters!.sortBy as SortField) : 'endDate';
  const order = filters?.sortOrder === 'asc' ? ('asc' as const) : ('desc' as const);

  const offers = await withConnectionRetry(() =>
    prisma.offer.findMany({
      where: {
        endDate: { lt: todayStart },
      },
      orderBy: [{ [by]: order }] as { [K in SortField]?: 'asc' | 'desc' }[],
    })
  );

  return offers;
}

/**
 * Deletes all archived offers (endDate < today). Returns result from bulkDeleteOffers.
 */
export async function clearArchivedOffers(): Promise<ActionResult> {
  await requireAdmin();

  const now = new Date();
  const todayEasternStr = formatEasternDate(now);
  const todayStart = createEasternDate(todayEasternStr);

  const archived = await prisma.offer.findMany({
    where: { endDate: { lt: todayStart } },
    select: { id: true },
  });
  const ids = archived.map((o) => o.id);
  if (ids.length === 0) {
    revalidatePath('/admin/offers');
    return { success: true, data: { deletedCount: 0 } as any };
  }
  return bulkDeleteOffers(ids);
}

/**
 * Deletes all offers that are not currently LIVE (i.e. status != LIVE).
 * Offer versions are removed via cascade.
 */
export async function clearNonLiveOffers(): Promise<ActionResult> {
  await requireAdmin();

  const result = await prisma.offer.deleteMany({
    where: {
      status: { not: OfferStatus.LIVE },
    },
  });

  revalidatePath('/admin/offers');
  return {
    success: true,
    data: { deletedCount: result.count } as any,
  };
}

/**
 * Gets a single offer by ID
 */
export async function getOffer(id: string) {
  const userId = await requireUserId(); // Ensure authenticated

  const offer = await prisma.offer.findUnique({
    where: { id },
  });

  return offer;
}

function formatYearRanges(years: number[]): string {
  if (years.length === 0) return '';
  const sorted = Array.from(new Set(years)).sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0]!;
  let prev = sorted[0]!;
  for (let i = 1; i < sorted.length; i++) {
    const y = sorted[i]!;
    if (y === prev + 1) {
      prev = y;
      continue;
    }
    parts.push(start === prev ? String(start) : `${start}-${prev}`);
    start = y;
    prev = y;
  }
  parts.push(start === prev ? String(start) : `${start}-${prev}`);
  return parts.join(', ');
}

export async function getCertifiedQualifyingModelYears(params: {
  storeCode: string;
  storeCodes?: string[] | null;
  make?: string | null;
  model: string;
}): Promise<string> {
  await requireUserId();

  const scopeCodes = (params.storeCodes && params.storeCodes.length > 0)
    ? params.storeCodes
    : [params.storeCode];

  const rows = await prisma.offer.findMany({
    where: {
      condition: VehicleCondition.CERTIFIED,
      offerType: OfferTypeEnum.Finance,
      model: params.model,
      ...(params.make != null ? { make: params.make } : {}),
      OR: [
        { storeCode: { in: scopeCodes } },
        { storeCodes: { hasSome: scopeCodes } },
      ],
      year: { not: null },
    },
    select: { year: true },
  });

  const years = rows
    .map((r) => r.year)
    .filter((y): y is number => typeof y === 'number');

  return formatYearRanges(years);
}

/**
 * Gets version history for an offer
 */
export async function getOfferVersions(offerId: string) {
  const userId = await requireUserId(); // Ensure authenticated

  const versions = await prisma.offerVersion.findMany({
    where: { offerId },
    orderBy: { versionNumber: 'desc' },
  });

  return versions;
}

/**
 * Dashboard: counts and recently edited offers.
 * Uses 2 queries: one groupBy for counts (draft, live, total), one findMany for recent.
 */
export async function getDashboardData() {
  await requireUserId();

  const [statusCounts, recent, liveCertifiedFinance] = await Promise.all([
    prisma.offer.groupBy({
      by: ['status'],
      _count: { id: true },
    }),
    prisma.offer.findMany({
      take: 8,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        trim: true,
        condition: true,
        status: true,
        storeCode: true,
        endDate: true,
        updatedAt: true,
        leasePayment: true,
        leaseTerm: true,
        leaseMiles: true,
        dueAtSigning: true,
        capCostReduction: true,
        msrp: true,
        discount: true,
        buyFor: true,
        offerType: true,
        aprRate: true,
        aprTermMonths: true,
        financeRates: true,
      },
    }),
    // Certified finance offers with the same rate/term for a given model/series
    // should be counted once in the dashboard "offers" tally.
    prisma.offer.findMany({
      where: {
        status: OfferStatus.LIVE,
        condition: VehicleCondition.CERTIFIED,
        offerType: OfferTypeEnum.Finance,
      },
      select: {
        storeCode: true,
        make: true,
        model: true,
        series: true,
        trim: true,
        aprRate: true,
        aprTermMonths: true,
      },
    }),
  ]);

  let live = 0;
  let inactive = 0;
  for (const row of statusCounts) {
    if (row.status === OfferStatus.LIVE) live = row._count.id;
    else if (row.status === OfferStatus.INACTIVE) inactive = row._count.id;
  }

  // Adjust LIVE count so multiple certified finance offers (e.g. 2020–2026 3 Series)
  // with the same APR/term are only counted once per logical model/series.
  const { duplicated: duplicatedCf } = dedupeCertifiedFinanceCount(liveCertifiedFinance);

  const adjustedLive = live - duplicatedCf;
  const total = inactive + adjustedLive;

  return { total, inactive, live: adjustedLive, recent };
}
