'use client';

import * as React from 'react';
import { Button, Input, Select, useToast } from '@/components/ui';
import { OfferSelectionSection } from '@/components/admin/OfferSelectionSection';
import { ResizableSplit } from '@/components/admin/ResizableSplit';
import { generateOfferImages } from '@/app/actions/images';
import { groupOffersForCards, type CardGroup, type CardBrand } from '@/lib/domain/card-groups';
import type { SerializedOfferForSelection } from '@/components/admin/OfferSelectionSection';
import type { StoreCode } from '@/lib/config/stores';
import type { SpecialsBrand } from '@/lib/renderers/specials-shared';
import { GOOGLE_BANNER_PRESETS } from '@/lib/renderers/offer-image-banners-shared';
import { isDisclaimerEligible, showVehicleColumn } from '@/lib/renderers/banner-size-policy';
import {
  BANNER_THEME_OPTIONS,
  type BannerThemeId,
} from '@/lib/renderers/banner-theme-policy';
import { withTransientRetries } from '@/lib/utils/transient-action-retry';
import { validateBannerCompatibility } from '@/lib/renderers/banner-compatibility';

type GeneratedImage = {
  groupKey: string;
  filename: string;
  width: number;
  height: number;
  layout: string;
  webpBase64: string;
};

export default function ImagesPage() {
  const { add: showToast } = useToast();
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [selectedOffers, setSelectedOffers] = React.useState<SerializedOfferForSelection[]>([]);
  const [cardGroups, setCardGroups] = React.useState<
    Array<Pick<CardGroup<SerializedOfferForSelection>, 'groupKey' | 'title' | 'offers'>>
  >([]);
  const [orderedGroupKeys, setOrderedGroupKeys] = React.useState<string[]>([]);
  const [storeCode, setStoreCode] = React.useState('');
  const [presetId, setPresetId] = React.useState<string>('1080x1080');
  const [customWidth, setCustomWidth] = React.useState('1080');
  const [customHeight, setCustomHeight] = React.useState('1080');
  const [includeDisclaimer, setIncludeDisclaimer] = React.useState(true);
  const [themeId, setThemeId] = React.useState<BannerThemeId>('midnight');
  const [ctaText, setCtaText] = React.useState('Shop Now');
  const [generating, setGenerating] = React.useState(false);
  const [images, setImages] = React.useState<GeneratedImage[]>([]);
  const brandForStore = getBrandForStoreCode(storeCode);
  const cardBrand: CardBrand | undefined = brandForStore;

  const previewDimensions = React.useMemo(() => {
    if (presetId === 'custom') {
      const w = Math.min(4000, Math.max(100, Number(customWidth) || 100));
      const h = Math.min(4000, Math.max(50, Number(customHeight) || 50));
      return { width: w, height: h };
    }
    const preset = GOOGLE_BANNER_PRESETS.find((p) => p.id === presetId);
    return preset ? { width: preset.width, height: preset.height } : { width: 1080, height: 1080 };
  }, [presetId, customWidth, customHeight]);

  const disclaimerEligible = isDisclaimerEligible(previewDimensions.width, previewDimensions.height);
  const vehicleColumnEligible = showVehicleColumn(previewDimensions.width, previewDimensions.height);

  const bannerCompatibility = React.useMemo(
    () =>
      validateBannerCompatibility({
        width: previewDimensions.width,
        height: previewDimensions.height,
        groups: cardGroups.map((g) => ({
          groupKey: g.groupKey,
          title: g.title,
          offers: g.offers,
        })),
      }),
    [previewDimensions.width, previewDimensions.height, cardGroups]
  );

  React.useEffect(() => {
    if (!selectedOffers.length) {
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
    if (!cardGroups.length) {
      setOrderedGroupKeys([]);
      return;
    }
    setOrderedGroupKeys((prev) => {
      const valid = new Set(cardGroups.map((g) => g.groupKey));
      const next = prev.filter((k) => valid.has(k));
      for (const g of cardGroups) if (!next.includes(g.groupKey)) next.push(g.groupKey);
      return next;
    });
  }, [cardGroups]);

  const handleGenerate = async (overrideThemeId?: BannerThemeId) => {
    if (!storeCode || !selectedIds.length) {
      showToast({ message: 'Select a store and at least one offer', tone: 'error' });
      return;
    }
    if (!brandForStore) {
      showToast({ message: 'Please select a valid store', tone: 'error' });
      return;
    }
    if (!bannerCompatibility.ok) {
      showToast({ message: bannerCompatibility.message, tone: 'error' });
      return;
    }
    setGenerating(true);
    try {
      const result = await withTransientRetries(() =>
        generateOfferImages({
          brand: brandForStore,
          storeCode,
          offerIds: selectedIds,
          orderedGroupKeys,
          presetId,
          customWidth: Number(customWidth),
          customHeight: Number(customHeight),
          includeDisclaimer,
          themeId: overrideThemeId ?? themeId,
          ctaText: ctaText.trim() || 'Shop Now',
        })
      );
      if (!result.success) {
        showToast({ message: result.errors?.[0]?.message ?? 'Failed to generate images', tone: 'error' });
        return;
      }
      setImages(result.data.files);
      showToast({ message: `Generated ${result.data.files.length} WEBP file(s)` });
    } catch (error) {
      showToast({
        message:
          error instanceof Error ? error.message : 'An unexpected response was received from the server.',
        tone: 'error',
      });
    } finally {
      setGenerating(false);
    }
  };

  const downloadOne = (file: GeneratedImage) => {
    const bytes = Uint8Array.from(atob(file.webpBase64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/webp' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const openFullSize = (file: GeneratedImage) => {
    const bytes = Uint8Array.from(atob(file.webpBase64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: 'image/webp' });
    const url = URL.createObjectURL(blob);
    const tab = window.open(url, '_blank', 'noopener,noreferrer');
    if (!tab) {
      URL.revokeObjectURL(url);
      showToast({ message: 'Pop-up blocked — allow pop-ups to open full-size preview', tone: 'error' });
      return;
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const downloadAll = async () => {
    for (const file of images) {
      downloadOne(file);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-4 dark:border-neutral-700">
        <div>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Images</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Generate WEBP offer banners using specials-style templates at standard or custom sizes.
          </p>
        </div>
      </header>

      <OfferSelectionSection
        onSelectionChange={setSelectedIds}
        onSelectedOffersChange={setSelectedOffers}
        onFiltersApplied={({ storeCode: sc }) => setStoreCode(sc)}
        storeCodeRequired
        showYearFilter
        showOfferTypeFilter
        showConditionFilter
      />

      {selectedIds.length > 0 && (
        <section className="rounded-lg border border-neutral-200 bg-surface-slate p-4 dark:border-neutral-700 dark:bg-surface-slate-dark">
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <label className="text-xs text-neutral-600 dark:text-neutral-300">
              Banner Size
              <Select className="mt-1" value={presetId} onChange={(e) => setPresetId(e.target.value)}>
                {GOOGLE_BANNER_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.width}x{p.height} — {p.label}
                  </option>
                ))}
                <option value="custom">Custom</option>
              </Select>
            </label>
            {presetId === 'custom' && (
              <>
                <label className="text-xs text-neutral-600 dark:text-neutral-300">
                  Width
                  <Input className="mt-1" type="number" min={100} value={customWidth} onChange={(e) => setCustomWidth(e.target.value)} />
                </label>
                <label className="text-xs text-neutral-600 dark:text-neutral-300">
                  Height
                  <Input className="mt-1" type="number" min={50} value={customHeight} onChange={(e) => setCustomHeight(e.target.value)} />
                </label>
              </>
            )}
            <label className="text-xs text-neutral-600 dark:text-neutral-300">
              CTA Text
              <Input className="mt-1" value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder="Shop Now" />
            </label>
            <label className="text-xs text-neutral-600 dark:text-neutral-300">
              Theme
              <Select
                className="mt-1"
                value={themeId}
                onChange={(e) => {
                  const next = e.target.value as BannerThemeId;
                  setThemeId(next);
                  if (images.length > 0 && !generating) {
                    void handleGenerate(next);
                  }
                }}
              >
                {BANNER_THEME_OPTIONS.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
              <input type="checkbox" checked={includeDisclaimer} onChange={(e) => setIncludeDisclaimer(e.target.checked)} />
              Include disclaimer (when size allows)
            </label>
          </div>

          <div className="rounded-md border border-neutral-200 bg-white/80 px-3 py-2 text-xs text-neutral-600 dark:border-neutral-600 dark:bg-neutral-900/80 dark:text-neutral-300">
            <p className="font-medium text-neutral-800 dark:text-neutral-100">
              {previewDimensions.width}×{previewDimensions.height}px
            </p>
            {!disclaimerEligible && (
              <p className="mt-1 text-neutral-500 dark:text-neutral-400">
                Fine print is not shown at this size (too little vertical space).
              </p>
            )}
            {!vehicleColumnEligible && (
              <p className="mt-1 text-neutral-500 dark:text-neutral-400">
                Generic layouts omit the vehicle photo column at this size; preset templates may still show a cropped
                image.
              </p>
            )}
          </div>

          {!bannerCompatibility.ok && (
            <p className="mb-3 text-sm text-amber-800 dark:text-amber-200">{bannerCompatibility.message}</p>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Button
              onClick={() => void handleGenerate()}
              disabled={generating || !storeCode || !bannerCompatibility.ok}
            >
              {generating ? 'Rendering WEBP…' : 'Generate WEBP'}
            </Button>
            {images.length > 0 && (
              <Button variant="secondary" size="sm" onClick={downloadAll}>
                Download all ({images.length})
              </Button>
            )}
          </div>

          {orderedGroupKeys.length > 0 && cardGroups.length > 0 && (
            <div className="mb-4 rounded-md border border-dashed border-neutral-300 bg-white p-3 text-xs dark:border-neutral-600 dark:bg-neutral-900">
              <p className="mb-2 font-medium text-neutral-700 dark:text-neutral-200">Card order (drag to reorder)</p>
              <div className="flex flex-col gap-1">
                {orderedGroupKeys.map((key, index) => {
                  const group = cardGroups.find((g) => g.groupKey === key);
                  if (!group) return null;
                  return (
                    <div
                      key={key}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', key);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const fromKey = e.dataTransfer.getData('text/plain');
                        setOrderedGroupKeys((prev) => {
                          const fromIdx = prev.indexOf(fromKey);
                          const toIdx = prev.indexOf(key);
                          if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return prev;
                          const next = [...prev];
                          next.splice(fromIdx, 1);
                          next.splice(toIdx, 0, fromKey);
                          return next;
                        });
                      }}
                      className="flex cursor-move items-center justify-between rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                    >
                      <span className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400">{`#${index + 1}`}</span>
                      <span className="text-[11px] text-neutral-600 dark:text-neutral-300">{group.title}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {images.length > 0 && (
            <ResizableSplit
              leftLabel="Files"
              rightLabel="Preview"
              left={
                <div className="space-y-2 overflow-auto p-1">
                  {images.map((file) => (
                    <div key={file.groupKey} className="rounded border border-neutral-200 p-2 dark:border-neutral-700">
                      <p className="truncate text-xs font-medium">{file.filename}</p>
                      <p className="text-[11px] text-neutral-500">
                        {file.width}x{file.height} · {file.layout}
                      </p>
                      <Button className="mt-2" size="sm" variant="secondary" onClick={() => downloadOne(file)}>
                        Download
                      </Button>
                    </div>
                  ))}
                </div>
              }
              right={
                <div className="absolute inset-0 flex h-full w-full flex-col">
                  {images[0] && (
                    <p className="mb-1 shrink-0 text-center text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                      Preview · {images[0].width}×{images[0].height}px ({images[0].layout})
                    </p>
                  )}
                  {images[0] ? (
                    <button
                      type="button"
                      onClick={() => openFullSize(images[0])}
                      className="group relative min-h-0 flex-1 cursor-zoom-in overflow-hidden rounded border-0 bg-white p-2 text-left dark:bg-neutral-900"
                      title="Open full-size preview in new tab"
                    >
                      <img
                        alt={images[0].filename}
                        src={`data:image/webp;base64,${images[0].webpBase64}`}
                        className="h-full w-full object-contain"
                      />
                      <div className="pointer-events-none absolute bottom-3 right-3 rounded bg-black/65 px-2 py-1 text-[11px] text-white opacity-0 transition group-hover:opacity-100">
                        Open full size
                      </div>
                    </button>
                  ) : (
                    <div className="min-h-0 flex-1 rounded bg-white dark:bg-neutral-900" />
                  )}
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

