import type { DashboardStoreFilter } from '@/lib/dashboard/filters';
import { getValidationSummary } from '@/lib/domain/dashboard/summary';
import Link from 'next/link';

interface ValidationSummaryWidgetProps {
  storeCode: DashboardStoreFilter;
  range: '7d' | '30d' | '90d';
}

export async function ValidationSummaryWidget({ storeCode, range }: ValidationSummaryWidgetProps) {
  const summary = await getValidationSummary({ storeCode, range });

  return (
    <section className="space-y-4 p-4">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Import and ops issues needing follow-up.{' '}
        <Link href="/admin/offers?hasIssues=1" className="font-medium text-accent-600 dark:text-accent-400">
          View queue →
        </Link>
      </p>

      <div className="grid grid-cols-2 gap-3">
        <KpiTile label="With issues" value={summary.totalWithValidationIssues} />
        <KpiTile label={`New in last ${range}`} value={summary.newIssuesLastNDays} />
        <KpiTile
          label="Avg age (days)"
          value={summary.averageAgeDays != null ? Math.round(summary.averageAgeDays) : 0}
        />
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Top validation categories
        </h3>
        {summary.categories.length === 0 ? (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            No validation issues in the current queue.
          </p>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {summary.categories.slice(0, 8).map((cat) => (
              <li key={cat.code} className="flex items-center justify-between gap-2">
                <span className="truncate text-neutral-700 dark:text-neutral-200">{cat.code}</span>
                <span className="text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">{cat.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function KpiTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900/60">
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">{value}</p>
    </div>
  );
}

