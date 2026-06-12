import { prisma } from '@/lib/prisma';
import { OfferStatus, OfferTypeEnum, Prisma, VehicleCondition } from '@prisma/client';
import { createEasternDate, formatEasternDate } from '@/lib/utils/dates';
import { dedupeCertifiedFinanceCount } from '@/lib/domain/dashboard/dedupe';
import fs from 'fs';
import path from 'path';
import { DASHBOARD_STORE_ALL, type DashboardStoreFilter } from '@/lib/dashboard/filters';
import { STORE_CODES, type StoreCode } from '@/lib/config/stores';
import { slugify } from '@/lib/model-page-generator/slug';

type KnownOfferTypeBucket = 'Lease' | 'Finance' | 'CashOrOther';

export type CoverageCellStatus = 'OK' | 'MISSING' | 'EXPIRING_SOON';

export type AssetStatus = 'missing' | 'placeholder' | 'live' | 'error';

export interface AssetStatusInfo {
  path?: string;
  /**
   * Fully-resolved URL for this asset/page, when available.
   * Used by the admin UI for copy/open interactions.
   */
  url?: string;
  /**
   * Optional human-readable note about why this asset is considered
   * placeholder, live, or error (e.g. "default URL only", "malformed config").
   */
  note?: string;
  /**
   * Reserved for future cached health checks (e.g. nightly HEAD requests
   * against R2 or model page URLs). Not currently populated.
   */
  lastCheckedAt?: Date | null;
  lastCheckStatus?: 'ok' | 'not_found' | 'unknown';
}

export interface OfferCoverageCell {
  model: string;
  year: number | null;
  offerType: KnownOfferTypeBucket;
  liveCount: number;
  inactiveCount: number;
  earliestEndDate: Date | null;
  status: CoverageCellStatus;
}

export interface OfferCoverageSummary {
  cells: OfferCoverageCell[];
}

export interface SimpleOfferSummary {
  id: string;
  model: string;
  year: number | null;
  trim: string | null;
  condition: string;
  status: OfferStatus;
  offerType: OfferTypeEnum | null;
  storeCode: string;
  endDate: Date;
  updatedAt: Date;
  leasePayment: number | null;
  aprRate: number | null;
  rebateTotal: number | null;
}

export interface ExpiringAndRecentSummary {
  expiringSoon: SimpleOfferSummary[];
  recentlyUpdated: SimpleOfferSummary[];
}

export interface ValidationCategoryCount {
  code: string;
  count: number;
}

export interface ValidationSummary {
  totalWithValidationIssues: number;
  newIssuesLastNDays: number;
  averageAgeDays: number | null;
  categories: ValidationCategoryCount[];
}

export interface IngestionRunSummary {
  runId: string;
  success: boolean;
  inserted: number;
  updated: number;
  inactivated: number;
  skippedCashOnly: number;
  byOfferType: { Lease: number; Finance: number; Other: number };
  rawOfferCount: number;
  normalizedCount: number;
  dedupedCount: number;
  errorCount: number;
}

type AssetHealthStatus = 'ok' | 'not_found' | 'error';

interface AssetHealthEntry {
  model: string;
  assetType: 'hero' | 'vehicle' | 'modelPage';
  url: string;
  status: AssetHealthStatus;
  httpStatus?: number;
  checkedAt: string;
}

interface AssetHealthFile {
  brand: ModelCoverageBrand;
  year: number;
  baseUrl: string;
  generatedAt: string;
  entries: AssetHealthEntry[];
}

export interface ModelAssetCoverageRow {
  model: string;
  year: number;
  /**
   * Backwards-compatible booleans used by existing UI.
   * These are derived from the richer status fields below.
   */
  hasModelPage: boolean;
  hasHeroImage: boolean;
  hasVehicleImage: boolean;
  hasOffers: boolean;
  hasLeaseOffer: boolean;
  hasFinanceOffer: boolean;
  hasCashOrOtherOffer: boolean;
  leaseOfferText: string | null;
  financeOfferText: string | null;
  cashOrOtherOfferText: string | null;
  /**
   * Richer asset/page status used by the dashboard widget.
   */
  modelPageStatus: AssetStatus;
  heroImageStatus: AssetStatus;
  vehicleImageStatus: AssetStatus;
  modelPageInfo?: AssetStatusInfo;
  heroImageInfo?: AssetStatusInfo;
  vehicleImageInfo?: AssetStatusInfo;
}

export interface OfferOutlier {
  id: string;
  model: string;
  year: number | null;
  offerType: OfferTypeEnum | null;
  status: OfferStatus;
  leasePayment: number | null;
  aprRate: number | null;
  rebateTotal: number | null;
  reasons: string[];
}

type TimeRange = '7d' | '30d' | '90d';

function normalizeStoreCode(store: string | undefined): StoreCode {
  if (!store) return 'TOY';
  if ((STORE_CODES as readonly string[]).includes(store)) return store as StoreCode;
  return 'TOY';
}

function resolveDashboardStoreFilter(store: string | undefined): DashboardStoreFilter {
  if (!store || store === DASHBOARD_STORE_ALL) return DASHBOARD_STORE_ALL;
  if ((STORE_CODES as readonly string[]).includes(store)) return store as StoreCode;
  return DASHBOARD_STORE_ALL;
}

function storeFilterWhere(store: string | undefined) {
  const filter = resolveDashboardStoreFilter(store);
  if (filter === DASHBOARD_STORE_ALL) return {};
  return {
    OR: [{ storeCode: filter }, { storeCodes: { has: filter } }],
  };
}

function getExpiringDays(range: TimeRange): number {
  if (range === '7d') return 7;
  if (range === '90d') return 30;
  return 14;
}

function getRecentDays(range: TimeRange): number {
  if (range === '7d') return 7;
  if (range === '90d') return 90;
  return 30;
}

function toBucket(offerType: OfferTypeEnum | null): KnownOfferTypeBucket {
  if (offerType === OfferTypeEnum.Lease) return 'Lease';
  if (offerType === OfferTypeEnum.Finance) return 'Finance';
  return 'CashOrOther';
}

/**
 * Offer coverage summary by model/year and offer type for a store.
 * Includes expected Toyota models for the given year when storeCode = TOY.
 */
export async function getOfferCoverageSummary(input: {
  storeCode?: string;
  year?: number;
}): Promise<OfferCoverageSummary> {
  const storeCode = normalizeStoreCode(input.storeCode);
  const targetYear = input.year ?? null;

  const now = new Date();
  const today = new Date(now.toISOString().slice(0, 10));

  const offers = await prisma.offer.findMany({
    where: {
      AND: [
        {
          OR: [
            { storeCode },
            { storeCodes: { has: storeCode } },
          ],
        },
        {
          status: {
            in: [OfferStatus.LIVE, OfferStatus.INACTIVE],
          },
        },
        targetYear != null ? { year: targetYear } : {},
      ],
    },
    select: {
      model: true,
      year: true,
      offerType: true,
      status: true,
      endDate: true,
    },
  });

  const expiringThresholdDays = 14;
  const expiringCutoff = new Date(today);
  expiringCutoff.setDate(expiringCutoff.getDate() + expiringThresholdDays);

  const cellsMap = new Map<string, OfferCoverageCell>();

  for (const offer of offers) {
    const model = (offer.model ?? '').trim();
    if (!model) continue;
    const year = offer.year ?? null;
    const bucket = toBucket(offer.offerType ?? null);
    const key = `${model}::${year ?? ''}::${bucket}`;

    let cell = cellsMap.get(key);
    if (!cell) {
      cell = {
        model,
        year,
        offerType: bucket,
        liveCount: 0,
        inactiveCount: 0,
        earliestEndDate: null,
        status: 'MISSING',
      };
      cellsMap.set(key, cell);
    }

    if (offer.status === OfferStatus.LIVE) cell.liveCount += 1;
    else if (offer.status === OfferStatus.INACTIVE) cell.inactiveCount += 1;

    if (offer.endDate) {
      const end = offer.endDate;
      if (!cell.earliestEndDate || end < cell.earliestEndDate) {
        cell.earliestEndDate = end;
      }
    }
  }

  for (const cell of cellsMap.values()) {
    if (cell.liveCount > 0) {
      if (cell.earliestEndDate && cell.earliestEndDate <= expiringCutoff) {
        cell.status = 'EXPIRING_SOON';
      } else {
        cell.status = 'OK';
      }
    } else {
      cell.status = 'MISSING';
    }
  }

  // For Toyota, add expected models for the specific year even when no offers exist
  if (storeCode === 'TOY' && targetYear != null) {
    const expectedModels = readBrandModelsForYear('toyota', targetYear);
    const buckets: KnownOfferTypeBucket[] = ['Lease', 'Finance', 'CashOrOther'];

    for (const model of expectedModels) {
      for (const bucket of buckets) {
        const key = `${model}::${targetYear}::${bucket}`;
        if (!cellsMap.has(key)) {
          cellsMap.set(key, {
            model,
            year: targetYear,
            offerType: bucket,
            liveCount: 0,
            inactiveCount: 0,
            earliestEndDate: null,
            status: 'MISSING',
          });
        }
      }
    }
  }

  const cells = Array.from(cellsMap.values()).sort((a, b) => {
    if (a.model === b.model) {
      const ay = a.year ?? 0;
      const by = b.year ?? 0;
      if (ay === by) {
        const order: KnownOfferTypeBucket[] = ['Lease', 'Finance', 'CashOrOther'];
        return order.indexOf(a.offerType) - order.indexOf(b.offerType);
      }
      return ay - by;
    }
    return a.model.localeCompare(b.model);
  });

  return { cells };
}

/**
 * Expiring offers and recently updated offers for a store.
 */
export async function getExpiringAndRecentSummary(input: {
  storeCode?: string;
  range?: TimeRange;
}): Promise<ExpiringAndRecentSummary> {
  const storeCode = normalizeStoreCode(input.storeCode);
  const range: TimeRange = input.range ?? '30d';

  const now = new Date();
  const today = new Date(now.toISOString().slice(0, 10));

  const expiringDays = getExpiringDays(range);
  const expiringTo = new Date(today);
  expiringTo.setDate(expiringTo.getDate() + expiringDays);

  const recentDays = getRecentDays(range);
  const recentFrom = new Date(now);
  recentFrom.setDate(recentFrom.getDate() - recentDays);

  const [expiring, recent] = await Promise.all([
    prisma.offer.findMany({
      where: {
        AND: [
          {
            OR: [
              { storeCode },
              { storeCodes: { has: storeCode } },
            ],
          },
          { status: OfferStatus.LIVE },
          { endDate: { gte: today, lte: expiringTo } },
        ],
      },
      orderBy: { endDate: 'asc' },
      take: 20,
    }),
    prisma.offer.findMany({
      where: {
        AND: [
          {
            OR: [
              { storeCode },
              { storeCodes: { has: storeCode } },
            ],
          },
          { updatedAt: { gte: recentFrom } },
        ],
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    }),
  ]);

  const mapOffer = (o: typeof expiring[number]): SimpleOfferSummary => ({
    id: o.id,
    model: o.model,
    year: o.year,
    trim: o.trim,
    condition: o.condition.toString(),
    status: o.status,
    offerType: o.offerType,
    storeCode: o.storeCode,
    endDate: o.endDate,
    updatedAt: o.updatedAt,
    leasePayment: o.leasePayment ?? null,
    aprRate: o.aprRate != null ? Number(o.aprRate) : null,
    rebateTotal: o.rebateTotal != null ? Number(o.rebateTotal) : null,
  });

  return {
    expiringSoon: expiring.map(mapOffer),
    recentlyUpdated: recent.map(mapOffer),
  };
}

/**
 * Validation summary for a store (status-agnostic).
 */
export async function getValidationSummary(input: {
  storeCode?: string;
  range?: TimeRange;
}): Promise<ValidationSummary> {
  const range: TimeRange = input.range ?? '30d';

  const now = new Date();
  const recentDays = getRecentDays(range);
  const recentFrom = new Date(now);
  recentFrom.setDate(recentFrom.getDate() - recentDays);

  const offers = await prisma.offer.findMany({
    where: {
      AND: [storeFilterWhere(input.storeCode), { validationIssues: { not: Prisma.JsonNull } }],
    },
    select: {
      createdAt: true,
      updatedAt: true,
      validationIssues: true,
    },
  });

  const totalWithValidationIssues = offers.length;

  let ageSumDays = 0;
  let ageCount = 0;
  let newIssuesLastNDays = 0;

  const categoryCounts = new Map<string, number>();

  for (const o of offers) {
    const ageMs = now.getTime() - o.createdAt.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    ageSumDays += ageDays;
    ageCount += 1;

    if (o.createdAt >= recentFrom) {
      newIssuesLastNDays += 1;
    }

    const issues = (o.validationIssues as Prisma.JsonValue | null) as unknown;
    if (Array.isArray(issues)) {
      for (const issue of issues as any[]) {
        if (!issue) continue;
        const code = String(issue.code || issue.category || issue.field || 'unknown');
        categoryCounts.set(code, (categoryCounts.get(code) ?? 0) + 1);
      }
    }
  }

  const averageAgeDays = ageCount > 0 ? ageSumDays / ageCount : null;

  const categories: ValidationCategoryCount[] = Array.from(categoryCounts.entries())
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalWithValidationIssues,
    newIssuesLastNDays,
    averageAgeDays,
    categories,
  };
}

/**
 * Toyota ingestion run summaries from artifacts directory.
 * Reads the most recent N run summary JSON files if present.
 */
export async function getToyotaIngestionHistory(limit = 5): Promise<IngestionRunSummary[]> {
  const artifactsDir = path.join(process.cwd(), 'artifacts');
  if (!fs.existsSync(artifactsDir)) return [];

  const files = fs.readdirSync(artifactsDir);
  const summaryFiles = files
    .filter((f) => f.startsWith('toyota-run-summary-') && f.endsWith('.json'))
    .sort((a, b) => b.localeCompare(a));

  const selected = summaryFiles.slice(0, limit);
  const results: IngestionRunSummary[] = [];

  for (const file of selected) {
    try {
      const fullPath = path.join(artifactsDir, file);
      const json = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as any;
      results.push({
        runId: String(json.runId ?? file.replace('toyota-run-summary-', '').replace('.json', '')),
        success: Boolean(json.success),
        inserted: Number(json.inserted ?? 0),
        updated: Number(json.updated ?? 0),
        inactivated: Number(json.inactivated ?? 0),
        skippedCashOnly: Number(json.skippedCashOnly ?? 0),
        byOfferType: {
          Lease: Number(json.byOfferType?.Lease ?? 0),
          Finance: Number(json.byOfferType?.Finance ?? 0),
          Other: Number(json.byOfferType?.Other ?? 0),
        },
        rawOfferCount: Number(json.rawOfferCount ?? 0),
        normalizedCount: Number(json.normalizedCount ?? 0),
        dedupedCount: Number(json.dedupedCount ?? 0),
        errorCount: Array.isArray(json.errors) ? json.errors.length : 0,
      });
    } catch {
      // Skip malformed file
    }
  }

  return results;
}

export type ModelCoverageBrand = 'toyota' | 'lexus' | 'bmw';

const MODEL_COVERAGE_BRAND_STORE_CODES: Record<ModelCoverageBrand, string[]> = {
  toyota: ['TOY'],
  lexus: ['LEXDT', 'LEXWG'],
  bmw: ['BMW'],
};

/**
 * Model page & asset coverage for a brand and year.
 * Uses modelpager configs and Offer data.
 */
export async function getModelAssetCoverage(input: {
  brand: ModelCoverageBrand;
  year: number;
}): Promise<ModelAssetCoverageRow[]> {
  const { brand, year } = input;
  const storeCodes = MODEL_COVERAGE_BRAND_STORE_CODES[brand];

  const configModels = readBrandModelsForYear(brand, year);

  const offersForSamples = await prisma.offer.findMany({
    where: {
      AND: [
        { year },
        {
          OR: storeCodes.flatMap((sc) => [
            { storeCode: sc },
            { storeCodes: { has: sc } },
          ]),
        },
        {
          status: {
            in: [OfferStatus.LIVE, OfferStatus.INACTIVE],
          },
        },
      ],
    },
    select: {
      model: true,
      offerType: true,
      status: true,
      leasePayment: true,
      leaseTerm: true,
      leaseMiles: true,
      dueAtSigning: true,
      aprRate: true,
      aprTermMonths: true,
      msrp: true,
      discount: true,
      buyFor: true,
    },
  });

  const formatCurrency = (n: number): string =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);

  const leaseSampleByModel = new Map<string, (typeof offersForSamples)[number]>();
  const sampleByKey = new Map<string, (typeof offersForSamples)[number]>();

  const statusRank = (s: OfferStatus): number => {
    if (s === OfferStatus.LIVE) return 0;
    if (s === OfferStatus.INACTIVE) return 1;
    return 3;
  };

  for (const o of offersForSamples) {
    const modelName = (o.model ?? '').trim();
    if (!modelName) continue;
    const bucket = toBucket(o.offerType ?? null);
    const key = `${modelName}::${bucket}`;

    if (bucket === 'Lease') {
      const existingLease = leaseSampleByModel.get(modelName);
      if (
        !existingLease ||
        existingLease.leasePayment == null ||
        (o.leasePayment != null && o.leasePayment < existingLease.leasePayment)
      ) {
        leaseSampleByModel.set(modelName, o);
      }
    } else {
      const existing = sampleByKey.get(key);
      if (!existing || statusRank(o.status) < statusRank(existing.status)) {
        sampleByKey.set(key, o);
      }
    }
  }

  const buildLeaseText = (o: (typeof offersForSamples)[number] | undefined): string | null => {
    if (!o || o.leasePayment == null || o.leaseTerm == null || o.leaseMiles == null || o.dueAtSigning == null) {
      return null;
    }
    const milesK = o.leaseMiles / 1000;
    const milesPart = Number.isFinite(milesK) ? milesK.toString().replace(/\.0$/, '') : '';
    return `${formatCurrency(o.leasePayment)}/mo ${o.leaseTerm}/${milesPart} ${formatCurrency(
      o.dueAtSigning,
    )}`;
  };

  const buildFinanceText = (o: (typeof offersForSamples)[number] | undefined): string | null => {
    if (!o || o.aprRate == null || o.aprTermMonths == null) {
      return null;
    }
    const rate = Number(o.aprRate);
    const rateStr = rate
      .toFixed(2)
      .replace(/\.00$/, '')
      .replace(/(\.\d)0$/, '$1');
    return `${rateStr}% ${o.aprTermMonths}mo`;
  };

  const buildCashText = (o: (typeof offersForSamples)[number] | undefined): string | null => {
    if (!o) return null;
    const msrp = o.msrp ?? null;
    const discount = o.discount ?? null;
    let buyFor = o.buyFor ?? null;
    if (buyFor == null && msrp != null && discount != null) {
      buyFor = msrp - discount;
    }
    if (msrp != null && discount != null && buyFor != null) {
      return `${formatCurrency(msrp)} - ${formatCurrency(discount)} = ${formatCurrency(buyFor)}`;
    }
    if (buyFor != null) {
      return `${formatCurrency(buyFor)}`;
    }
    return null;
  };

  const offersByModelAndType = await prisma.offer.groupBy({
    by: ['model', 'offerType'],
    where: {
      AND: [
        { year },
        {
          OR: storeCodes.flatMap((sc) => [
            { storeCode: sc },
            { storeCodes: { has: sc } },
          ]),
        },
        {
          status: {
            in: [OfferStatus.LIVE, OfferStatus.INACTIVE],
          },
        },
      ],
    },
    _count: { id: true },
  });

  const offerBucketsByModel = new Map<
    string,
    { Lease: boolean; Finance: boolean; CashOrOther: boolean }
  >();
  for (const row of offersByModelAndType) {
    const modelName = (row.model ?? '').trim();
    if (!modelName) continue;
    const bucket = toBucket(row.offerType ?? null);
    const existing = offerBucketsByModel.get(modelName) ?? {
      Lease: false,
      Finance: false,
      CashOrOther: false,
    };
    existing[bucket] = true;
    offerBucketsByModel.set(modelName, existing);
  }

  const rows: ModelAssetCoverageRow[] = [];

  const baseDir = getBrandConfigDirForYear(brand, year);

  const assetHealthByModel = readAssetHealthForBrandYear(brand, year);

  const models = Array.from(
    new Set([
      ...configModels,
      ...Array.from(offerBucketsByModel.keys()),
      ...Array.from(leaseSampleByModel.keys()),
      ...Array.from(assetHealthByModel.keys()),
    ]),
  );

  for (const model of models) {
    const slug = slugify(model);
    const configPath = baseDir ? getModelConfigPath(brand, year, baseDir, slug) : null;
    let hasModelPage = false;
    let hasHeroImage = false;
    let hasVehicleImage = false;

    let modelPageStatus: AssetStatus = 'missing';
    let heroImageStatus: AssetStatus = 'missing';
    let vehicleImageStatus: AssetStatus = 'missing';

    let modelPageInfo: AssetStatusInfo | undefined;
    let heroImageInfo: AssetStatusInfo | undefined;
    let vehicleImageInfo: AssetStatusInfo | undefined;

    if (configPath && fs.existsSync(configPath)) {
      hasModelPage = true;
      modelPageStatus = 'placeholder';
      modelPageInfo = {
        path: configPath,
        note: 'Model page JSON exists; readiness not yet validated.',
        lastCheckedAt: null,
        lastCheckStatus: 'unknown',
      };
      try {
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as any;
        const heroPath: string | undefined = cfg?.images?.hero?.path;
        const vehicleJellybeanPath: string | undefined = cfg?.images?.vehicleJellybean?.path;
        const vehiclePath: string | undefined = cfg?.images?.vehicle?.path;

        if (heroPath) {
          hasHeroImage = true;
          heroImageStatus = 'placeholder';
          heroImageInfo = {
            path: heroPath,
            note: 'Image path present in config; URL not yet health-checked.',
            lastCheckedAt: null,
            lastCheckStatus: 'unknown',
          };
        }

        const effectiveVehiclePath = vehicleJellybeanPath || vehiclePath;
        if (effectiveVehiclePath) {
          hasVehicleImage = true;
          vehicleImageStatus = 'placeholder';
          vehicleImageInfo = {
            path: effectiveVehiclePath,
            note: 'Image path present in config; URL not yet health-checked.',
            lastCheckedAt: null,
            lastCheckStatus: 'unknown',
          };
        }
      } catch {
        // malformed config; treat as no assets
        modelPageStatus = 'error';
        modelPageInfo = {
          path: configPath,
          note: 'Model page JSON could not be parsed.',
          lastCheckedAt: null,
          lastCheckStatus: 'unknown',
        };
        heroImageStatus = 'missing';
        heroImageInfo = undefined;
        hasHeroImage = false;
        vehicleImageStatus = 'missing';
        vehicleImageInfo = undefined;
        hasVehicleImage = false;
      }
    }

    const health = assetHealthByModel.get(model);
    if (health) {
      if (heroImageInfo && health.hero) {
        heroImageInfo.lastCheckedAt = new Date(health.hero.checkedAt);
        heroImageInfo.lastCheckStatus =
          health.hero.status === 'ok' ? 'ok' : 'not_found';
        heroImageInfo.url = health.hero.url;
        if (health.hero.status === 'ok') {
          heroImageStatus = 'live';
          heroImageInfo.note =
            heroImageInfo.note ??
            'Image URL responded successfully during last health check.';
        } else {
          heroImageStatus = 'error';
          heroImageInfo.note =
            heroImageInfo.note ??
            'Image URL failed health check (not found or error).';
        }
      }

      if (vehicleImageInfo && health.vehicle) {
        vehicleImageInfo.lastCheckedAt = new Date(health.vehicle.checkedAt);
        vehicleImageInfo.lastCheckStatus =
          health.vehicle.status === 'ok' ? 'ok' : 'not_found';
        vehicleImageInfo.url = health.vehicle.url;
        if (health.vehicle.status === 'ok') {
          vehicleImageStatus = 'live';
          vehicleImageInfo.note =
            vehicleImageInfo.note ??
            'Image URL responded successfully during last health check.';
        } else {
          vehicleImageStatus = 'error';
          vehicleImageInfo.note =
            vehicleImageInfo.note ??
            'Image URL failed health check (not found or error).';
        }
      }

      if (modelPageInfo && health.modelPage) {
        modelPageInfo.lastCheckedAt = new Date(health.modelPage.checkedAt);
        modelPageInfo.lastCheckStatus =
          health.modelPage.status === 'ok' ? 'ok' : 'not_found';
        modelPageInfo.url = health.modelPage.url;
        if (health.modelPage.status === 'ok') {
          modelPageStatus = 'live';
          modelPageInfo.note =
            modelPageInfo.note ??
            'Model page URL responded successfully during last health check.';
        } else if (health.modelPage.status === 'not_found') {
          modelPageStatus = 'missing';
          modelPageInfo.note =
            modelPageInfo.note ??
            'Model page URL returned 404 during health check.';
        } else {
          modelPageStatus = 'error';
          modelPageInfo.note =
            modelPageInfo.note ??
            'Model page URL failed health check (not found or error).';
        }
      }
    }

    const buckets =
      offerBucketsByModel.get(model) ?? {
        Lease: false,
        Finance: false,
        CashOrOther: false,
      };

    rows.push({
      model,
      year,
      hasModelPage,
      hasHeroImage,
      hasVehicleImage,
      hasOffers: buckets.Lease || buckets.Finance || buckets.CashOrOther,
      hasLeaseOffer: buckets.Lease,
      hasFinanceOffer: buckets.Finance,
      hasCashOrOtherOffer: buckets.CashOrOther,
      leaseOfferText: buildLeaseText(leaseSampleByModel.get(model)),
      financeOfferText: buildFinanceText(sampleByKey.get(`${model}::Finance`)),
      cashOrOtherOfferText: buildCashText(sampleByKey.get(`${model}::CashOrOther`)),
      modelPageStatus,
      heroImageStatus,
      vehicleImageStatus,
      modelPageInfo,
      heroImageInfo,
      vehicleImageInfo,
    });
  }

  rows.sort((a, b) => a.model.localeCompare(b.model));
  return rows;
}

/**
 * Offer consistency & outlier detection for a store.
 * Uses simple heuristics to surface obviously suspicious values.
 */
export async function getOfferOutliersSummary(input: {
  storeCode?: string;
}): Promise<OfferOutlier[]> {
  const offers = await prisma.offer.findMany({
    where: {
      AND: [
        storeFilterWhere(input.storeCode),
        {
          status: {
            in: [OfferStatus.LIVE, OfferStatus.INACTIVE],
          },
        },
      ],
    },
    select: {
      id: true,
      model: true,
      year: true,
      status: true,
      offerType: true,
      leasePayment: true,
      aprRate: true,
      rebateTotal: true,
    },
  });

  const outliers: OfferOutlier[] = [];

  for (const o of offers) {
    const reasons: string[] = [];
    const apr = o.aprRate != null ? Number(o.aprRate) : null;
    const rebate = o.rebateTotal != null ? Number(o.rebateTotal) : null;

    if (o.leasePayment != null && o.leasePayment > 0 && o.leasePayment < 50) {
      reasons.push('Lease payment unusually low (< $50/mo)');
    }
    if (o.leasePayment != null && o.leasePayment > 2000) {
      reasons.push('Lease payment unusually high (> $2,000/mo)');
    }
    if (apr != null && (apr < 0.1 || apr > 15)) {
      reasons.push('APR outside typical range (0.1–15%)');
    }
    if (rebate != null && rebate > 15000) {
      reasons.push('Rebate total unusually high (> $15,000)');
    }

    if (reasons.length > 0) {
      outliers.push({
        id: o.id,
        model: o.model,
        year: o.year,
        offerType: o.offerType,
        status: o.status,
        leasePayment: o.leasePayment ?? null,
        aprRate: apr,
        rebateTotal: rebate,
        reasons,
      });
    }
  }

  outliers.sort((a, b) => {
    if (a.model === b.model) {
      const ay = a.year ?? 0;
      const by = b.year ?? 0;
      return by - ay;
    }
    return a.model.localeCompare(b.model);
  });

  return outliers.slice(0, 50);
}

const BRAND_MODEL_FILES: Record<ModelCoverageBrand, (y: number) => string> = {
  toyota: (y) => `toy-models-${y}.json`,
  lexus: (y) => `lex-models-${y}.json`,
  bmw: (y) => `bmw-models-${y}.json`,
};

function getBrandConfigDirForYear(brand: ModelCoverageBrand, year: number): string | null {
  const relativeSegments = [
    'lab',
    'modelpager',
    'configs',
    'pages',
    brand,
    String(year),
  ];
  const possibleRoots = [
    process.cwd(),
    ...(typeof __dirname !== 'undefined'
      ? [path.resolve(__dirname, '..', '..', '..')]
      : []),
  ];
  const markerFile = BRAND_MODEL_FILES[brand](year);
  for (const root of possibleRoots) {
    const dir = path.join(root, ...relativeSegments);
    const markerPath = path.join(dir, markerFile);
    if (fs.existsSync(markerPath)) return dir;
  }
  return null;
}

function readAssetHealthForBrandYear(
  brand: ModelCoverageBrand,
  year: number,
): Map<string, { hero?: AssetHealthEntry; vehicle?: AssetHealthEntry; modelPage?: AssetHealthEntry }> {
  const result = new Map<
    string,
    { hero?: AssetHealthEntry; vehicle?: AssetHealthEntry; modelPage?: AssetHealthEntry }
  >();
  const artifactsDir = path.join(process.cwd(), 'artifacts');
  const filePath = path.join(artifactsDir, `asset-health-${brand}-${year}.json`);
  if (!fs.existsSync(filePath)) return result;

  try {
    const json = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as AssetHealthFile;
    for (const entry of json.entries ?? []) {
      const modelKey = entry.model;
      if (!modelKey) continue;
      const existing = result.get(modelKey) ?? {};
      if (entry.assetType === 'hero') {
        existing.hero = entry;
      } else if (entry.assetType === 'vehicle') {
        existing.vehicle = entry;
      } else if (entry.assetType === 'modelPage') {
        existing.modelPage = entry;
      }
      result.set(modelKey, existing);
    }
  } catch {
    // Ignore malformed health files; fallback to config-only status.
  }

  return result;
}

function readBrandModelsForYear(brand: ModelCoverageBrand, year: number): string[] {
  const dir = getBrandConfigDirForYear(brand, year);
  if (!dir) return [];

  const markerFile = BRAND_MODEL_FILES[brand](year);
  const configPath = path.join(dir, markerFile);
  try {
    const json = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
      models?: Array<{ displayName?: string }>;
    };
    const models = json.models ?? [];
    return models
      .map((m) => (m.displayName ?? '').trim())
      .filter((name) => name.length > 0);
  } catch {
    return [];
  }
}

function getModelConfigPath(
  brand: ModelCoverageBrand,
  _year: number,
  baseDir: string,
  slug: string,
): string | null {
  if (brand === 'lexus') {
    // Lexus has configs in lexdt/ and lexwg/ subdirs
    const lexdtPath = path.join(baseDir, 'lexdt', `${slug}.json`);
    const lexwgPath = path.join(baseDir, 'lexwg', `${slug}.json`);
    if (fs.existsSync(lexdtPath)) return lexdtPath;
    if (fs.existsSync(lexwgPath)) return lexwgPath;
    return null;
  }
  return path.join(baseDir, `${slug}.json`);
}

export interface PipelineSummary {
  liveCount: number;
  inactiveCount: number;
  archivedCount: number;
  validationIssueCount: number;
}

export async function getPipelineSummary(): Promise<PipelineSummary> {
  const todayStart = createEasternDate(formatEasternDate(new Date()));

  const [statusCounts, archivedCount, validationIssueCount, liveCertifiedFinance] = await Promise.all([
    prisma.offer.groupBy({ by: ['status'], _count: { id: true } }),
    prisma.offer.count({ where: { endDate: { lt: todayStart } } }),
    prisma.offer.count({ where: { validationIssues: { not: Prisma.JsonNull } } }),
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

  const { duplicated } = dedupeCertifiedFinanceCount(liveCertifiedFinance);

  return {
    liveCount: live - duplicated,
    inactiveCount: inactive,
    archivedCount,
    validationIssueCount,
  };
}

