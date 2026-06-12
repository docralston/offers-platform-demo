import { NextRequest } from 'next/server';
import { enforcePublicApiRateLimit } from '@/lib/api/public-route';
import { prisma } from '@/lib/prisma';
import { OfferStatus, VehicleCondition, OfferTypeEnum } from '@prisma/client';
import { createEasternDate, formatEasternDate } from '@/lib/utils/dates';
import { groupOffersForCards, type CardBrand } from '@/lib/domain/card-groups';
import { renderWebJson } from '@/lib/renderers/json';
import {
  resolveInternalStoreCode,
  serializeStoreCodeForPublic,
  serializeStoreCodesForPublic,
} from '@/lib/config/store-display';

const STORE_BRAND: Record<string, CardBrand> = {
  TOY: 'toyota',
  BMW: 'bmw',
  LEXDT: 'lexus',
  LEXWG: 'lexus',
};

type Format = 'grouped' | 'raw' | 'schema';

function parseFormat(value: string | null): Format {
  if (value === 'raw' || value === 'schema') return value;
  return 'grouped';
}

function parseEnum<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  if (!value) return undefined;
  return allowed.includes(value as T) ? (value as T) : undefined;
}

function decimalToNumber(v: unknown): number | null {
  return v == null ? null : Number(v);
}

function serializeOffer(o: any) {
  return {
    id: o.id,
    storeCode: serializeStoreCodeForPublic(o.storeCode),
    storeCodes: serializeStoreCodesForPublic(o.storeCodes),
    status: o.status,
    condition: o.condition,
    year: o.year,
    make: o.make,
    model: o.model,
    trim: o.trim,
    offerType: o.offerType,
    leasePayment: o.leasePayment,
    leaseTerm: o.leaseTerm,
    leaseMiles: o.leaseMiles,
    dueAtSigning: o.dueAtSigning,
    capCostReduction: o.capCostReduction,
    grossCapCost: o.grossCapCost,
    netCapCost: o.netCapCost,
    securityDeposit: o.securityDeposit,
    perExcessMile: decimalToNumber(o.perExcessMile),
    msrp: o.msrp,
    discount: o.discount,
    buyFor: o.buyFor,
    stockNumber: o.stockNumber,
    aprRate: decimalToNumber(o.aprRate),
    aprTermMonths: o.aprTermMonths,
    financeRates: o.financeRates,
    rebateTotal: decimalToNumber(o.rebateTotal),
    customerCash: decimalToNumber(o.customerCash),
    leaseCash: decimalToNumber(o.leaseCash),
    aprCash: decimalToNumber(o.aprCash),
    bonusCash: decimalToNumber(o.bonusCash),
    disclaimer: o.disclaimer,
    additionalNotes: o.additionalNotes,
    startDate: o.startDate.toISOString(),
    endDate: o.endDate.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const rateLimited = enforcePublicApiRateLimit(req);
  if (rateLimited) return rateLimited;

  const url = new URL(req.url);
  const store = url.searchParams.get('store');
  const model = url.searchParams.get('model');
  const yearParam = url.searchParams.get('year');
  const conditionParam = url.searchParams.get('condition');
  const typeParam = url.searchParams.get('type');
  const format = parseFormat(url.searchParams.get('format'));

  if (!store || !model) {
    return new Response(
      JSON.stringify({ error: 'Missing required query params: store, model' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const internalStore = resolveInternalStoreCode(store);
  if (!internalStore) {
    return new Response(JSON.stringify({ error: 'Invalid store' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const brand = STORE_BRAND[internalStore] ?? 'toyota';

  const year = yearParam ? Number(yearParam) : undefined;
  if (yearParam && Number.isNaN(year)) {
    return new Response(JSON.stringify({ error: 'Invalid year' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const condition = parseEnum<VehicleCondition>(
    conditionParam as VehicleCondition | null,
    Object.values(VehicleCondition),
  );
  const offerType = parseEnum<OfferTypeEnum>(
    typeParam as OfferTypeEnum | null,
    Object.values(OfferTypeEnum),
  );

  const where: any = {
    status: OfferStatus.LIVE,
  };

  // Store filter (including multi-store offers)
  where.OR = [
    { storeCode: internalStore },
    { storeCodes: { has: internalStore } },
  ];

  // Non-archived: endDate >= today (Eastern)
  const now = new Date();
  const todayEasternStr = formatEasternDate(now);
  const todayStart = createEasternDate(todayEasternStr);
  where.endDate = { gte: todayStart };
  where.startDate = { lte: todayStart };

  // Model (case-insensitive)
  where.model = { equals: model, mode: 'insensitive' };

  if (year !== undefined) {
    // For certified finance, year may be null; we still want those offers.
    where.AND = [
      {
        OR: [
          { year },
          {
            AND: [
              { condition: VehicleCondition.CERTIFIED },
              { offerType: OfferTypeEnum.Finance },
            ],
          },
        ],
      },
    ];
  }

  if (condition) {
    where.condition = condition;
  }

  if (offerType) {
    where.offerType = offerType;
  }

  const offers = await prisma.offer.findMany({
    where,
    orderBy: [{ model: 'asc' }, { trim: 'asc' }],
  });

  if (format === 'schema') {
    const jsonLd = renderWebJson(offers, internalStore);
    return new Response(jsonLd, {
      status: 200,
      headers: {
        'Content-Type': 'application/ld+json; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }

  const serialized = offers.map(serializeOffer);

  if (format === 'raw') {
    return new Response(JSON.stringify(serialized, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }

  const cardGroups = groupOffersForCards(
    serialized.map((o) => ({
      ...o,
      id: o.id,
      storeCode: o.storeCode,
      condition: o.condition,
      year: o.year,
      make: o.make,
      model: o.model,
      offerType: o.offerType,
    })),
    internalStore,
    brand,
  );

  const grouped = cardGroups.map((g) => ({
    groupKey: g.groupKey,
    title: g.title,
    storeCode: serializeStoreCodeForPublic(internalStore),
    condition: g.titleOffer.condition,
    year: g.titleOffer.year,
    make: g.titleOffer.make,
    model: g.titleOffer.model,
    hasCertifiedFinance: g.hasCertifiedFinance,
    offers: g.offers,
  }));

  return new Response(JSON.stringify(grouped, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

