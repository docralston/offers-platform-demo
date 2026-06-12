import { OfferStatus, Offer } from '@prisma/client';
import { prisma } from '../prisma';

/**
 * Selects offers for publishing based on filters
 * Uses startDate/endDate to determine when offers are published/unpublished
 */
export async function selectOffersForPublish(
  storeCode: string,
  dateFrom: Date,
  dateTo: Date
): Promise<Offer[]> {
  const offers = await prisma.offer.findMany({
    where: {
      storeCode,
      status: OfferStatus.LIVE,
      // Date overlap: offer.startDate <= dateTo AND offer.endDate >= dateFrom
      // This selects all LIVE offers that overlap with the selected date range
      startDate: {
        lte: dateTo,
      },
      endDate: {
        gte: dateFrom,
      },
    },
    orderBy: [
      { model: 'asc' },
      { trim: 'asc' },
    ],
  });

  return offers;
}

export interface SelectionFilters {
  storeCode: string;
  dateFrom?: Date | string | null;
  dateTo?: Date | string | null;
  year?: number | string | null;
  search?: string | null;
  status?: OfferStatus | null;
  offerType?: Offer['offerType'] | null;
  condition?: Offer['condition'] | null;
}

/**
 * Selects offers for Emails/JSON sections: store + optional date range, search, status.
 * Date filter uses overlap (startDate <= dateTo AND endDate >= dateFrom).
 */
export async function selectOffersForSelection(
  filters: SelectionFilters
): Promise<Offer[]> {
  const dateFrom =
    filters.dateFrom == null || filters.dateFrom === ''
      ? undefined
      : typeof filters.dateFrom === 'string'
        ? new Date(filters.dateFrom)
        : filters.dateFrom;
  const dateTo =
    filters.dateTo == null || filters.dateTo === ''
      ? undefined
      : typeof filters.dateTo === 'string'
        ? new Date(filters.dateTo)
        : filters.dateTo;

  const where: Record<string, unknown> = {
    AND: [
      {
        OR: [
          { storeCode: filters.storeCode },
          { storeCodes: { has: filters.storeCode } },
        ],
      },
      { status: filters.status ?? OfferStatus.LIVE },
    ],
  };

  if (filters.search != null && String(filters.search).trim() !== '') {
    const q = String(filters.search).trim();
    (where.AND as unknown[]).push({
      OR: [
        { make: { contains: q, mode: 'insensitive' } },
        { model: { contains: q, mode: 'insensitive' } },
        { trim: { contains: q, mode: 'insensitive' } },
      ],
    });
  }

  if (filters.offerType && String(filters.offerType).trim() !== '') {
    (where.AND as unknown[]).push({ offerType: filters.offerType });
  }

  if (filters.condition && String(filters.condition).trim() !== '') {
    (where.AND as unknown[]).push({ condition: filters.condition });
  }

  if (filters.year != null && String(filters.year).trim() !== '') {
    const parsedYear = Number(filters.year);
    if (Number.isFinite(parsedYear)) {
      (where.AND as unknown[]).push({ year: parsedYear });
    }
  }

  if (dateFrom != null && dateTo != null) {
    (where.AND as unknown[]).push({ startDate: { lte: dateTo } }, { endDate: { gte: dateFrom } });
  } else if (dateFrom != null) {
    (where.AND as unknown[]).push({ endDate: { gte: dateFrom } });
  } else if (dateTo != null) {
    (where.AND as unknown[]).push({ startDate: { lte: dateTo } });
  }

  const offers = await prisma.offer.findMany({
    where: where as object,
    orderBy: [
      { model: 'asc' },
      { trim: 'asc' },
    ],
  });

  return offers;
}
