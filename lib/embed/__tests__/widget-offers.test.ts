import { OfferTypeEnum } from '@prisma/client';
import { pickEmbedWidgetOffers } from '@/lib/embed/widget-offers';

describe('pickEmbedWidgetOffers', () => {
  test('returns only the first matching offer for embed slots', () => {
    const offers = [
      { id: 'a', offerType: OfferTypeEnum.Lease, trim: 'LE' },
      { id: 'b', offerType: OfferTypeEnum.Lease, trim: 'XLE' },
    ] as Parameters<typeof pickEmbedWidgetOffers>[0];

    expect(pickEmbedWidgetOffers(offers, OfferTypeEnum.Lease)).toEqual([offers[0]]);
    expect(pickEmbedWidgetOffers(offers)).toEqual([offers[0]]);
  });

  test('returns empty when no offers match the requested type', () => {
    const offers = [{ id: 'a', offerType: OfferTypeEnum.Lease }] as Parameters<
      typeof pickEmbedWidgetOffers
    >[0];

    expect(pickEmbedWidgetOffers(offers, OfferTypeEnum.Finance)).toEqual([]);
  });
});
