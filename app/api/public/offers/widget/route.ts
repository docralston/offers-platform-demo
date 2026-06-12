import { NextRequest } from 'next/server';
import { enforcePublicApiRateLimit } from '@/lib/api/public-route';
import { prisma } from '@/lib/prisma';
import { OfferStatus, VehicleCondition, OfferTypeEnum } from '@prisma/client';
import { createEasternDate, formatEasternDate } from '@/lib/utils/dates';
import { type CardBrand } from '@/lib/domain/card-groups';
import { renderWebSpecialsWidgetEmbed } from '@/lib/renderers/web-specials';
import { resolveInternalStoreCode } from '@/lib/config/store-display';
import { sanitizeWidgetHtml } from '@/lib/sanitize/widget-html';

const STORE_BRAND: Record<string, CardBrand> = {
  TOY: 'toyota',
  BMW: 'bmw',
  LEXDT: 'lexus',
  LEXWG: 'lexus',
};

function parseEnum<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  if (!value) return undefined;
  return allowed.includes(value as T) ? (value as T) : undefined;
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
  const contactAnchorParam = url.searchParams.get('contactAnchor');

  if (!store || !model) {
    return new Response(
      '<div data-offers-widget-error="missing-params">Missing required query params: store, model</div>',
      {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      },
    );
  }

  const internalStore = resolveInternalStoreCode(store);
  if (!internalStore) {
    return new Response(
      '<div data-offers-widget-error="invalid-store">Invalid store</div>',
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }

  const brand = STORE_BRAND[internalStore] ?? 'toyota';

  const year = yearParam ? Number(yearParam) : undefined;
  if (yearParam && Number.isNaN(year)) {
    return new Response(
      '<div data-offers-widget-error="invalid-year">Invalid year</div>',
      {
        status: 400,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      },
    );
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

  where.OR = [
    { storeCode: internalStore },
    { storeCodes: { has: internalStore } },
  ];

  const now = new Date();
  const todayEasternStr = formatEasternDate(now);
  const todayStart = createEasternDate(todayEasternStr);
  where.endDate = { gte: todayStart };
  where.startDate = { lte: todayStart };

  where.model = { equals: model, mode: 'insensitive' };

  if (year !== undefined) {
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

  if (offers.length === 0) {
    return new Response(
      '<div data-offers-widget-empty="true"></div>',
      {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=120',
        },
      },
    );
  }

  const contactAnchor =
    contactAnchorParam?.startsWith('#') && contactAnchorParam.length > 1
      ? contactAnchorParam
      : undefined;
  const inactiveCtas =
    url.searchParams.get('inactiveCtas') === '1' || process.env.DEMO_MODE === 'true';

  const fragment = sanitizeWidgetHtml(
    renderWebSpecialsWidgetEmbed(offers, internalStore, brand, {
      contactAnchor,
      inactiveCtas,
      offerType,
    }),
  );

  return new Response(fragment, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

