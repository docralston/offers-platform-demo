'use client';

import * as React from 'react';
import { Button } from '@/components/ui';
import { OfferSelectionSection } from '@/components/admin/OfferSelectionSection';
import { generateEmailHtml, type GenerateEmailHtmlSuccess } from '@/app/actions/emails';
import { useToast } from '@/components/ui';
import type { SerializedOfferForSelection } from '@/components/admin/OfferSelectionSection';
import { groupOffersForCards, type CardGroup } from '@/lib/domain/card-groups';
import { compareCardGroupsByOfferValue } from '@/lib/admin/card-group-auto-sort';
import { withTransientRetries } from '@/lib/utils/transient-action-retry';

export default function EmailsPage() {
  const { add: showToast } = useToast();
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [selectedOffers, setSelectedOffers] = React.useState<SerializedOfferForSelection[]>([]);
  const [cardGroups, setCardGroups] = React.useState<
    Array<Pick<CardGroup<SerializedOfferForSelection>, 'groupKey' | 'title' | 'offers'>>
  >([]);
  const [orderedGroupKeys, setOrderedGroupKeys] = React.useState<string[]>([]);
  const [storeCode, setStoreCode] = React.useState('');
  const [emailHtml, setEmailHtml] = React.useState('');
  const [disclaimerMinified, setDisclaimerMinified] = React.useState('');
  const [disclaimerAlerts, setDisclaimerAlerts] = React.useState<string[]>([]);
  const [generating, setGenerating] = React.useState(false);
  const [copyNotification, setCopyNotification] = React.useState(false);
  const [copyDisclaimerNotification, setCopyDisclaimerNotification] = React.useState(false);

  React.useEffect(() => {
    if (selectedOffers.length === 0) {
      setCardGroups([]);
      setOrderedGroupKeys([]);
      return;
    }
    const groups = groupOffersForCards(selectedOffers, storeCode || '', undefined).map((g) => ({
      groupKey: g.groupKey,
      title: g.title,
      offers: g.offers,
    }));
    setCardGroups(groups);
  }, [selectedOffers, storeCode]);

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
    const remainingKeys = orderedGroupKeys.filter((key) => !byKey.has(key));
    setOrderedGroupKeys([...sortedKeys, ...remainingKeys]);
  };

  const handleRemoveGroup = (groupKey: string, offerIds: string[]) => {
    setOrderedGroupKeys((prev) => prev.filter((key) => key !== groupKey));
    setSelectedIds((prev) => prev.filter((id) => !offerIds.includes(id)));
  };

  const handleGenerate = async () => {
    if (!storeCode || selectedIds.length === 0) {
      showToast({ message: 'Select a store and at least one offer', tone: 'error' });
      return;
    }
    setGenerating(true);
    try {
      const result = await withTransientRetries(() =>
        generateEmailHtml(storeCode, selectedIds, orderedGroupKeys)
      );
      if (result.success) {
        const d: GenerateEmailHtmlSuccess = result.data;
        setEmailHtml(d.html);
        setDisclaimerMinified(d.disclaimerMinified);
        setDisclaimerAlerts(d.disclaimerAlerts);
        showToast({ message: 'Email HTML generated' });
      } else {
        showToast({ message: result.errors?.[0]?.message ?? 'Failed', tone: 'error' });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'An unexpected response was received from the server.';
      showToast({ message, tone: 'error' });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!emailHtml) return;
    try {
      await navigator.clipboard.writeText(emailHtml);
      setCopyNotification(true);
      setTimeout(() => setCopyNotification(false), 3000);
      showToast({ message: 'Copied to clipboard' });
    } catch {
      showToast({ message: 'Copy failed', tone: 'error' });
    }
  };

  const handleCopyDisclaimer = async () => {
    if (!disclaimerMinified) return;
    try {
      await navigator.clipboard.writeText(disclaimerMinified);
      setCopyDisclaimerNotification(true);
      setTimeout(() => setCopyDisclaimerNotification(false), 3000);
      showToast({ message: 'Disclaimer copied' });
    } catch {
      showToast({ message: 'Copy failed', tone: 'error' });
    }
  };

  const handleDownload = () => {
    if (!emailHtml) return;
    const blob = new Blob([wrapEmailForPreview(emailHtml)], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'parcel-email.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-4 dark:border-neutral-700">
        <div>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Emails</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Preview and copy parcel.io-safe, caniemail.org-compliant email HTML for selected offers
          </p>
        </div>
      </header>

      <OfferSelectionSection
        onSelectionChange={setSelectedIds}
        selectedIdsExternal={selectedIds}
        onSelectedOffersChange={setSelectedOffers}
        onFiltersApplied={({ storeCode: sc }) => setStoreCode(sc)}
        storeCodeRequired
        showOfferTypeFilter
        showConditionFilter
        showYearFilter
        showAutoSelectFullCards
      />

      {selectedIds.length > 0 && (
        <section className="rounded-lg border border-neutral-200 bg-surface-slate p-4 dark:border-neutral-700 dark:bg-surface-slate-dark">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Button
              onClick={handleGenerate}
              disabled={generating || !storeCode}
            >
              {generating ? 'Generating…' : 'Generate email'}
            </Button>
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              <span>
                After generating, you can copy or download HTML to paste into parcel.io or your ESP.
              </span>
            </div>
            {emailHtml && (
              <>
                <Button variant="secondary" size="sm" onClick={handleCopy}>
                  Copy HTML
                </Button>
                <Button variant="secondary" size="sm" onClick={handleCopyDisclaimer} disabled={!disclaimerMinified}>
                  Copy disclaimer
                </Button>
                <Button variant="secondary" size="sm" onClick={handleDownload}>
                  Download .html
                </Button>
                {copyNotification && (
                  <span className="text-sm text-neutral-500">Copied</span>
                )}
                {copyDisclaimerNotification && (
                  <span className="text-sm text-neutral-500">Disclaimer copied</span>
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

          {emailHtml && (
            <div className="space-y-4">
              {disclaimerAlerts.length > 0 && (
                <div
                  role="status"
                  className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100"
                >
                  <p className="font-medium">Disclaimer / APR notes</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5">
                    {disclaimerAlerts.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-col">
                <h2 className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Disclaimer (single line, copy for ESP)
                </h2>
                <textarea
                  readOnly
                  value={disclaimerMinified}
                  rows={3}
                  className="w-full resize-y rounded-md border border-neutral-300 bg-neutral-50 font-mono text-xs leading-snug dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="flex flex-col">
                  <h2 className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">HTML (paste into parcel.io)</h2>
                  <textarea
                    readOnly
                    value={emailHtml}
                    rows={14}
                    className="w-full resize-y rounded-md border border-neutral-300 bg-neutral-50 font-mono text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
                  />
                </div>
                <div className="flex flex-col">
                  <h2 className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">Preview</h2>
                  <iframe
                    title="Email preview"
                    srcDoc={wrapEmailForPreview(emailHtml)}
                    className="h-[400px] w-full resize-y rounded-md border border-neutral-200 bg-white dark:border-neutral-600 dark:bg-neutral-900"
                    sandbox="allow-same-origin"
                  />
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function wrapEmailForPreview(gridHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style type="text/css">
  body { margin: 0; padding: 12px; font-family: Arial, Helvetica, sans-serif; }
  @media screen and (max-width: 480px) {
    .veh-grid-cell { display: block !important; width: 100% !important; max-width: 100% !important; }
  }
</style>
</head>
<body>
${gridHtml}
</body>
</html>`;
}
