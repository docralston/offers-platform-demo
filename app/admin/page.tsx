import { getDashboardLayout } from '@/app/actions/dashboard-layout';
import { normalizeDashboardStore } from '@/lib/dashboard/filters';
import { Suspense } from 'react';
import { DashboardFilters } from './components/dashboard/DashboardFilters';
import { DashboardGrid } from './components/dashboard/DashboardGrid';
import { IngestionHealthWidget } from './components/dashboard/IngestionHealthWidget';
import { ModelAssetCoverageWidget } from './components/dashboard/ModelAssetCoverageWidget';
import { OfferOutliersWidget } from './components/dashboard/OfferOutliersWidget';
import { PipelineWidget } from './components/dashboard/PipelineWidget';
import { RecentActivityWidget } from './components/dashboard/RecentActivityWidget';
import { ValidationSummaryWidget } from './components/dashboard/ValidationSummaryWidget';

interface DashboardPageProps {
  searchParams: Promise<{ store?: string; range?: string; year?: string }>;
}

function normalizeRange(raw?: string): '7d' | '30d' | '90d' {
  if (raw === '7d' || raw === '90d') return raw;
  return '30d';
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const p = await searchParams;
  const storeCode = normalizeDashboardStore(p.store);
  const range = normalizeRange(p.range);
  const year = Number(p.year) || new Date().getFullYear();
  const layout = await getDashboardLayout();

  const slots = [
    {
      id: 'pipeline' as const,
      title: 'Offer pipeline',
      content: (
        <Suspense fallback={<WidgetSkeleton />}>
          <PipelineWidget />
        </Suspense>
      ),
    },
    {
      id: 'validation' as const,
      title: 'Validation queue',
      content: (
        <Suspense fallback={<WidgetSkeleton />}>
          <ValidationSummaryWidget storeCode={storeCode} range={range} />
        </Suspense>
      ),
    },
    {
      id: 'outliers' as const,
      title: 'Data outliers',
      content: (
        <Suspense fallback={<WidgetSkeleton tall />}>
          <OfferOutliersWidget storeCode={storeCode} />
        </Suspense>
      ),
    },
    {
      id: 'assets' as const,
      title: 'Marketing assets',
      content: (
        <Suspense fallback={<WidgetSkeleton tall />}>
          <ModelAssetCoverageWidget year={year} />
        </Suspense>
      ),
    },
    {
      id: 'ingestion' as const,
      title: 'Ingestion health',
      content: (
        <Suspense fallback={<WidgetSkeleton />}>
          <IngestionHealthWidget />
        </Suspense>
      ),
    },
    {
      id: 'recent' as const,
      title: 'Recent activity',
      content: (
        <Suspense fallback={<WidgetSkeleton tall />}>
          <RecentActivityWidget />
        </Suspense>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="border-b border-neutral-200 pb-4 dark:border-neutral-700">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Overview</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Pipeline health, validation queue, marketing readiness, and ingestion status.
        </p>
      </header>

      <DashboardFilters storeCode={storeCode} range={range} />

      <DashboardGrid layout={layout} slots={slots} />
    </div>
  );
}

function WidgetSkeleton({ tall }: { tall?: boolean }) {
  return (
    <div className={`animate-pulse rounded bg-neutral-100 dark:bg-neutral-800 ${tall ? 'm-4 h-48' : 'm-4 h-24'}`} />
  );
}
