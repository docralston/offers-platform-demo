import type { OfferTypeEnum } from '@prisma/client';
import type { StoreCode } from '@/lib/config/stores';

export interface EmbedWidgetCatalogVariant {
  storeCode: StoreCode;
  year: number;
  offerType: OfferTypeEnum;
}

export interface EmbedWidgetCatalogModel {
  model: string;
  variants: EmbedWidgetCatalogVariant[];
}

export interface EmbedWidgetCatalogMake {
  make: string;
  models: EmbedWidgetCatalogModel[];
}

export type EmbedWidgetCatalog = EmbedWidgetCatalogMake[];

export interface EmbedWidgetSelection {
  make: string;
  model: string;
  offerType: OfferTypeEnum;
}

export function getModelsForMake(catalog: EmbedWidgetCatalog, make: string): EmbedWidgetCatalogModel[] {
  return catalog.find((entry) => entry.make === make)?.models ?? [];
}

export function getValidEmbedSelections(catalog: EmbedWidgetCatalog): EmbedWidgetSelection[] {
  const combos: EmbedWidgetSelection[] = [];
  for (const makeEntry of catalog) {
    for (const modelEntry of makeEntry.models) {
      for (const variant of modelEntry.variants) {
        combos.push({
          make: makeEntry.make,
          model: modelEntry.model,
          offerType: variant.offerType,
        });
      }
    }
  }
  return combos;
}

export function getAllOfferTypes(catalog: EmbedWidgetCatalog): OfferTypeEnum[] {
  return [...new Set(getValidEmbedSelections(catalog).map((entry) => entry.offerType))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function getMakesForOfferType(catalog: EmbedWidgetCatalog, offerType: OfferTypeEnum): string[] {
  return [
    ...new Set(
      getValidEmbedSelections(catalog)
        .filter((entry) => entry.offerType === offerType)
        .map((entry) => entry.make),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

export function getModelsForMakeAndOfferType(
  catalog: EmbedWidgetCatalog,
  make: string,
  offerType: OfferTypeEnum,
): string[] {
  return [
    ...new Set(
      getValidEmbedSelections(catalog)
        .filter((entry) => entry.make === make && entry.offerType === offerType)
        .map((entry) => entry.model),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

export function getOfferTypesForMakeModel(
  catalog: EmbedWidgetCatalog,
  make: string,
  model: string,
): OfferTypeEnum[] {
  const variants = getModelsForMake(catalog, make).find((entry) => entry.model === model)?.variants ?? [];
  return [...new Set(variants.map((v) => v.offerType))];
}

export function resolveEmbedWidgetSelection(
  catalog: EmbedWidgetCatalog,
  selection: EmbedWidgetSelection,
): EmbedWidgetCatalogVariant | null {
  const variants = getModelsForMake(catalog, selection.make).find((entry) => entry.model === selection.model)?.variants;
  if (!variants?.length) return null;
  return variants.find((v) => v.offerType === selection.offerType) ?? null;
}

export function normalizeEmbedWidgetSelection(
  catalog: EmbedWidgetCatalog,
  selection: Partial<EmbedWidgetSelection>,
  changedField?: 'make' | 'model' | 'offerType',
): EmbedWidgetSelection | null {
  const combos = getValidEmbedSelections(catalog);
  if (!combos.length) return null;

  if (changedField === 'offerType' && selection.offerType) {
    const forType = combos.filter((entry) => entry.offerType === selection.offerType);
    if (!forType.length) return null;

    const sameMakeAndModel = forType.find(
      (entry) => entry.make === selection.make && entry.model === selection.model,
    );
    if (sameMakeAndModel) return sameMakeAndModel;

    const sameMake = forType.find((entry) => entry.make === selection.make);
    if (sameMake) return sameMake;

    return forType[0];
  }

  if (changedField === 'make' && selection.make) {
    const forMake = combos.filter((entry) => entry.make === selection.make);
    if (!forMake.length) return null;

    if (selection.offerType) {
      const forMakeAndType = forMake.filter((entry) => entry.offerType === selection.offerType);
      if (forMakeAndType.length) {
        const sameModel = forMakeAndType.find((entry) => entry.model === selection.model);
        return sameModel ?? forMakeAndType[0];
      }
    }

    if (selection.model) {
      const sameModel = forMake.find((entry) => entry.model === selection.model);
      if (sameModel) return sameModel;
    }

    return forMake[0];
  }

  if (changedField === 'model' && selection.make && selection.model) {
    const forMakeAndModel = combos.filter(
      (entry) => entry.make === selection.make && entry.model === selection.model,
    );
    if (!forMakeAndModel.length) return null;

    if (selection.offerType) {
      const sameType = forMakeAndModel.find((entry) => entry.offerType === selection.offerType);
      if (sameType) return sameType;
    }

    return forMakeAndModel[0];
  }

  if (selection.make && catalog.some((entry) => entry.make === selection.make)) {
    const make = selection.make;
    const modelsOnMake = getModelsForMake(catalog, make);
    const modelEntry =
      modelsOnMake.find((entry) => entry.model === selection.model) ?? modelsOnMake[0];
    if (modelEntry) {
      const types = getOfferTypesForMakeModel(catalog, make, modelEntry.model);
      if (types.length) {
        const offerType =
          selection.offerType && types.includes(selection.offerType)
            ? selection.offerType
            : types[0];
        return { make, model: modelEntry.model, offerType };
      }
    }
  }

  return combos[0];
}

export function pickDefaultEmbedSelections(
  catalog: EmbedWidgetCatalog,
  columns = 3,
): EmbedWidgetSelection[] {
  const combos = getValidEmbedSelections(catalog);
  if (combos.length === 0) return [];
  const defaults: EmbedWidgetSelection[] = [];
  for (let i = 0; i < columns; i++) {
    defaults.push(combos[Math.min(i, combos.length - 1)]);
  }
  return defaults;
}
