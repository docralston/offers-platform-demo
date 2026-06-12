import {
  getMakesForOfferType,
  getModelsForMakeAndOfferType,
  getOfferTypesForMakeModel,
  normalizeEmbedWidgetSelection,
  pickDefaultEmbedSelections,
  type EmbedWidgetCatalog,
} from '@/lib/embed/catalog';
import { OfferTypeEnum } from '@prisma/client';

const SAMPLE_CATALOG: EmbedWidgetCatalog = [
  {
    make: 'Toyota',
    models: [
      {
        model: 'Camry',
        variants: [
          { storeCode: 'TOY', year: 2026, offerType: OfferTypeEnum.Lease },
        ],
      },
      {
        model: 'RAV4',
        variants: [
          { storeCode: 'TOY', year: 2026, offerType: OfferTypeEnum.Finance },
          { storeCode: 'TOY', year: 2026, offerType: OfferTypeEnum.Lease },
        ],
      },
    ],
  },
  {
    make: 'BMW',
    models: [
      {
        model: 'X3',
        variants: [{ storeCode: 'BMW', year: 2026, offerType: OfferTypeEnum.Lease }],
      },
    ],
  },
];

describe('embed catalog helpers', () => {
  test('getOfferTypesForMakeModel returns only types available for the pair', () => {
    expect(getOfferTypesForMakeModel(SAMPLE_CATALOG, 'Toyota', 'Camry')).toEqual([
      OfferTypeEnum.Lease,
    ]);
    expect(getOfferTypesForMakeModel(SAMPLE_CATALOG, 'Toyota', 'RAV4')).toEqual([
      OfferTypeEnum.Finance,
      OfferTypeEnum.Lease,
    ]);
    expect(getOfferTypesForMakeModel(SAMPLE_CATALOG, 'Toyota', 'Missing')).toEqual([]);
  });

  test('normalizeEmbedWidgetSelection resets invalid model and offer type', () => {
    expect(
      normalizeEmbedWidgetSelection(SAMPLE_CATALOG, {
        make: 'Toyota',
        model: 'Missing',
        offerType: OfferTypeEnum.Cash,
      }),
    ).toEqual({
      make: 'Toyota',
      model: 'Camry',
      offerType: OfferTypeEnum.Lease,
    });
  });

  test('changing offer type filters make and model to valid combos', () => {
    expect(
      normalizeEmbedWidgetSelection(
        SAMPLE_CATALOG,
        { make: 'Toyota', model: 'Camry', offerType: OfferTypeEnum.Finance },
        'offerType',
      ),
    ).toEqual({
      make: 'Toyota',
      model: 'RAV4',
      offerType: OfferTypeEnum.Finance,
    });
    expect(getMakesForOfferType(SAMPLE_CATALOG, OfferTypeEnum.Lease)).toEqual(['BMW', 'Toyota']);
    expect(getModelsForMakeAndOfferType(SAMPLE_CATALOG, 'Toyota', OfferTypeEnum.Finance)).toEqual([
      'RAV4',
    ]);
  });

  test('pickDefaultEmbedSelections fills three columns from catalog order', () => {
    const defaults = pickDefaultEmbedSelections(SAMPLE_CATALOG, 3);
    expect(defaults).toHaveLength(3);
    expect(defaults[0]).toEqual({
      make: 'Toyota',
      model: 'Camry',
      offerType: OfferTypeEnum.Lease,
    });
    expect(defaults[1]).toEqual({
      make: 'Toyota',
      model: 'RAV4',
      offerType: OfferTypeEnum.Finance,
    });
  });
});
