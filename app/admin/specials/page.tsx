'use client';

import * as React from 'react';
import { Button } from '@/components/ui';
import { OfferSelectionSection } from '@/components/admin/OfferSelectionSection';
import { ResizableSplit } from '@/components/admin/ResizableSplit';
import { generateSpecialsHtml } from '@/app/actions/specials';
import { useToast } from '@/components/ui';
import type { SpecialsBrand } from '@/lib/renderers/specials-shared';
import type { StoreCode } from '@/lib/config/stores';
import type { SerializedOfferForSelection } from '@/components/admin/OfferSelectionSection';
import { groupOffersForCards, type CardGroup, type CardBrand } from '@/lib/domain/card-groups';
import { compareCardGroupsByOfferValue } from '@/lib/admin/card-group-auto-sort';
import { withTransientRetries } from '@/lib/utils/transient-action-retry';

export default function SpecialsPage() {
  const { add: showToast } = useToast();
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [selectedOffers, setSelectedOffers] = React.useState<SerializedOfferForSelection[]>([]);
  const [cardGroups, setCardGroups] = React.useState<
    Array<Pick<CardGroup<SerializedOfferForSelection>, 'groupKey' | 'title' | 'offers'>>
  >([]);
  const [orderedGroupKeys, setOrderedGroupKeys] = React.useState<string[]>([]);
  const [storeCode, setStoreCode] = React.useState('');
  const [html, setHtml] = React.useState('');
  const [generating, setGenerating] = React.useState(false);
  const [copyNotification, setCopyNotification] = React.useState(false);
  const brandForStore = getBrandForStoreCode(storeCode);
  const cardBrand: CardBrand | undefined = brandForStore;

  React.useEffect(() => {
    if (selectedOffers.length === 0) {
      setCardGroups([]);
      setOrderedGroupKeys([]);
      return;
    }
    const groups = groupOffersForCards(selectedOffers, storeCode || '', cardBrand).map((g) => ({
      groupKey: g.groupKey,
      title: g.title,
      offers: g.offers,
    }));
    setCardGroups(groups);
  }, [selectedOffers, storeCode, cardBrand]);

  React.useEffect(() => {
    if (cardGroups.length === 0) {
      setOrderedGroupKeys([]);
      return;
    }
    setOrderedGroupKeys((prev) => {
      const validKeys = new Set(cardGroups.map((g) => g.groupKey));
      const next = prev.filter((k) => validKeys.has(k));
      for (const g of cardGroups) {
        if (!next.includes(g.groupKey)) next.push(g.groupKey);
      }
      return next;
    });
  }, [cardGroups]);

  const handleReorder = (fromKey: string, toKey: string) => {
    setOrderedGroupKeys((prev) => {
      const fromIndex = prev.indexOf(fromKey);
      const toIndex = prev.indexOf(toKey);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return prev;
      const next = [...prev];
      next.splice(fromIndex, 1);
      next.splice(toIndex, 0, fromKey);
      return next;
    });
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, key: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', key);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, targetKey: string) => {
    e.preventDefault();
    const fromKey = e.dataTransfer.getData('text/plain');
    if (fromKey) {
      handleReorder(fromKey, targetKey);
    }
  };

  const handleAutoSortCards = () => {
    if (cardGroups.length === 0) return;
    const byKey = new Map(cardGroups.map((group) => [group.groupKey, group]));
    const sorted = [...cardGroups].sort((a, b) => compareCardGroupsByOfferValue(a, b));
    const sortedKeys = sorted.map((group) => group.groupKey);
    // Keep any existing-but-not-current keys at the end, preserving manual order state.
    const remainingKeys = orderedGroupKeys.filter((key) => !byKey.has(key));
    setOrderedGroupKeys([...sortedKeys, ...remainingKeys]);
  };

  const handleRemoveGroup = (groupKey: string, offerIds: string[]) => {
    setOrderedGroupKeys((prev) => prev.filter((key) => key !== groupKey));
    setSelectedIds((prev) => prev.filter((id) => !offerIds.includes(id)));
  };

  const handleGenerate = async () => {
    if (!storeCode || selectedIds.length === 0) {
      showToast({
        message: 'Select a store and at least one offer',
        tone: 'error',
      });
      return;
    }
    if (!brandForStore) {
      showToast({
        message: 'Please select a valid store',
        tone: 'error',
      });
      return;
    }
    setGenerating(true);
    try {
      const result = await withTransientRetries(() =>
        generateSpecialsHtml(brandForStore, storeCode, selectedIds, orderedGroupKeys)
      );
      if (result.success) {
        setHtml(result.data);
        showToast({ message: 'Web specials HTML generated' });
      } else {
        showToast({
          message: result.errors?.[0]?.message ?? 'Failed',
          tone: 'error',
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unexpected response was received from the server.';
      showToast({
        message,
        tone: 'error',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!html) return;
    try {
      await navigator.clipboard.writeText(html);
      setCopyNotification(true);
      setTimeout(() => setCopyNotification(false), 3000);
      showToast({ message: 'Copied to clipboard' });
    } catch {
      showToast({ message: 'Copy failed', tone: 'error' });
    }
  };

  const handleDownload = () => {
    if (!html) return;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${storeCode.toLowerCase()}-specials.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-4 dark:border-neutral-700">
        <div>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            Web Specials
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Generate web specials cards for selected offers. Choose a store, select offers, then generate or copy HTML.
          </p>
        </div>
      </header>

      <OfferSelectionSection
        onSelectionChange={setSelectedIds}
        selectedIdsExternal={selectedIds}
        onSelectedOffersChange={setSelectedOffers}
        onFiltersApplied={({ storeCode: sc }) => setStoreCode(sc)}
        storeCodeRequired
        showYearFilter
        showOfferTypeFilter
        showConditionFilter
        showAutoSelectFullCards
      />

      {selectedIds.length > 0 && (
        <section className="rounded-lg border border-neutral-200 bg-surface-slate p-4 dark:border-neutral-700 dark:bg-surface-slate-dark">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Button
              onClick={handleGenerate}
              disabled={generating || !storeCode}
            >
              {generating ? 'Generating…' : 'Generate HTML'}
            </Button>
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              <span>
                After generating, you can copy or download the HTML for your CMS.
              </span>
            </div>
            {html && (
              <>
                <Button variant="secondary" size="sm" onClick={handleCopy}>
                  Copy to clipboard
                </Button>
                <Button variant="secondary" size="sm" onClick={handleDownload}>
                  Download .html
                </Button>
                {copyNotification && (
                  <span className="text-sm text-neutral-500">Copied</span>
                )}
              </>
            )}
          </div>

          {orderedGroupKeys.length > 0 && cardGroups.length > 0 && (
            <div className="mb-4 rounded-md border border-dashed border-neutral-300 bg-white p-3 text-xs dark:border-neutral-600 dark:bg-neutral-900">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-neutral-700 dark:text-neutral-200">
                  Card order (drag to reorder)
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleAutoSortCards}
                >
                  Auto-sort by payment, then APR
                </Button>
              </div>
              <div className="flex flex-col gap-1">
                {orderedGroupKeys.map((key, index) => {
                  const group = cardGroups.find((g) => g.groupKey === key);
                  if (!group) return null;
                  const hasLease = group.offers.some((o) => o.offerType === 'Lease');
                  const hasFinance = group.offers.some((o) => o.offerType === 'Finance');
                  const hasBuy = group.offers.some(
                    (o) => o.offerType === 'Cash' || o.offerType === 'Other'
                  );
                  return (
                  <div
                    key={key}
                    draggable
                    onDragStart={(e) => handleDragStart(e, key)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, key)}
                    className="flex cursor-move items-center justify-between rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">
                        {`#${index + 1}`}
                      </span>
                      <div className="flex items-center gap-1">
                        {hasLease && (
                          <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
                            Lease
                          </span>
                        )}
                        {hasFinance && (
                          <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                            Finance
                          </span>
                        )}
                        {hasBuy && (
                          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                            Buy
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-neutral-600 dark:text-neutral-300">
                        {group.title}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveGroup(key, group.offers.map((offer) => offer.id))}
                      className="inline-flex h-5 w-5 items-center justify-center rounded border border-neutral-300 text-[12px] font-semibold leading-none text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
                      aria-label={`Remove ${group.title}`}
                      title="Remove from card order"
                    >
                      ×
                    </button>
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {html && (
            <ResizableSplit
              leftLabel="HTML"
              rightLabel="Preview"
              left={
                <textarea
                  readOnly
                  value={html}
                  rows={20}
                  className="h-full min-h-full w-full resize-none rounded border border-neutral-300 bg-neutral-50 p-2 font-mono text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                />
              }
              right={
                <div className="absolute inset-0 h-full w-full">
                  <iframe
                    key="preview"
                    title="Specials preview"
                    srcDoc={html}
                    className="h-full w-full rounded border-0 bg-white dark:bg-neutral-900"
                    sandbox="allow-same-origin"
                  />
                </div>
              }
            />
          )}
        </section>
      )}
    </div>
  );
}

function getBrandForStoreCode(storeCode: string): SpecialsBrand | undefined {
  const store = storeCode as StoreCode;
  if (store === 'TOY') return 'toyota';
  if (store === 'BMW') return 'bmw';
  if (store === 'LEXDT' || store === 'LEXWG') return 'lexus';
  return undefined;
}

