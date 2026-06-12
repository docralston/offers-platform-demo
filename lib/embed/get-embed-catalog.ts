import { prisma } from '@/lib/prisma';
import { OfferStatus } from '@prisma/client';
import type { StoreCode } from '@/lib/config/stores';
import { createEasternDate, formatEasternDate } from '@/lib/utils/dates';
import type { EmbedWidgetCatalog, EmbedWidgetCatalogVariant } from '@/lib/embed/catalog';

function liveOfferWindowWhere() {
  const now = new Date();
  const todayEasternStr = formatEasternDate(now);
  const todayStart = createEasternDate(todayEasternStr);
  return {
    status: OfferStatus.LIVE,
    endDate: { gte: todayStart },
    startDate: { lte: todayStart },
    make: { not: null },
    year: { not: null },
  };
}

/** Live offers grouped by make → model → available offer types (from DB). */
export async function getEmbedWidgetCatalog(): Promise<EmbedWidgetCatalog> {
  const rows = await prisma.offer.findMany({
    where: liveOfferWindowWhere(),
    select: {
      make: true,
      model: true,
      year: true,
      storeCode: true,
      offerType: true,
    },
    orderBy: [{ make: 'asc' }, { model: 'asc' }, { offerType: 'asc' }],
  });

  const makeMap = new Map<string, Map<string, EmbedWidgetCatalogVariant[]>>();

  for (const row of rows) {
    const make = row.make?.trim();
    const model = row.model?.trim();
    const year = row.year;
    const offerType = row.offerType;
    if (!make || !model || year == null || !offerType) continue;

    if (!makeMap.has(make)) makeMap.set(make, new Map());
    const modelMap = makeMap.get(make)!;
    if (!modelMap.has(model)) modelMap.set(model, []);

    const variants = modelMap.get(model)!;
    const duplicate = variants.some(
      (v) =>
        v.offerType === offerType &&
        v.storeCode === row.storeCode &&
        v.year === year,
    );
    if (!duplicate) {
      variants.push({
        storeCode: row.storeCode as StoreCode,
        year,
        offerType,
      });
    }
  }

  return Array.from(makeMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([make, modelMap]) => ({
      make,
      models: Array.from(modelMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([model, variants]) => ({
          model,
          variants: variants.sort((a, b) => a.offerType.localeCompare(b.offerType)),
        })),
    }));
}
