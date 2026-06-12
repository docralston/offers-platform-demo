'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Script from 'next/script';
import type { OfferTypeEnum } from '@prisma/client';
import {
  getAllOfferTypes,
  getMakesForOfferType,
  getModelsForMakeAndOfferType,
  getOfferTypesForMakeModel,
  normalizeEmbedWidgetSelection,
  resolveEmbedWidgetSelection,
  pickDefaultEmbedSelections,
  type EmbedWidgetCatalog,
  type EmbedWidgetSelection,
} from '@/lib/embed/catalog';
import { getStoreDisplayId } from '@/lib/config/store-display';

export function embedSnippet(
  storeId: string,
  model: string,
  year: number,
  offerType: OfferTypeEnum,
  inactiveCtas = false,
) {
  const inactiveAttr = inactiveCtas ? '\n  data-inactive-ctas="true"' : '';
  return `<div
  data-offers-widget
  data-store="${storeId}"
  data-model="${model}"
  data-year="${year}"
  data-type="${offerType}"${inactiveAttr}
></div>
<script src="/embed/offers-widget.js" async></script>`;
}

function embedGridSnippet(selections: EmbedWidgetSelection[], catalog: EmbedWidgetCatalog): string {
  const widgets = selections
    .map((selection) => {
      const resolved = resolveEmbedWidgetSelection(catalog, selection);
      if (!resolved) return null;
      const storeId = getStoreDisplayId(resolved.storeCode);
      return `  <div class="offers-widget-col">
    <div
      data-offers-widget
      data-store="${storeId}"
      data-model="${selection.model}"
      data-year="${resolved.year}"
      data-type="${selection.offerType}"
    ></div>
  </div>`;
    })
    .filter(Boolean)
    .join('\n');

  return `<style>
.offers-widget-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }
.offers-widget-col { min-width: 0; width: 100%; }
.offers-widget-col [data-offers-widget] { width: 100%; }
@media (max-width: 1024px) { .offers-widget-row { grid-template-columns: 1fr; } }
</style>
<div class="offers-widget-row">
${widgets}
</div>
<script src="/embed/offers-widget.js" async></script>`;
}

interface ColumnProps {
  catalog: EmbedWidgetCatalog;
  columnIndex: number;
  selection: EmbedWidgetSelection;
  onChange: (index: number, next: EmbedWidgetSelection) => void;
}

function EmbedWidgetColumn({ catalog, columnIndex, selection, onChange }: ColumnProps) {
  const makes = useMemo(
    () => getMakesForOfferType(catalog, selection.offerType),
    [catalog, selection.offerType],
  );
  const models = useMemo(
    () => getModelsForMakeAndOfferType(catalog, selection.make, selection.offerType),
    [catalog, selection.make, selection.offerType],
  );
  const offerTypes = useMemo(() => getAllOfferTypes(catalog), [catalog]);
  const resolved = resolveEmbedWidgetSelection(catalog, selection);

  useEffect(() => {
    if (!resolved) return;
    const storeId = getStoreDisplayId(resolved.storeCode);
    const params = new URLSearchParams({
      store: storeId,
      model: selection.model,
      year: String(resolved.year),
      type: selection.offerType,
      inactiveCtas: '1',
    });
    const root = document.getElementById(`embed-widget-col-${columnIndex}`);
    if (!root) return;

    root.innerHTML = '<div data-offers-widget-loading="true">Loading current offers…</div>';
    fetch(`/api/public/offers/widget?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.text();
      })
      .then((html) => {
        root.innerHTML = html;
      })
      .catch(() => {
        root.innerHTML =
          '<div data-offers-widget-error="request-failed">Unable to load offers right now.</div>';
      });
  }, [columnIndex, resolved, selection.model, selection.offerType]);

  function updateMake(make: string) {
    const next = normalizeEmbedWidgetSelection(catalog, { ...selection, make }, 'make');
    if (next) onChange(columnIndex, next);
  }

  function updateModel(model: string) {
    const next = normalizeEmbedWidgetSelection(catalog, { ...selection, model }, 'model');
    if (next) onChange(columnIndex, next);
  }

  function updateOfferType(offerType: OfferTypeEnum) {
    const next = normalizeEmbedWidgetSelection(catalog, { ...selection, offerType }, 'offerType');
    if (next) onChange(columnIndex, next);
  }

  const selectClass =
    'w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100';

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="grid gap-2">
        <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400">
          Offer type
          <select
            className={`mt-1 ${selectClass}`}
            value={selection.offerType}
            onChange={(e) => updateOfferType(e.target.value as OfferTypeEnum)}
          >
            {offerTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400">
          Make
          <select
            className={`mt-1 ${selectClass}`}
            value={selection.make}
            onChange={(e) => updateMake(e.target.value)}
          >
            {makes.map((make) => (
              <option key={make} value={make}>
                {make}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400">
          Model
          <select
            className={`mt-1 ${selectClass}`}
            value={selection.model}
            onChange={(e) => updateModel(e.target.value)}
          >
            {models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        id={`embed-widget-col-${columnIndex}`}
        className="embed-widget-preview min-h-[280px] w-full overflow-hidden rounded-md border border-neutral-200 bg-neutral-50 p-0 dark:border-neutral-700 dark:bg-neutral-950/40 [&_.offers-widget-root]:w-full"
      />
    </div>
  );
}

interface EmbedWidgetShowcaseProps {
  catalog: EmbedWidgetCatalog;
}

export function EmbedWidgetShowcase({ catalog }: EmbedWidgetShowcaseProps) {
  const [selections, setSelections] = useState<EmbedWidgetSelection[]>(() =>
    pickDefaultEmbedSelections(catalog, 3),
  );

  const handleChange = useCallback((index: number, next: EmbedWidgetSelection) => {
    setSelections((prev) => {
      const copy = [...prev];
      copy[index] = next;
      return copy;
    });
  }, []);

  if (catalog.length === 0) {
    return (
      <p className="text-sm text-neutral-600 dark:text-neutral-300">
        No live offers are available to preview. Add or activate offers first.
      </p>
    );
  }

  const activeSelections =
    selections.length === 3 ? selections : pickDefaultEmbedSelections(catalog, 3);

  return (
    <>
      <div className="max-w-3xl">
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Configure three side-by-side widget previews. Offer type filters available makes and models;
          make and model filter available offer types. Previews use inert button links; copied embed
          code uses live inventory and contact URLs on the host site.
        </p>
      </div>

      <section className="mt-8 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="border-b border-neutral-200 bg-neutral-50 px-5 py-4 dark:border-neutral-800 dark:bg-neutral-950/60">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">3-column preview</h2>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
            Simulates a model landing page row with three embed slots.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-3">
          {activeSelections.map((selection, index) => (
            <EmbedWidgetColumn
              key={index}
              catalog={catalog}
              columnIndex={index}
              selection={selection}
              onChange={handleChange}
            />
          ))}
        </div>

        <details className="group border-t border-neutral-200 dark:border-neutral-800">
          <summary className="cursor-pointer list-none px-5 py-3 text-sm font-medium text-neutral-700 marker:content-none hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-950/60">
            <span className="group-open:hidden">Show embed code</span>
            <span className="hidden group-open:inline">Hide embed code</span>
          </summary>
          <pre className="overflow-x-auto border-t border-neutral-200 bg-neutral-950 px-5 py-4 text-xs leading-relaxed text-neutral-100 dark:border-neutral-800">
            {embedGridSnippet(activeSelections, catalog)}
          </pre>
        </details>
      </section>

      <Script src="/embed/offers-widget.js" strategy="afterInteractive" />
    </>
  );
}
