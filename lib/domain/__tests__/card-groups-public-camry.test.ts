import { groupOffersForCards } from '@/lib/domain/card-groups';
import type { CardGroupInput } from '@/lib/domain/card-groups';

function makeOffer(partial: Partial<CardGroupInput> & { id: string }): CardGroupInput {
  return {
    id: partial.id,
    storeCode: partial.storeCode ?? 'TOY',
    condition: partial.condition ?? 'NEW',
    year: partial.year ?? 2026,
    make: partial.make ?? 'Toyota',
    model: partial.model ?? 'Camry',
    offerType: partial.offerType ?? 'Lease',
    ...partial,
  };
}

describe('groupOffersForCards – 2026 Camry example', () => {
  test('groups by model (trim not in key): one card pool with all trims; lease + finance rows present', () => {
    const leaseOffers: CardGroupInput[] = [
      makeOffer({ id: 'camry-le-lease', trim: 'LE', offerType: 'Lease', leasePayment: 299 }),
      makeOffer({ id: 'camry-se-lease', trim: 'SE', offerType: 'Lease', leasePayment: 319 }),
      makeOffer({ id: 'camry-xle-lease', trim: 'XLE', offerType: 'Lease', leasePayment: 349 }),
      makeOffer({ id: 'camry-xse-lease', trim: 'XSE', offerType: 'Lease', leasePayment: 369 }),
    ];

    const financeOffers: CardGroupInput[] = [
      makeOffer({
        id: 'camry-le-fin',
        trim: 'LE',
        offerType: 'Finance',
        aprRate: 4.99,
        aprTermMonths: 60,
      }),
      makeOffer({
        id: 'camry-se-fin',
        trim: 'SE',
        offerType: 'Finance',
        aprRate: 4.99,
        aprTermMonths: 60,
      }),
      makeOffer({
        id: 'camry-xle-fin',
        trim: 'XLE',
        offerType: 'Finance',
        aprRate: 4.99,
        aprTermMonths: 60,
      }),
      makeOffer({
        id: 'camry-xse-fin',
        trim: 'XSE',
        offerType: 'Finance',
        aprRate: 4.99,
        aprTermMonths: 60,
      }),
    ];

    const allOffers = [...leaseOffers, ...financeOffers];

    const groups = groupOffersForCards(allOffers, 'TOY', 'toyota');

    expect(groups).toHaveLength(1);

    const g = groups[0];
    expect(g.offers.length).toBe(8);

    const trims = new Set(
      g.offers.map((o) => (o.trim ?? '').toString()).filter((t) => t.length > 0),
    );
    expect(trims).toEqual(new Set(['LE', 'SE', 'XLE', 'XSE']));

    const leases = g.offers.filter((o) => o.offerType === 'Lease');
    const finances = g.offers.filter((o) => o.offerType === 'Finance');
    expect(leases.length).toBe(4);
    expect(finances.length).toBe(4);

    for (const fin of finances) {
      expect((fin as { aprRate?: number }).aprRate).toBe(4.99);
      expect((fin as { aprTermMonths?: number }).aprTermMonths).toBe(60);
    }
  });
});
