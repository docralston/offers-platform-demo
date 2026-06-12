'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import {
  Button,
  FormGroup,
  Input,
  Modal,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  useToast,
} from '@/components/ui';
import { ResizableSplit } from '@/components/admin/ResizableSplit';
import type { ListMetaResult, ModelWithSlug } from './types';
import type { ModelPagesListRow } from '@/app/actions/model-pages';
import {
  getModelsForYear,
  listPagesInScope,
  discardPage,
  getPageHtml,
  getLineupSummary,
  getLineupHtml,
  getPageContent,
  regenerateFaqs,
  refreshSearchQueries,
  refreshAllSearchQueries,
  getSearchQueriesText,
  regenerateWhyBullets,
  regenerateLocalSections,
  injectPageInternalLinks,
  regenerateSeoTitle,
  regenerateSeoDescription,
  regenerateLineupSeoTitle,
  regenerateLineupSeoDescription,
} from '@/app/actions/model-pages';
import { ViewPageModal } from './ViewPageModal';
import { formatOemBrandLabel } from '@/lib/config/oem-labels';
import type { ModelYearPage } from '@/lib/model-page-generator/schema';
import { applyCheckboxSelection } from '@/lib/utils/checkbox-selection';
import { demoLlmRequestHeaders } from '@/lib/demo-llm/client';

function stripPageCode(html: string): string {
  // Remove HTML comments
  let cleaned = html.replace(/<!--[\s\S]*?-->/g, '');
  // Remove JS/CSS block comments
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove single-line comments starting with // (excluding URLs like https://)
  cleaned = cleaned.replace(/(^|[^\w:])\/\/(?!\/).*$/gm, '$1');
  return cleaned.trim();
}

/** Matches `renderContentSections` in lab/modelpager/scripts/render-model-page.js */
function escapeHtmlForContentSnippet(s: string | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildRenderedContentSectionCardHtml(sec: {
  title?: string;
  bodyHtml?: string;
  standalone?: boolean;
}): string {
  const title = escapeHtmlForContentSnippet(sec.title || '');
  const body = String(sec.bodyHtml || '');
  if (!title && !body) return '';
  if (!sec.standalone) {
    return (
      '\n<section class="tto-card">' +
      '<h2 class="tto-h2">' +
      title +
      '</h2>' +
      '<div class="tto-body">' +
      body +
      '</div>' +
      '</section>'
    ).trim();
  }
  return (
    '\n<div class="tto-standalone-snippet">' +
    '<style>.tto-standalone-snippet{--tto-ink:#111827;--tto-muted:#6b7280;--tto-bg:#ffffff;--tto-line:rgba(17,24,39,.12);--tto-radius:0;font-family:inherit;color:var(--tto-ink);background:var(--tto-bg)}.tto-standalone-snippet .tto-card{background:var(--tto-bg);border:1px solid var(--tto-line);border-radius:var(--tto-radius);box-shadow:0 1px 0 rgba(0,0,0,.03);padding:18px}.tto-standalone-snippet .tto-h2{font-size:22px;line-height:1.2;margin:0 0 12px;font-family:inherit;color:var(--tto-ink)}.tto-standalone-snippet .tto-body{color:var(--tto-muted)}.tto-standalone-snippet .tto-body p{margin:12px 0;line-height:1.6;color:var(--tto-ink)}.tto-standalone-snippet .tto-body ul{margin:0;padding:0;list-style:none}</style>' +
    '<section class="tto-card">' +
    '<h2 class="tto-h2">' +
    title +
    '</h2>' +
    '<div class="tto-body">' +
    body +
    '</div>' +
    '</section>' +
    '</div>'
  ).trim();
}

const VIEWPORT_OPTIONS: { value: number; label: string }[] = [
  { value: 1920, label: '1920px — Desktop (Full HD)' },
  { value: 1440, label: '1440px — Desktop (Large)' },
  { value: 1024, label: '1024px — Laptop / small desktop' },
  { value: 834, label: '834px — iPad Air' },
  { value: 768, label: '768px — Tablet portrait' },
  { value: 430, label: '430px — iPhone 17 Pro Max' },
  { value: 393, label: '393px — iPhone 17' },
  { value: 360, label: '360px — Samsung Galaxy S25' },
];

/** Models per `/api/model-pages/generate` request (server max is 50). */
const MODEL_PAGE_GENERATE_CHUNK_SIZE = 50;
const TABLE_COL_SPAN = 8;
const MIN_MODEL_LIST_HEIGHT_PX = 120;
const SEO_TITLE_MAX = 60;
const SEO_DESCRIPTION_MAX = 158;

interface ModelPagesClientProps {
  initialMeta: ListMetaResult | null;
}

function formatShortDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return '—';
  }
}

function formatElapsed(ms: number): string {
  const safeMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

type GenerationRunStatus = 'success' | 'failed' | 'warning';

type GenerationRunHistoryEntry = {
  id: string;
  ts: number;
  brand: string;
  year: number;
  storeKey: string | null;
  actionLabel: string;
  modelsLabel: string;
  status: GenerationRunStatus;
  summary: string;
  validationWarnings?: { slug: string; messages: string[] }[];
};

export function ModelPagesClient({ initialMeta }: ModelPagesClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { add: showToast } = useToast();
  const { isLoaded: isClerkLoaded, isSignedIn } = useAuth();
  const authReady = isClerkLoaded && isSignedIn;
  const meta = initialMeta;
  const [brand, setBrand] = React.useState('');
  const [year, setYear] = React.useState<number | ''>('');
  const [storeKey, setStoreKey] = React.useState('');
  const [models, setModels] = React.useState<ModelWithSlug[]>([]);
  const [selectedSlugs, setSelectedSlugs] = React.useState<Set<string>>(new Set());
  const [lastSelectedModelIndex, setLastSelectedModelIndex] = React.useState<number | null>(
    null,
  );
  const [modelSearch, setModelSearch] = React.useState('');
  const [loadingModels, setLoadingModels] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [generateProgress, setGenerateProgress] = React.useState<string | null>(null);
  const [generateStartedAt, setGenerateStartedAt] = React.useState<number | null>(null);
  const [generateNowTick, setGenerateNowTick] = React.useState<number>(Date.now());
  const [results, setResults] = React.useState<ModelPagesListRow[]>([]);
  const [loadingResults, setLoadingResults] = React.useState(false);
  const [viewSlug, setViewSlug] = React.useState<string | null>(null);
  const [pageHtml, setPageHtml] = React.useState<string | null>(null);
  const [bmwSecondSectionHtml, setBmwSecondSectionHtml] = React.useState<string | null>(null);
  const [bmwSecondSectionTitle, setBmwSecondSectionTitle] = React.useState<string | null>(null);
  const [loadingHtml, setLoadingHtml] = React.useState(false);
  /** Bumped when on-disk page JSON changes so preview refetches while `viewSlug` stays the same. */
  const [previewHtmlEpoch, setPreviewHtmlEpoch] = React.useState(0);
  const [showDevicePreview, setShowDevicePreview] = React.useState(false);
  const [viewportWidth, setViewportWidth] = React.useState<number>(1920);
  const [editSlug, setEditSlug] = React.useState<string | null>(null);
  const [lineupSummary, setLineupSummary] = React.useState<
    { slug: string; url: string; title: string; description: string } | null
  >(null);
  const [loadingLineupSummary, setLoadingLineupSummary] = React.useState(false);
  const [lineupHtml, setLineupHtml] = React.useState<string | null>(null);
  const [loadingLineupHtml, setLoadingLineupHtml] = React.useState(false);
  const [regeneratingLineupTitle, setRegeneratingLineupTitle] = React.useState(false);
  const [regeneratingLineupDescription, setRegeneratingLineupDescription] = React.useState(false);
  const [peekSlug, setPeekSlug] = React.useState<string | null>(null);
  const [peekText, setPeekText] = React.useState<string>('');
  const [refreshingSlug, setRefreshingSlug] = React.useState<string | null>(null);
  const [refreshingAllQueries, setRefreshingAllQueries] = React.useState(false);
  const [showGenerateAllConfirm, setShowGenerateAllConfirm] = React.useState(false);
  const [regeneratingSeoKeys, setRegeneratingSeoKeys] = React.useState<Set<string>>(new Set());
  const [seoUpdatedKeys, setSeoUpdatedKeys] = React.useState<Set<string>>(new Set());
  const [runHistory, setRunHistory] = React.useState<GenerationRunHistoryEntry[]>([]);
  /** Slugs whose result rows are shown in compact (collapsed) layout */
  const [collapsedResultSlugs, setCollapsedResultSlugs] = React.useState<Set<string>>(
    () => new Set()
  );

  const scopeStackRef = React.useRef<HTMLDivElement>(null);
  const [modelListPanelHeight, setModelListPanelHeight] = React.useState(MIN_MODEL_LIST_HEIGHT_PX);
  const [isLgViewport, setIsLgViewport] = React.useState(false);

  const years = brand ? (meta?.yearsByBrand[brand] ?? []) : [];
  const stores = brand ? (meta?.storesByBrand[brand] ?? []) : [];
  const showStore = Boolean(brand && stores.length > 1);

  const scopeStoreKey = showStore ? storeKey || null : null;

  /** Slugs to generate for "Generate all except" = all models in scope minus checklist selection. */
  const slugsGenerateExceptSelected = React.useMemo(
    () => models.map((m) => m.slug).filter((slug) => !selectedSlugs.has(slug)),
    [models, selectedSlugs]
  );

  const bumpPreviewHtml = React.useCallback(() => {
    setPreviewHtmlEpoch((e) => e + 1);
  }, []);

  const pushRunHistory = React.useCallback(
    (entry: Omit<GenerationRunHistoryEntry, 'id' | 'ts'>) => {
      setRunHistory((prev) => {
        const id = `run-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const full: GenerationRunHistoryEntry = { ...entry, id, ts: Date.now() };
        return [full, ...prev].slice(0, 3);
      });
    },
    []
  );

  React.useEffect(() => {
    if (!generating || generateStartedAt == null) return;
    const id = window.setInterval(() => setGenerateNowTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [generating, generateStartedAt]);

  React.useEffect(() => {
    if (!meta || brand) return;
    const b = searchParams.get('brand');
    const y = searchParams.get('year');
    const s = searchParams.get('storeKey');
    if (b && meta.brands.includes(b)) setBrand(b);
    if (y) {
      const n = parseInt(y, 10);
      if (!Number.isNaN(n)) setYear(n);
    }
    if (s) setStoreKey(s);
  }, [meta, searchParams, brand]);

  React.useEffect(() => {
    if (!brand || year === '') return;
    const q = new URLSearchParams();
    q.set('brand', brand);
    q.set('year', String(year));
    if (showStore && storeKey) q.set('storeKey', storeKey);
    router.replace(`/admin/model-pages?${q.toString()}`, { scroll: false });
  }, [brand, year, storeKey, showStore, router]);

  React.useEffect(() => {
    if (!brand || year === '') {
      setModels([]);
      setSelectedSlugs(new Set());
      setLastSelectedModelIndex(null);
      return;
    }
    if (!authReady) {
      setModels([]);
      setSelectedSlugs(new Set());
      setLastSelectedModelIndex(null);
      return;
    }
    setLoadingModels(true);
    getModelsForYear(brand, year as number)
      .then((r) => {
        if (r.success && r.data) setModels(r.data);
        else setModels([]);
        setSelectedSlugs(new Set());
        setLastSelectedModelIndex(null);
      })
      .finally(() => setLoadingModels(false));
  }, [brand, year, authReady]);

  const loadResults = React.useCallback(async () => {
    if (!brand || year === '' || !authReady) return;
    if (showStore && !storeKey) {
      setResults([]);
      return;
    }
    setLoadingResults(true);
    const r = await listPagesInScope(brand, year as number, scopeStoreKey);
    setLoadingResults(false);
    if (r.success && r.data) setResults(r.data);
    else setResults([]);
  }, [brand, year, scopeStoreKey, showStore, storeKey, authReady]);

  React.useEffect(() => {
    if (brand && year !== '') loadResults();
    else {
      setResults([]);
      setLineupSummary(null);
      setLineupHtml(null);
    }
  }, [brand, year, scopeStoreKey, loadResults]);

  React.useEffect(() => {
    const slugs = new Set(results.map((r) => r.slug));
    setCollapsedResultSlugs((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set<string>();
      for (const s of prev) {
        if (slugs.has(s)) next.add(s);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [results]);

  const toggleResultRowCollapsed = React.useCallback((slug: string) => {
    setCollapsedResultSlugs((prev) => {
      const willCollapse = !prev.has(slug);
      if (willCollapse) {
        setViewSlug((current) => (current === slug ? null : current));
      }
      const next = new Set(prev);
      if (willCollapse) next.add(slug);
      else next.delete(slug);
      return next;
    });
  }, []);

  const collapseAllResultRows = React.useCallback(() => {
    setCollapsedResultSlugs(new Set(results.map((r) => r.slug)));
    setViewSlug(null);
  }, [results]);

  const expandAllResultRows = React.useCallback(() => {
    setCollapsedResultSlugs(new Set());
  }, []);

  React.useEffect(() => {
    if (!authReady || !brand || year === '' || (showStore && !storeKey)) {
      setLineupSummary(null);
      setLineupHtml(null);
      return;
    }
    let cancelled = false;
    setLoadingLineupSummary(true);
    getLineupSummary(brand, year as number, scopeStoreKey)
      .then((r) => {
        if (cancelled) return;
        setLoadingLineupSummary(false);
        if (r.success) {
          setLineupSummary(r.data ?? null);
        } else {
          setLineupSummary(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setLoadingLineupSummary(false);
        setLineupSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [brand, year, scopeStoreKey, showStore, storeKey, authReady]);

  React.useEffect(() => {
    if (!authReady || !viewSlug || !brand || year === '' || (showStore && !storeKey)) {
      setPageHtml(null);
      setBmwSecondSectionHtml(null);
      setBmwSecondSectionTitle(null);
      setLoadingHtml(false);
      return;
    }
    let cancelled = false;
    setLoadingHtml(true);
    Promise.all([
      getPageHtml(brand, year as number, scopeStoreKey, viewSlug),
      getPageContent(brand, year as number, scopeStoreKey, viewSlug),
    ])
      .then(([htmlRes, jsonRes]) => {
        if (cancelled) return;
        setLoadingHtml(false);

        const baseHtml = htmlRes.success && htmlRes.data ? stripPageCode(htmlRes.data) : null;
        const pageJson: ModelYearPage | null = jsonRes.success && jsonRes.data ? jsonRes.data : null;

        let finalHtml = baseHtml;
        let secondSectionHtml: string | null = null;
        let secondSectionTitle: string | null = null;

        if (baseHtml && pageJson && brand.toLowerCase() === 'bmw') {
          const sections = (pageJson.contentSections ?? [])
            .filter((sec) => (sec.title?.trim() || sec.bodyHtml?.trim()))
            .slice(0, 2);

          const second = sections[1];
          if (second) {
            const secondCardHtml = buildRenderedContentSectionCardHtml(second);
            secondSectionHtml = buildRenderedContentSectionCardHtml({
              ...second,
              standalone: true,
            });
            secondSectionTitle = second.title ?? null;
            if (secondCardHtml) {
              // Remove the second long-form section from the main HTML/iframe preview.
              const idx = baseHtml.lastIndexOf(secondCardHtml);
              if (idx >= 0) {
                finalHtml =
                  baseHtml.slice(0, idx) + baseHtml.slice(idx + secondCardHtml.length);
              }
            }
          }
        }

        setPageHtml(finalHtml);
        setBmwSecondSectionHtml(secondSectionHtml);
        setBmwSecondSectionTitle(secondSectionTitle);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadingHtml(false);
        setPageHtml(null);
        setBmwSecondSectionHtml(null);
        setBmwSecondSectionTitle(null);
      });
    return () => {
      cancelled = true;
    };
  }, [viewSlug, brand, year, scopeStoreKey, showStore, storeKey, authReady, previewHtmlEpoch]);

  const handleCopyBmwSecondSectionHtml = React.useCallback(async () => {
    if (!bmwSecondSectionHtml) return;
    try {
      await navigator.clipboard.writeText(bmwSecondSectionHtml);
      showToast({ message: 'Copied' });
    } catch {
      showToast({ message: 'Copy failed', tone: 'error' });
    }
  }, [bmwSecondSectionHtml, showToast]);

  const handleCopyPageCode = React.useCallback(async () => {
    if (!pageHtml) return;
    try {
      await navigator.clipboard.writeText(pageHtml);
      showToast({ message: 'Copied to clipboard' });
    } catch {
      showToast({ message: 'Copy failed', tone: 'error' });
    }
  }, [pageHtml, showToast]);

  const handleLoadLineupHtml = React.useCallback(async () => {
    if (!brand || year === '') return;
    setLoadingLineupHtml(true);
    try {
      const r = await getLineupHtml(brand, year as number, scopeStoreKey);
      if (r.success && r.data) {
        setLineupHtml(stripPageCode(r.data));
      } else {
        setLineupHtml(null);
        if (r.errors && r.errors[0]) {
          showToast({ message: r.errors[0].message, tone: 'error' });
        }
      }
    } catch (e) {
      setLineupHtml(null);
      showToast({ message: (e as Error).message, tone: 'error' });
    } finally {
      setLoadingLineupHtml(false);
    }
  }, [brand, year, scopeStoreKey, showToast]);

  const handleCopyLineupCode = React.useCallback(async () => {
    if (!lineupHtml) return;
    try {
      await navigator.clipboard.writeText(lineupHtml);
      showToast({ message: 'Copied lineup HTML to clipboard' });
    } catch {
      showToast({ message: 'Copy failed', tone: 'error' });
    }
  }, [lineupHtml, showToast]);

  const handleLineupRegenerateTitle = React.useCallback(async () => {
    if (!brand || year === '' || !lineupSummary) return;
    setRegeneratingLineupTitle(true);
    try {
      const r = await regenerateLineupSeoTitle(brand, year as number, scopeStoreKey);
      if (!r.success || !r.data) {
        showToast({ message: r.errors?.[0]?.message ?? 'Failed', tone: 'error' });
        return;
      }
      setLineupSummary((prev) =>
        prev
          ? {
              ...prev,
              title: r.data?.title ?? prev.title,
              description: r.data?.description ?? prev.description,
            }
          : prev
      );
      showToast({ message: 'Lineup title regenerated' });
      if (lineupHtml) {
        await handleLoadLineupHtml();
      }
    } finally {
      setRegeneratingLineupTitle(false);
    }
  }, [brand, year, lineupSummary, scopeStoreKey, showToast, lineupHtml, handleLoadLineupHtml]);

  const handleLineupRegenerateDescription = React.useCallback(async () => {
    if (!brand || year === '' || !lineupSummary) return;
    setRegeneratingLineupDescription(true);
    try {
      const r = await regenerateLineupSeoDescription(brand, year as number, scopeStoreKey);
      if (!r.success || !r.data) {
        showToast({ message: r.errors?.[0]?.message ?? 'Failed', tone: 'error' });
        return;
      }
      setLineupSummary((prev) =>
        prev
          ? {
              ...prev,
              title: r.data?.title ?? prev.title,
              description: r.data?.description ?? prev.description,
            }
          : prev
      );
      showToast({ message: 'Lineup description regenerated' });
      if (lineupHtml) {
        await handleLoadLineupHtml();
      }
    } finally {
      setRegeneratingLineupDescription(false);
    }
  }, [brand, year, lineupSummary, scopeStoreKey, showToast, lineupHtml, handleLoadLineupHtml]);

  const filteredModels = modelSearch.trim()
    ? models.filter(
        (m) =>
          m.displayName.toLowerCase().includes(modelSearch.toLowerCase()) ||
          m.slug.toLowerCase().includes(modelSearch.toLowerCase())
      )
    : models;
  const displayedModelSlugs = React.useMemo(
    () => filteredModels.map((m) => m.slug),
    [filteredModels],
  );

  const handleToggleModelSelection = React.useCallback(
    (slug: string, index: number, shiftKey: boolean) => {
      setSelectedSlugs((prev) => {
        const result = applyCheckboxSelection({
          selectedIds: prev,
          displayedRowIds: displayedModelSlugs,
          clickedId: slug,
          clickedIndex: index,
          lastSelectedIndex: lastSelectedModelIndex,
          shiftKey,
        });
        setLastSelectedModelIndex(result.nextLastSelectedIndex);
        return result.nextSelectedIds;
      });
    },
    [displayedModelSlugs, lastSelectedModelIndex],
  );

  const handleGenerate = async () => {
    if (!brand || year === '') {
      showToast({ message: 'Select brand and year', tone: 'error' });
      return;
    }
    if (showStore && !storeKey) {
      showToast({ message: 'Select a store for this brand', tone: 'error' });
      return;
    }
    if (selectedSlugs.size === 0) {
      showToast({ message: 'Select at least one model to generate', tone: 'error' });
      return;
    }
    setGenerating(true);
    setGenerateStartedAt(Date.now());
    setGenerateNowTick(Date.now());
    const slugsToUse = Array.from(selectedSlugs);
    const total = slugsToUse.length;
    const modelNames = slugsToUse.map(
      (s) => models.find((m) => m.slug === s)?.displayName ?? s
    );
    const modelsLabel =
      modelNames.slice(0, 3).join(', ') + (modelNames.length > 3 ? ` +${modelNames.length - 3} more` : '');

    let processed = 0;
    let writtenTotal = 0;
    let failedBatches = 0;
    const failures: string[] = [];
    setGenerateProgress(`Generating selected... 0/${total}`);

    try {
      for (let i = 0; i < slugsToUse.length; i += MODEL_PAGE_GENERATE_CHUNK_SIZE) {
        const chunk = slugsToUse.slice(i, i + MODEL_PAGE_GENERATE_CHUNK_SIZE);
        setGenerateProgress(`Generating selected... ${processed}/${total}`);
        const res = await fetch('/api/model-pages/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...demoLlmRequestHeaders() },
          body: JSON.stringify({
            brand,
            year,
            storeKey: scopeStoreKey,
            modelSlugs: chunk,
            maxPerRun: MODEL_PAGE_GENERATE_CHUNK_SIZE,
          }),
        });
        const data = await res.json().catch(() => null);
        processed += chunk.length;
        if (!res.ok) {
          failedBatches++;
          failures.push(
            data?.error ?? `Batch ${Math.floor(i / MODEL_PAGE_GENERATE_CHUNK_SIZE) + 1} failed`
          );
          continue;
        }
        writtenTotal += Number.isFinite(data?.written) ? data.written : 0;
      }

      setGenerateProgress(null);
      const summary =
        failedBatches > 0
          ? `Generated ${writtenTotal}/${total} page${total === 1 ? '' : 's'}. ${failedBatches} batch(es) failed.`
          : `Generated ${writtenTotal}/${total} page${total === 1 ? '' : 's'}.`;
      showToast({
        message:
          failedBatches > 0 && failures[0] ? `${summary} First failure: ${failures[0]}` : summary,
        tone: failedBatches > 0 ? 'error' : 'success',
      });
      pushRunHistory({
        brand,
        year: year as number,
        storeKey: scopeStoreKey,
        actionLabel: 'Generate all selected',
        modelsLabel,
        status: failedBatches > 0 ? (writtenTotal > 0 ? 'warning' : 'failed') : 'success',
        summary:
          failedBatches > 0 && failures[0] ? `${summary} First failure: ${failures[0]}` : summary,
      });
      try {
        await loadResults();
      } catch (refreshErr) {
        const refreshMsg =
          refreshErr instanceof Error ? refreshErr.message : String(refreshErr);
        console.error('loadResults after generate:', refreshErr);
        showToast({
          message: `${summary} Generated successfully, but list refresh failed: ${refreshMsg}.`,
          tone: 'warning',
        });
      }
    } catch (e) {
      const message = (e as Error).message;
      showToast({ message, tone: 'error' });
      setGenerateProgress(null);
      pushRunHistory({
        brand,
        year: year as number,
        storeKey: scopeStoreKey,
        actionLabel: 'Generate all selected',
        modelsLabel,
        status: 'failed',
        summary: message,
      });
    } finally {
      setGenerating(false);
      setGenerateStartedAt(null);
    }
  };

  const handleGenerateAllPages = async () => {
    if (!brand || year === '') {
      showToast({ message: 'Select brand and year', tone: 'error' });
      return;
    }
    if (showStore && !storeKey) {
      showToast({ message: 'Select a store for this brand', tone: 'error' });
      return;
    }
    if (models.length === 0) {
      showToast({ message: 'No models available for this scope', tone: 'error' });
      return;
    }
    if (slugsGenerateExceptSelected.length === 0) {
      showToast({
        message:
          'Every model is selected — nothing left to generate. Deselect the models you want to skip.',
        tone: 'error',
      });
      return;
    }
    setGenerating(true);
    setGenerateStartedAt(Date.now());
    setGenerateNowTick(Date.now());
    let processed = 0;
    let writtenTotal = 0;
    let failedBatches = 0;
    const failures: string[] = [];
    const targetSlugs = slugsGenerateExceptSelected;
    setGenerateProgress(`Generating (except selected)... 0/${targetSlugs.length}`);

    try {
      for (let i = 0; i < targetSlugs.length; i += MODEL_PAGE_GENERATE_CHUNK_SIZE) {
        const chunk = targetSlugs.slice(i, i + MODEL_PAGE_GENERATE_CHUNK_SIZE);
        setGenerateProgress(`Generating (except selected)... ${processed}/${targetSlugs.length}`);
        const res = await fetch('/api/model-pages/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...demoLlmRequestHeaders() },
          body: JSON.stringify({
            brand,
            year,
            storeKey: scopeStoreKey,
            modelSlugs: chunk,
            maxPerRun: MODEL_PAGE_GENERATE_CHUNK_SIZE,
          }),
        });
        const data = await res.json().catch(() => null);
        processed += chunk.length;
        if (!res.ok) {
          failedBatches++;
          failures.push(
            data?.error ?? `Batch ${Math.floor(i / MODEL_PAGE_GENERATE_CHUNK_SIZE) + 1} failed`
          );
          continue;
        }
        writtenTotal += Number.isFinite(data?.written) ? data.written : 0;
      }

      setGenerateProgress(null);
      const summary =
        failedBatches > 0
          ? `Generated ${writtenTotal}/${targetSlugs.length} pages. ${failedBatches} batch(es) failed.`
          : `Generated ${writtenTotal}/${targetSlugs.length} pages.`;
      showToast({
        message:
          failedBatches > 0 && failures[0]
            ? `${summary} First failure: ${failures[0]}`
            : summary,
        tone: failedBatches > 0 ? 'error' : 'success',
      });
        pushRunHistory({
          brand,
          year: year as number,
          storeKey: scopeStoreKey,
          actionLabel: 'Generate all except',
          modelsLabel: `${targetSlugs.length} models`,
        status: failedBatches > 0 ? (writtenTotal > 0 ? 'warning' : 'failed') : 'success',
        summary:
          failedBatches > 0 && failures[0]
            ? `${summary} First failure: ${failures[0]}`
            : summary,
      });
      await loadResults();
    } catch (e) {
      const message = (e as Error).message;
      showToast({ message, tone: 'error' });
      pushRunHistory({
        brand,
        year: year as number,
        storeKey: scopeStoreKey,
        actionLabel: 'Generate all except',
        modelsLabel: `${slugsGenerateExceptSelected.length} models`,
        status: 'failed',
        summary: message,
      });
    } finally {
      setGenerating(false);
      setGenerateStartedAt(null);
      setGenerateProgress(null);
    }
  };

  const handleDiscard = async (slug: string, model: string) => {
    if (!confirm('Discard this page? It will be removed from the pages directory.')) return;
    const r = await discardPage(brand, year as number, scopeStoreKey, slug);
    if (r.success) {
      showToast({ message: 'Page discarded' });
      pushRunHistory({
        brand,
        year: year as number,
        storeKey: scopeStoreKey,
        actionLabel: 'Discard',
        modelsLabel: model,
        status: 'success',
        summary: 'Removed page JSON and regenerated list.',
      });
      setViewSlug(null);
      loadResults();
    } else {
      showToast({ message: r.errors?.[0]?.message ?? 'Failed', tone: 'error' });
      pushRunHistory({
        brand,
        year: year as number,
        storeKey: scopeStoreKey,
        actionLabel: 'Discard',
        modelsLabel: model,
        status: 'failed',
        summary: r.errors?.[0]?.message ?? 'Failed',
      });
    }
  };

  const syncModelListPanelHeight = React.useCallback(() => {
    const el = scopeStackRef.current;
    if (!el) return;
    setModelListPanelHeight(Math.max(el.offsetHeight, MIN_MODEL_LIST_HEIGHT_PX));
  }, []);

  React.useLayoutEffect(() => {
    syncModelListPanelHeight();
  }, [syncModelListPanelHeight, brand, year, storeKey, showStore, modelSearch, models.length]);

  React.useLayoutEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onMq = () => setIsLgViewport(mq.matches);
    onMq();
    mq.addEventListener('change', onMq);
    return () => mq.removeEventListener('change', onMq);
  }, []);

  React.useEffect(() => {
    const el = scopeStackRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => syncModelListPanelHeight());
    ro.observe(el);
    return () => ro.disconnect();
  }, [syncModelListPanelHeight]);

  const handlePeekQueries = async (slug: string) => {
    if (!brand || year === '') return;
    setPeekSlug(slug);
    const r = await getSearchQueriesText(brand, year as number, slug);
    setPeekText(r.success && r.data != null ? r.data : '(no search-queries file)');
  };

  const handleRefreshQueries = async (row: ModelPagesListRow) => {
    if (!brand || year === '') return;
    setRefreshingSlug(row.slug);
    try {
      const r = await refreshSearchQueries(brand, year as number, scopeStoreKey, row.slug);
      if (r.success && r.data) {
        let msg = 'Search queries refreshed.';
        if (r.data.lineCountDelta != null) {
          msg += ` Lines: ${r.data.previousLineCount ?? '?'} → ${r.data.lineCount}.`;
        }
        if (r.data.firstLineChanged === true) msg += ' First line changed.';
        showToast({ message: msg });
        pushRunHistory({
          brand,
          year: year as number,
          storeKey: scopeStoreKey,
          actionLabel: 'Refresh queries',
          modelsLabel: row.model,
          status: 'success',
          summary: msg,
        });
        await loadResults();
      } else {
        const msg = r.errors?.[0]?.message ?? 'Refresh failed';
        showToast({ message: msg, tone: 'error' });
        pushRunHistory({
          brand,
          year: year as number,
          storeKey: scopeStoreKey,
          actionLabel: 'Refresh queries',
          modelsLabel: row.model,
          status: 'failed',
          summary: msg,
        });
      }
    } finally {
      setRefreshingSlug(null);
    }
  };

  const handleRefreshAllQueries = async () => {
    if (!brand || year === '') return;
    if (showStore && !storeKey) return;
    if (
      !confirm(
        `Refresh search queries for all models in ${brand.toUpperCase()} ${year}? This will run ${models.length} AI calls.`
      )
    ) {
      return;
    }
    setRefreshingAllQueries(true);
    try {
      const r = await refreshAllSearchQueries(brand, year as number, scopeStoreKey);
      if (r.success && r.data) {
        const { total, updated, failed, failures } = r.data;
        const firstFailure = failures[0];
        let msg = `Refreshed search queries for ${updated}/${total} model${total === 1 ? '' : 's'}.`;
        if (failed > 0) {
          msg += ` ${failed} failed.`;
          if (firstFailure) {
            msg += ` First failure: ${firstFailure.slug} - ${firstFailure.message}`;
          }
        }
        showToast({ message: msg, tone: failed > 0 ? 'error' : 'success' });
        pushRunHistory({
          brand,
          year: year as number,
          storeKey: scopeStoreKey,
          actionLabel: 'Refresh all queries',
          modelsLabel: `${total} models`,
          status: failed > 0 ? (updated > 0 ? 'warning' : 'failed') : 'success',
          summary: msg,
        });
        await loadResults();
      } else {
        const msg = r.errors?.[0]?.message ?? 'Refresh all queries failed';
        showToast({ message: msg, tone: 'error' });
        pushRunHistory({
          brand,
          year: year as number,
          storeKey: scopeStoreKey,
          actionLabel: 'Refresh all queries',
          modelsLabel: 'Scope',
          status: 'failed',
          summary: msg,
        });
      }
    } finally {
      setRefreshingAllQueries(false);
    }
  };

  const handleRowRegenFaqs = async (slug: string, model: string) => {
    if (!brand || year === '') return;
    const r = await regenerateFaqs(brand, year as number, scopeStoreKey, slug);
    if (r.success) {
      showToast({ message: 'FAQs regenerated' });
      pushRunHistory({
        brand,
        year: year as number,
        storeKey: scopeStoreKey,
        actionLabel: 'Regenerate FAQs',
        modelsLabel: model,
        status: 'success',
        summary: 'Updated FAQs and refreshed page JSON.',
      });
      bumpPreviewHtml();
    } else showToast({ message: r.errors?.[0]?.message ?? 'Failed', tone: 'error' });
    if (!r.success) {
      pushRunHistory({
        brand,
        year: year as number,
        storeKey: scopeStoreKey,
        actionLabel: 'Regenerate FAQs',
        modelsLabel: model,
        status: 'failed',
        summary: r.errors?.[0]?.message ?? 'Failed',
      });
    }
    loadResults();
  };

  const handleRowWhy = async (slug: string, model: string) => {
    if (!brand || year === '') return;
    const r = await regenerateWhyBullets(brand, year as number, scopeStoreKey, slug);
    if (r.success) {
      showToast({ message: 'Why bullets regenerated' });
      pushRunHistory({
        brand,
        year: year as number,
        storeKey: scopeStoreKey,
        actionLabel: 'Regenerate Why',
        modelsLabel: model,
        status: 'success',
        summary: 'Updated whyBullets and refreshed page JSON.',
      });
      bumpPreviewHtml();
    } else {
      const msg = r.errors?.[0]?.message ?? 'Failed';
      showToast({ message: msg, tone: 'error' });
      pushRunHistory({
        brand,
        year: year as number,
        storeKey: scopeStoreKey,
        actionLabel: 'Regenerate Why',
        modelsLabel: model,
        status: 'failed',
        summary: msg,
      });
    }
    loadResults();
  };

  const handleRowLocal = async (slug: string, model: string) => {
    if (!brand || year === '') return;
    const r = await regenerateLocalSections(brand, year as number, scopeStoreKey, slug);
    if (r.success) {
      showToast({ message: 'Local sections regenerated' });
      pushRunHistory({
        brand,
        year: year as number,
        storeKey: scopeStoreKey,
        actionLabel: 'Regenerate Local',
        modelsLabel: model,
        status: 'success',
        summary: 'Updated local sections (and internal links).',
      });
      bumpPreviewHtml();
    } else {
      const msg = r.errors?.[0]?.message ?? 'Failed';
      showToast({ message: msg, tone: 'error' });
      pushRunHistory({
        brand,
        year: year as number,
        storeKey: scopeStoreKey,
        actionLabel: 'Regenerate Local',
        modelsLabel: model,
        status: 'failed',
        summary: msg,
      });
    }
    loadResults();
  };

  const handleRowRefreshLinks = async (slug: string, model: string) => {
    if (!brand || year === '') return;
    const r = await injectPageInternalLinks(brand, year as number, scopeStoreKey, slug);
    if (r.success) {
      showToast({ message: 'Links refreshed' });
      pushRunHistory({
        brand,
        year: year as number,
        storeKey: scopeStoreKey,
        actionLabel: 'Refresh links',
        modelsLabel: model,
        status: 'success',
        summary: 'Injected internal links and refreshed page JSON.',
      });
      bumpPreviewHtml();
    } else {
      const msg = r.errors?.[0]?.message ?? 'Failed';
      showToast({ message: msg, tone: 'error' });
      pushRunHistory({
        brand,
        year: year as number,
        storeKey: scopeStoreKey,
        actionLabel: 'Refresh links',
        modelsLabel: model,
        status: 'failed',
        summary: msg,
      });
    }
    loadResults();
  };

  const setSeoRegenerating = React.useCallback((key: string, value: boolean) => {
    setRegeneratingSeoKeys((prev) => {
      const next = new Set(prev);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const markSeoUpdated = React.useCallback((key: string) => {
    setSeoUpdatedKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    window.setTimeout(() => {
      setSeoUpdatedKeys((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, 1800);
  }, []);

  const handleRowRegenerateSeoTitle = async (row: ModelPagesListRow) => {
    if (!brand || year === '' || row.missingPage) return;
    const key = `title:${row.slug}`;
    setSeoRegenerating(key, true);
    try {
      const r = await regenerateSeoTitle(brand, year as number, scopeStoreKey, row.slug);
      if (!r.success || !r.data) {
        const msg = r.errors?.[0]?.message ?? 'Failed';
        showToast({ message: msg, tone: 'error' });
        pushRunHistory({
          brand,
          year: year as number,
          storeKey: scopeStoreKey,
          actionLabel: 'Regenerate title',
          modelsLabel: row.model,
          status: 'failed',
          summary: msg,
        });
        return;
      }
      const nowIso = new Date().toISOString();
      setResults((prev) =>
        prev.map((item) =>
          item.slug === row.slug
            ? {
                ...item,
                title: r.data?.title ?? item.title,
                description: r.data?.description ?? item.description,
                pageUpdatedAt: nowIso,
              }
            : item
        )
      );
      showToast({ message: 'Title regenerated' });
      markSeoUpdated(key);
      pushRunHistory({
        brand,
        year: year as number,
        storeKey: scopeStoreKey,
        actionLabel: 'Regenerate title',
        modelsLabel: row.model,
        status: 'success',
        summary: 'Updated SEO title.',
      });
      bumpPreviewHtml();
    } finally {
      setSeoRegenerating(key, false);
    }
  };

  const handleRowRegenerateSeoDescription = async (row: ModelPagesListRow) => {
    if (!brand || year === '' || row.missingPage) return;
    const key = `description:${row.slug}`;
    setSeoRegenerating(key, true);
    try {
      const r = await regenerateSeoDescription(brand, year as number, scopeStoreKey, row.slug);
      if (!r.success || !r.data) {
        const msg = r.errors?.[0]?.message ?? 'Failed';
        showToast({ message: msg, tone: 'error' });
        pushRunHistory({
          brand,
          year: year as number,
          storeKey: scopeStoreKey,
          actionLabel: 'Regenerate description',
          modelsLabel: row.model,
          status: 'failed',
          summary: msg,
        });
        return;
      }
      const nowIso = new Date().toISOString();
      setResults((prev) =>
        prev.map((item) =>
          item.slug === row.slug
            ? {
                ...item,
                title: r.data?.title ?? item.title,
                description: r.data?.description ?? item.description,
                pageUpdatedAt: nowIso,
              }
            : item
        )
      );
      showToast({ message: 'Description regenerated' });
      markSeoUpdated(key);
      pushRunHistory({
        brand,
        year: year as number,
        storeKey: scopeStoreKey,
        actionLabel: 'Regenerate description',
        modelsLabel: row.model,
        status: 'success',
        summary: 'Updated SEO description.',
      });
      bumpPreviewHtml();
    } finally {
      setSeoRegenerating(key, false);
    }
  };

  const handleRowFullGenerate = async (slug: string, model: string) => {
    if (!brand || year === '' || showStore && !storeKey) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/model-pages/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...demoLlmRequestHeaders() },
        body: JSON.stringify({
          brand,
          year,
          storeKey: scopeStoreKey,
          modelSlugs: [slug],
          maxPerRun: 1,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = data?.error ?? 'Generation failed';
        const valWarn = Array.isArray(data?.validationWarnings) ? data.validationWarnings : [];
        showToast({ message: msg, tone: 'error' });
        pushRunHistory({
          brand,
          year: year as number,
          storeKey: scopeStoreKey,
          actionLabel: 'Full generate',
          modelsLabel: model,
          status: 'failed',
          summary: msg,
          validationWarnings: valWarn.length > 0 ? valWarn : undefined,
        });
        return;
      }
      showToast({ message: 'Page regenerated' });
      pushRunHistory({
        brand,
        year: year as number,
        storeKey: scopeStoreKey,
        actionLabel: 'Full generate',
        modelsLabel: model,
        status: 'success',
        summary: 'Regenerated full page (content, FAQs, and internal links).',
      });
      bumpPreviewHtml();
      await loadResults();
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadJson = async (slug: string) => {
    const r = await getPageContent(brand, year as number, scopeStoreKey, slug);
    if (!r.success || !r.data) {
      showToast({ message: 'No JSON to download', tone: 'error' });
      return;
    }
    const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${slug}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleCopyCanonical = async (row: ModelPagesListRow) => {
    const r = await getPageContent(brand, year as number, scopeStoreKey, row.slug);
    const url =
      r.success && r.data?.canonicalUrl
        ? r.data.canonicalUrl
        : r.success && r.data?.pagePath
          ? r.data.pagePath
          : row.url;
    if (!url) {
      showToast({ message: 'No URL on page', tone: 'error' });
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast({ message: 'Copied URL' });
    } catch {
      showToast({ message: 'Copy failed', tone: 'error' });
    }
  };

  const handleCopyText = React.useCallback(
    async (value: string, label: string) => {
      const text = String(value ?? '').trim();
      if (!text) {
        showToast({ message: `No ${label} to copy`, tone: 'error' });
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        showToast({ message: `Copied ${label}` });
      } catch {
        showToast({ message: 'Copy failed', tone: 'error' });
      }
    },
    [showToast]
  );

  return (
    <>
      <section className="min-h-[130px] rounded-md border border-neutral-200 bg-surface-amber px-3 py-3 dark:border-neutral-700 dark:bg-surface-amber-dark sm:px-4">
        {showStore && !storeKey && brand && year !== '' ? (
          <p className="mb-2 text-xs font-medium text-amber-800 dark:text-amber-200">
            Select a store to load pages, results, and generation paths for this brand.
          </p>
        ) : null}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
          <div
            ref={scopeStackRef}
            className="flex w-full shrink-0 flex-col gap-3 lg:w-[14rem]"
          >
            <div className="min-w-0 w-full">
              <label htmlFor="scope-brand" className="sr-only">
                Brand
              </label>
              <div className="relative w-full">
                {!brand && (
                  <span
                    className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-sm leading-none text-red-600 dark:text-red-400"
                    aria-hidden
                  >
                    *
                  </span>
                )}
                <Select
                  id="scope-brand"
                  value={brand}
                  onChange={(e) => {
                    setBrand(e.target.value);
                    setYear('');
                    setStoreKey('');
                  }}
                  disabled={!meta?.brands?.length}
                  aria-required="true"
                  className={!brand ? 'w-full min-w-0 pl-7' : 'w-full min-w-0'}
                >
                  <option value="">Select brand</option>
                  {meta?.brands?.map((b) => {
                    const label = formatOemBrandLabel(b);
                    return (
                      <option key={b} value={b}>
                        {label}
                      </option>
                    );
                  })}
                </Select>
              </div>
            </div>
            <div className="min-w-0 w-full">
              <label htmlFor="scope-year" className="sr-only">
                Year
              </label>
              <div className="relative w-full">
                {years.length > 0 && year === '' && (
                  <span
                    className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-sm leading-none text-red-600 dark:text-red-400"
                    aria-hidden
                  >
                    *
                  </span>
                )}
                <Select
                  id="scope-year"
                  value={year === '' ? '' : String(year)}
                  onChange={(e) => setYear(e.target.value ? parseInt(e.target.value, 10) : '')}
                  disabled={!years.length}
                  aria-required="true"
                  className={
                    years.length > 0 && year === ''
                      ? 'w-full min-w-0 pl-7'
                      : 'w-full min-w-0'
                  }
                >
                  <option value="">Select year</option>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            {showStore && (
              <div className="min-w-0 w-full">
                <label htmlFor="scope-store" className="sr-only">
                  Store
                </label>
                <Select
                  id="scope-store"
                  value={storeKey}
                  onChange={(e) => setStoreKey(e.target.value)}
                  className="w-full min-w-0"
                >
                  <option value="">Select store</option>
                  {stores.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="min-w-0 w-full">
              <label htmlFor="scope-models-filter" className="sr-only">
                Filter models
              </label>
              <Input
                id="scope-models-filter"
                placeholder="Search models…"
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                disabled={!brand || year === ''}
                className="w-full min-w-0"
              />
            </div>
            <Button
              className="w-full !h-auto py-2 text-sm leading-normal"
              onClick={handleGenerate}
              disabled={
                generating ||
                !brand ||
                year === '' ||
                selectedSlugs.size === 0 ||
                (showStore && !storeKey)
              }
            >
              {generating ? (
                'Generating...'
              ) : (
                <>
                  Generate all <em>selected</em>
                </>
              )}
            </Button>
            <Button
              className="w-full !h-auto py-2 text-sm leading-normal"
              variant="secondary"
              onClick={() => setShowGenerateAllConfirm(true)}
              disabled={
                generating ||
                !brand ||
                year === '' ||
                (showStore && !storeKey) ||
                slugsGenerateExceptSelected.length === 0
              }
            >
              {generating ? (
                'Generating...'
              ) : (
                <>
                  Generate all <em>except</em>
                </>
              )}
            </Button>
          </div>
          <div
            className="flex min-h-[7rem] min-w-0 flex-1 flex-col overflow-hidden rounded border border-neutral-200 bg-white dark:border-neutral-600 dark:bg-neutral-800 max-h-[min(50vh,18rem)] lg:max-h-none"
            style={isLgViewport ? { height: modelListPanelHeight } : undefined}
          >
            <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 px-2 py-1.5 dark:border-neutral-600">
              <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-800 dark:text-neutral-100">
                Models
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {loadingModels && <p className="text-xs text-neutral-500">Loading…</p>}
              {!loadingModels && selectedSlugs.size > 0 && (
                <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                  <span className="shrink-0">Selected {selectedSlugs.size}</span>
                  <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    className="h-6 px-1 text-[11px]"
                    onClick={() => {
                      setSelectedSlugs(new Set());
                      setLastSelectedModelIndex(null);
                    }}
                    disabled={selectedSlugs.size === 0}
                  >
                    Clear
                  </Button>
                  <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    className="h-6 px-1 text-[11px]"
                    onClick={() => {
                      const missing = results.filter((x) => x.missingPage).map((x) => x.slug);
                      setSelectedSlugs(new Set(missing));
                      setLastSelectedModelIndex(null);
                    }}
                    disabled={!results.some((x) => x.missingPage)}
                  >
                    Select missing
                  </Button>
                  <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    className="h-6 px-1 text-[11px]"
                    onClick={() => {
                      setSelectedSlugs(new Set(filteredModels.map((m) => m.slug)));
                      setLastSelectedModelIndex(null);
                    }}
                    disabled={filteredModels.length === 0}
                  >
                    Select all
                  </Button>
                </div>
              )}
              {!loadingModels && (
                <ul className="grid gap-x-3 gap-y-1 text-xs [grid-template-columns:repeat(auto-fill,minmax(9rem,1fr))]">
                  {filteredModels.map((m, index) => {
                    const isSelected = selectedSlugs.has(m.slug);
                    return (
                      <li key={m.slug}>
                        <label className="flex cursor-pointer items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              const native = e.nativeEvent;
                              const shiftKey =
                                typeof native === 'object' &&
                                native != null &&
                                'shiftKey' in native
                                  ? Boolean((native as MouseEvent).shiftKey)
                                  : false;
                              handleToggleModelSelection(m.slug, index, shiftKey);
                            }}
                            className="rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
                          />
                          {m.displayName}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-1 border-t border-neutral-200/80 pt-3 dark:border-neutral-600/80">
          {generateProgress && (
            <span className="text-xs text-neutral-500">
              {generateProgress}
              {generateStartedAt != null
                ? ` Elapsed: ${formatElapsed(generateNowTick - generateStartedAt)}`
                : ''}
            </span>
          )}
          {!generateProgress && runHistory.length === 0 && (
            <span className="text-xs text-neutral-500">No recent generation runs.</span>
          )}
          {!generateProgress && runHistory.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Last 3 runs
              </span>
              {runHistory.map((r) => {
                const tone =
                  r.status === 'success'
                    ? 'text-emerald-600'
                    : r.status === 'failed'
                      ? 'text-red-600'
                      : 'text-amber-600';

                const summary =
                  r.summary.length > 120 ? r.summary.slice(0, 120) + '...' : r.summary;

                const v0 = r.validationWarnings?.[0];
                const vMoreFiles =
                  r.validationWarnings && r.validationWarnings.length > 1
                    ? ` (+${r.validationWarnings.length - 1} more file(s))`
                    : '';
                const vMsg = v0?.messages?.[0] ?? '';
                const vLine =
                  v0 && vMsg
                    ? `Validation: ${v0.slug}.json - ${
                        vMsg.length > 90 ? vMsg.slice(0, 90) + '...' : vMsg
                      }${vMoreFiles}`
                    : null;

                return (
                  <div key={r.id} className="rounded border border-neutral-200/80 p-2 dark:border-neutral-700/80">
                    <div className={`text-xs font-medium ${tone}`}>
                      {r.actionLabel}: {r.brand.toUpperCase()} {r.year} - {r.modelsLabel}
                    </div>
                    <div className="mt-1 text-[11px] text-neutral-600 dark:text-neutral-300">
                      {summary}
                    </div>
                    {vLine && (
                      <div className="mt-1 text-[11px] text-neutral-600 dark:text-neutral-300">
                        {vLine}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-2 dark:border-neutral-700">
          <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Results
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="tertiary"
              size="sm"
              onClick={expandAllResultRows}
              disabled={results.length === 0 || collapsedResultSlugs.size === 0}
            >
              Expand all rows
            </Button>
            <Button
              variant="tertiary"
              size="sm"
              onClick={collapseAllResultRows}
              disabled={results.length === 0 || collapsedResultSlugs.size === results.length}
            >
              Collapse all rows
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleRefreshAllQueries()}
              disabled={refreshingAllQueries || !brand || year === '' || (showStore && !storeKey)}
            >
              {refreshingAllQueries ? 'Refreshing Search Queries...' : 'Refresh Search Queries'}
            </Button>
          </div>
        </div>
        {loadingResults ? (
          <p className="mt-4 text-sm text-neutral-500">Loading…</p>
        ) : showStore && !storeKey ? (
          <p className="mt-4 text-sm text-neutral-500">Select a store to load results.</p>
        ) : results.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-500">
            {brand && year !== '' ? 'No catalog rows for this scope.' : 'Select brand and year to see results.'}
          </p>
        ) : (
          <Table className="mt-4">
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Page updated</TableHead>
                <TableHead>Queries</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((row) => {
                const isOpen = viewSlug === row.slug;
                const isResultCollapsed = collapsedResultSlugs.has(row.slug);
                const isRegeneratingTitle = regeneratingSeoKeys.has(`title:${row.slug}`);
                const isRegeneratingDescription = regeneratingSeoKeys.has(`description:${row.slug}`);
                const isTitleUpdated = seoUpdatedKeys.has(`title:${row.slug}`);
                const isDescriptionUpdated = seoUpdatedKeys.has(`description:${row.slug}`);

                if (isResultCollapsed) {
                  return (
                    <TableRow key={row.slug}>
                      <TableCell className="align-middle whitespace-normal break-words">
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded border border-neutral-200 bg-white text-xs text-neutral-600 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                            title="Expand row"
                            aria-expanded={false}
                            aria-label={`Expand details for ${row.model}`}
                            onClick={() => toggleResultRowCollapsed(row.slug)}
                          >
                             ▶
                          </button>
                          <span className="min-w-0 text-sm">{row.model}</span>
                        </div>
                      </TableCell>
                      <TableCell
                        colSpan={6}
                        className="align-middle text-xs text-neutral-600 dark:text-neutral-300"
                      >
                        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                          <span className="font-mono text-[11px] text-neutral-800 dark:text-neutral-200">
                            {row.slug}
                          </span>
                          <span className="text-neutral-400 dark:text-neutral-500" aria-hidden>
                            ·
                          </span>
                          <span className="whitespace-nowrap">
                            Page {formatShortDate(row.pageUpdatedAt)}
                          </span>
                          <span className="text-neutral-400 dark:text-neutral-500" aria-hidden>
                            ·
                          </span>
                          <span className="whitespace-nowrap">
                            Queries {formatShortDate(row.searchQueriesGatheredAt)}
                          </span>
                          {row.missingPage ? (
                            <>
                              <span className="text-neutral-400 dark:text-neutral-500" aria-hidden>
                                ·
                              </span>
                              <span className="font-medium text-amber-700 dark:text-amber-300">
                                Missing page
                              </span>
                            </>
                          ) : null}
                        </div>
                        <div
                          className="mt-1 truncate font-mono text-[11px] text-neutral-500 dark:text-neutral-400"
                          title={row.url || undefined}
                        >
                          {row.url || '—'}
                        </div>
                      </TableCell>
                      <TableCell className="align-middle">
                        <div className="flex max-w-[12rem] flex-wrap gap-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => toggleResultRowCollapsed(row.slug)}
                          >
                            Expand
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setCollapsedResultSlugs((prev) => {
                                const next = new Set(prev);
                                next.delete(row.slug);
                                return next;
                              });
                              setEditSlug(null);
                              setViewSlug(row.slug);
                            }}
                            disabled={row.missingPage}
                          >
                            View
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setCollapsedResultSlugs((prev) => {
                                const next = new Set(prev);
                                next.delete(row.slug);
                                return next;
                              });
                              setEditSlug(row.slug);
                            }}
                            disabled={row.missingPage}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void handlePeekQueries(row.slug)}
                          >
                            Queries
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                }

                return (
                  <React.Fragment key={row.slug}>
                    <TableRow>
                      <TableCell className="align-top whitespace-normal break-words">
                        <div className="flex items-start gap-2">
                          <button
                            type="button"
                            className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded border border-neutral-200 bg-white text-xs text-neutral-600 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
                            title="Collapse row"
                            aria-expanded
                            aria-label={`Collapse details for ${row.model}`}
                            onClick={() => toggleResultRowCollapsed(row.slug)}
                          >
                            ▼
                          </button>
                          <span className="min-w-0">{row.model}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs align-top whitespace-normal break-all">
                        {row.slug}
                      </TableCell>
                      <TableCell className="text-xs align-top whitespace-nowrap">
                        {formatShortDate(row.pageUpdatedAt)}
                      </TableCell>
                      <TableCell className="text-xs align-top whitespace-nowrap">
                        {formatShortDate(row.searchQueriesGatheredAt)}
                      </TableCell>
                      <TableCell className="font-mono text-xs align-top whitespace-normal break-all max-w-[10rem]">
                        <button
                          type="button"
                          className="w-full cursor-copy text-left font-inherit text-inherit"
                          title="Click to copy URL"
                          onClick={() => void handleCopyText(row.url, 'URL')}
                        >
                          {row.url}
                        </button>
                      </TableCell>
                      <TableCell className="font-mono text-xs align-top whitespace-normal break-words max-w-[8rem]">
                        <button
                          type="button"
                          className="w-full cursor-copy text-left font-inherit text-inherit"
                          title="Click to copy title"
                          onClick={() => void handleCopyText(row.title, 'title')}
                        >
                          <div>{row.title}</div>
                        </button>
                        <div className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400">
                          {row.title.length}/{SEO_TITLE_MAX}
                        </div>
                        {isTitleUpdated ? (
                          <div className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                            Updated
                          </div>
                        ) : null}
                        <button
                          type="button"
                          className="mt-1 text-left text-[10px] text-neutral-500 underline decoration-neutral-400/70 underline-offset-2 transition-colors hover:text-neutral-700 dark:text-neutral-400 dark:decoration-neutral-500/70 dark:hover:text-neutral-200 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
                          disabled={row.missingPage || isRegeneratingTitle}
                          onClick={() => void handleRowRegenerateSeoTitle(row)}
                        >
                          {isRegeneratingTitle ? 'Regenerating…' : 'Regenerate'}
                        </button>
                      </TableCell>
                      <TableCell className="font-mono text-xs align-top whitespace-normal break-words max-w-[12rem]">
                        <button
                          type="button"
                          className="w-full cursor-copy text-left font-inherit text-inherit"
                          title="Click to copy description"
                          onClick={() => void handleCopyText(row.description, 'description')}
                        >
                          <div>{row.description}</div>
                        </button>
                        <div className="mt-1 text-[10px] text-neutral-500 dark:text-neutral-400">
                          {row.description.length}/{SEO_DESCRIPTION_MAX}
                        </div>
                        {isDescriptionUpdated ? (
                          <div className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                            Updated
                          </div>
                        ) : null}
                        <button
                          type="button"
                          className="mt-1 text-left text-[10px] text-neutral-500 underline decoration-neutral-400/70 underline-offset-2 transition-colors hover:text-neutral-700 dark:text-neutral-400 dark:decoration-neutral-500/70 dark:hover:text-neutral-200 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
                          disabled={row.missingPage || isRegeneratingDescription}
                          onClick={() => void handleRowRegenerateSeoDescription(row)}
                        >
                          {isRegeneratingDescription ? 'Regenerating…' : 'Regenerate'}
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="flex max-w-[15rem] flex-col gap-2">
                          <div className="border-b border-neutral-200 pb-2 dark:border-neutral-700">
                            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                              View
                            </p>
                            <div className="flex flex-wrap items-center gap-1">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  setEditSlug(null);
                                  setViewSlug((current) =>
                                    current === row.slug ? null : row.slug
                                  );
                                }}
                                disabled={row.missingPage}
                              >
                                View
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  setEditSlug(row.slug);
                                }}
                                disabled={row.missingPage}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => void handlePeekQueries(row.slug)}
                              >
                                Queries
                              </Button>
                              <button
                                type="button"
                                disabled={refreshingSlug === row.slug}
                                onClick={() => void handleRefreshQueries(row)}
                                className="text-left text-[11px] text-accent-600 underline decoration-accent-600/40 underline-offset-2 hover:text-accent-700 hover:decoration-accent-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-accent-400 dark:decoration-accent-400/50 dark:hover:text-accent-300"
                              >
                                {refreshingSlug === row.slug
                                  ? 'Refreshing…'
                                  : 'Refresh queries'}
                              </button>
                            </div>
                          </div>
                          <div className="border-b border-neutral-200 pb-2 dark:border-neutral-700">
                            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                              Sections
                            </p>
                            <div className="flex flex-wrap gap-1">
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={row.missingPage}
                                onClick={() => void handleRowRegenFaqs(row.slug, row.model)}
                              >
                                FAQs
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={row.missingPage}
                                onClick={() => void handleRowWhy(row.slug, row.model)}
                              >
                                Why
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={row.missingPage}
                                onClick={() => void handleRowLocal(row.slug, row.model)}
                              >
                                Local
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={row.missingPage}
                                onClick={() => void handleRowRefreshLinks(row.slug, row.model)}
                              >
                                Links
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => void handleRowFullGenerate(row.slug, row.model)}
                              >
                                Full
                              </Button>
                            </div>
                          </div>
                          <div className="border-b border-neutral-200 pb-2 dark:border-neutral-700">
                            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                              Data
                            </p>
                            <div className="flex flex-wrap gap-1">
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={row.missingPage}
                                onClick={() => void handleDownloadJson(row.slug)}
                              >
                                JSON
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={row.missingPage}
                                onClick={() => void handleCopyCanonical(row)}
                              >
                                Copy URL
                              </Button>
                            </div>
                          </div>
                          <div>
                            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                              Danger
                            </p>
                            <div className="flex flex-wrap gap-1">
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={row.missingPage}
                                onClick={() => handleDiscard(row.slug, row.model)}
                              >
                                Discard
                              </Button>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isOpen ? (
                    <TableRow className="bg-surface-slate/30 dark:bg-surface-slate-dark/40">
                      <TableCell colSpan={TABLE_COL_SPAN} className="p-0 border-t-0">
                        <div className="w-full origin-top transition-all duration-200 ease-in-out max-h-[2000px] opacity-100 scale-y-100">
                          <div className="mt-1 w-full rounded-b-lg border border-neutral-200 bg-surface-slate p-4 dark:border-neutral-700 dark:bg-surface-slate-dark">
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                              <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                                Preview:{' '}
                                {results.find((r) => r.slug === viewSlug)?.model ??
                                  viewSlug}
                              </h2>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  setViewportWidth(1920);
                                  setShowDevicePreview(true);
                                }}
                                disabled={!pageHtml}
                              >
                                Preview on devices
                              </Button>
                              <Button
                                variant="tertiary"
                                size="sm"
                                onClick={() => setViewSlug(null)}
                              >
                                Close
                              </Button>
                            </div>
                            {loadingHtml ? (
                              <p className="text-sm text-neutral-500">
                                Loading HTML…
                              </p>
                            ) : pageHtml ? (
                              <>
                                <ResizableSplit
                                  className="h-[840px]"
                                  leftLabel="HTML"
                                  rightLabel="Preview"
                                  left={
                                    <textarea
                                      readOnly
                                      value={pageHtml}
                                      className="block h-full min-h-0 w-full resize-none rounded border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs text-neutral-800 cursor-copy dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                                      spellCheck={false}
                                      onClick={() => void handleCopyPageCode()}
                                      title="Click to copy page HTML"
                                    />
                                  }
                                  right={
                                    <div
                                      className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded border border-neutral-200 bg-white dark:border-neutral-600 dark:bg-neutral-900"
                                    >
                                      <div className="min-h-0 flex-1 overflow-hidden">
                                        <iframe
                                          title="Page preview"
                                          srcDoc={pageHtml}
                                          className="h-full w-full min-h-0 border-0"
                                          sandbox="allow-same-origin"
                                        />
                                      </div>
                                      {bmwSecondSectionHtml ? (
                                        <div className="shrink-0 border-t border-neutral-200 bg-neutral-50 px-2 py-2 dark:border-neutral-600 dark:bg-neutral-950">
                                          <div className="mb-2 flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                              <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                                                Long-form paragraph 2
                                              </p>
                                              {bmwSecondSectionTitle ? (
                                                <p className="mt-1 truncate text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
                                                  {bmwSecondSectionTitle}
                                                </p>
                                              ) : null}
                                            </div>
                                            <Button
                                              variant="secondary"
                                              size="sm"
                                              onClick={() => void handleCopyBmwSecondSectionHtml()}
                                            >
                                              Copy
                                            </Button>
                                          </div>
                                          <textarea
                                            readOnly
                                            value={bmwSecondSectionHtml}
                                            className="block max-h-52 min-h-[120px] w-full resize-none overflow-y-auto rounded border border-neutral-200 bg-white p-2 font-mono text-[11px] leading-snug text-neutral-800 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200"
                                            spellCheck={false}
                                            onClick={() => void handleCopyBmwSecondSectionHtml()}
                                            title="Click to copy paragraph 2 HTML"
                                          />
                                        </div>
                                      ) : null}
                                    </div>
                                  }
                                />
                              </>
                            ) : (
                              <p className="text-sm text-neutral-500">
                                Could not load HTML for this page.
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="mt-10 border-t border-neutral-200 pt-4 dark:border-neutral-700">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Lineup page (brand pillar)
          </h2>
          <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <span>
              Uses the dedicated lineup template (cards for each model) instead of the model-year template.
            </span>
          </div>
        </div>
        {!brand || year === '' ? (
          <p className="mt-4 text-sm text-neutral-500">
            Select brand and year to see lineup page details.
          </p>
        ) : loadingLineupSummary ? (
          <p className="mt-4 text-sm text-neutral-500">Loading lineup summary…</p>
        ) : !lineupSummary ? (
          <p className="mt-4 text-sm text-neutral-500">
            No lineup page config found for this scope. Add a <code>pageType: &quot;brand-lineup&quot;</code>{' '}
            JSON config under the pages directory to enable this preview.
          </p>
        ) : (
          <div className="mt-4 rounded-lg border border-neutral-200 bg-surface-slate p-4 dark:border-neutral-700 dark:bg-surface-slate-dark">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div>
                  <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
                    {lineupSummary.title || 'Lineup page'}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                      {lineupSummary.title.length}/{SEO_TITLE_MAX}
                    </span>
                    <button
                      type="button"
                      className="text-left text-[10px] text-neutral-500 underline decoration-neutral-400/70 underline-offset-2 transition-colors hover:text-neutral-700 dark:text-neutral-400 dark:decoration-neutral-500/70 dark:hover:text-neutral-200 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
                      disabled={regeneratingLineupTitle}
                      onClick={() => void handleLineupRegenerateTitle()}
                    >
                      {regeneratingLineupTitle ? 'Regenerating…' : 'Regenerate title'}
                    </button>
                  </div>
                </div>
                <p className="text-xs font-mono text-neutral-500 dark:text-neutral-400 break-all">
                  {lineupSummary.url || '(no pagePath set)'}
                </p>
                <div>
                  <p className="text-xs text-neutral-600 dark:text-neutral-300 max-w-xl">
                    {lineupSummary.description || 'No description set.'}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                      {lineupSummary.description.length}/{SEO_DESCRIPTION_MAX}
                    </span>
                    <button
                      type="button"
                      className="text-left text-[10px] text-neutral-500 underline decoration-neutral-400/70 underline-offset-2 transition-colors hover:text-neutral-700 dark:text-neutral-400 dark:decoration-neutral-500/70 dark:hover:text-neutral-200 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
                      disabled={regeneratingLineupDescription}
                      onClick={() => void handleLineupRegenerateDescription()}
                    >
                      {regeneratingLineupDescription
                        ? 'Regenerating…'
                        : 'Regenerate description'}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleLoadLineupHtml}
                  disabled={loadingLineupHtml}
                >
                  {loadingLineupHtml ? 'Loading lineup…' : 'Preview lineup'}
                </Button>
              </div>
            </div>
            {loadingLineupHtml ? (
              <p className="mt-3 text-sm text-neutral-500">Loading HTML…</p>
            ) : lineupHtml ? (
              <div className="mt-3">
                <ResizableSplit
                  className="h-[320px] border-0 rounded-none"
                  leftLabel="HTML"
                  rightLabel="Preview"
                  left={
                    <textarea
                      readOnly
                      value={lineupHtml}
                      className="block h-full min-h-[300px] w-full resize-none rounded border border-neutral-200 bg-neutral-50 p-3 font-mono text-xs text-neutral-800 cursor-copy dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                      spellCheck={false}
                      onClick={() => void handleCopyLineupCode()}
                      title="Click to copy lineup HTML"
                    />
                  }
                  right={
                    <div className="h-full w-full min-h-[300px] overflow-hidden rounded border border-neutral-200 bg-white dark:border-neutral-600 dark:bg-neutral-900">
                      <iframe
                        title="Lineup page preview"
                        srcDoc={lineupHtml}
                        className="h-full w-full min-h-[300px] border-0"
                        sandbox="allow-same-origin"
                      />
                    </div>
                  }
                />
              </div>
            ) : (
              <p className="mt-3 text-sm text-neutral-500">
                Click &quot;Preview lineup&quot; to load HTML for this lineup page.
              </p>
            )}
          </div>
        )}
      </section>

      {viewSlug && (
        <Modal
          open={showDevicePreview}
          onClose={() => setShowDevicePreview(false)}
          title="Preview on devices"
          size="xxl"
        >
          {!pageHtml ? (
            <p className="text-sm text-neutral-500">
              Load page HTML first, then open device preview.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-4" style={{ minHeight: 420 }}>
              <div className="max-h-32 w-full overflow-y-auto">
                <div className="mx-auto w-full max-w-md">
                  <FormGroup
                    label="Viewport"
                    htmlFor="device-viewport"
                    className="min-w-0"
                    hint="Choose a viewport width or device"
                  >
                    <Select
                      id="device-viewport"
                      value={String(viewportWidth)}
                      onChange={(e) => {
                        const next = parseInt(e.target.value, 10);
                        setViewportWidth(Number.isNaN(next) ? 1920 : next);
                      }}
                      className="w-full"
                    >
                      {VIEWPORT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                  </FormGroup>
                </div>
              </div>
              <div className="flex flex-1 items-center justify-center w-full">
                <div
                  className="overflow-auto rounded border border-neutral-200 bg-white shadow dark:border-neutral-600 dark:bg-neutral-900"
                  style={{ width: viewportWidth, maxWidth: '100%', height: 420 }}
                >
                  <iframe
                    title="Device preview"
                    srcDoc={pageHtml}
                    className="h-full w-full border-0"
                    style={{ width: viewportWidth }}
                    sandbox="allow-same-origin"
                  />
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}

      <Modal
        open={peekSlug !== null}
        onClose={() => {
          setPeekSlug(null);
          setPeekText('');
        }}
        title={peekSlug ? `Search queries: ${peekSlug}` : 'Search queries'}
        size="lg"
      >
        <Textarea
          readOnly
          value={peekText}
          className="min-h-[260px] w-full font-mono text-xs"
          spellCheck={false}
        />
      </Modal>

      <Modal
        open={showGenerateAllConfirm}
        onClose={() => setShowGenerateAllConfirm(false)}
        title="Generate all except selected?"
        size="md"
      >
        <div className="space-y-3 text-sm text-neutral-700 dark:text-neutral-300">
          <p>
            This will generate <strong>{slugsGenerateExceptSelected.length}</strong> model page
            {slugsGenerateExceptSelected.length === 1 ? '' : 's'}: every model in this scope
            {selectedSlugs.size > 0 ? (
              <>
                , <em>except</em> the <strong>{selectedSlugs.size}</strong> you have selected in
                the list.
              </>
            ) : (
              <> (none selected to skip, so the full list will run).</>
            )}{' '}
            This can use a large number of tokens.
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Tip: select only the models you want to <em>exclude</em> from this run.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowGenerateAllConfirm(false)}
              disabled={generating}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setShowGenerateAllConfirm(false);
                void handleGenerateAllPages();
              }}
              disabled={generating}
            >
              Generate all <em>except</em>
            </Button>
          </div>
        </div>
      </Modal>

      <ViewPageModal
        open={editSlug !== null}
        onClose={() => setEditSlug(null)}
        brand={brand}
        year={typeof year === 'number' ? year : 0}
        storeKey={scopeStoreKey}
        slug={editSlug ?? ''}
        onSaved={() => {
          bumpPreviewHtml();
          loadResults();
        }}
        onApproved={() => {
          showToast({ message: 'Page approved' });
          loadResults();
        }}
      />
    </>
  );
}
