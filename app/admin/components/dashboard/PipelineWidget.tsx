import Link from 'next/link';
import { getPipelineSummary } from '@/lib/domain/dashboard/summary';

export async function PipelineWidget() {
  const summary = await getPipelineSummary();

  return (
    <section className="space-y-4 p-4">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Catalog health across all stores.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <KpiLink label="Live" value={summary.liveCount} href="/admin/offers?status=LIVE" />
        <KpiLink label="Inactive" value={summary.inactiveCount} href="/admin/offers?status=INACTIVE" />
        <KpiLink label="Archived" value={summary.archivedCount} href="/admin/offers" hint="Past end date" />
        <KpiLink
          label="With issues"
          value={summary.validationIssueCount}
          href="/admin/offers?hasIssues=1"
        />
      </div>
    </section>
  );
}

function KpiLink({
  label,
  value,
  href,
  hint,
}: {
  label: string;
  value: number;
  href: string;
  hint?: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 transition hover:border-accent-300 dark:border-neutral-700 dark:bg-neutral-900/60 dark:hover:border-accent-600"
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
        {value.toLocaleString('en-US')}
      </p>
      {hint && <p className="mt-0.5 text-[10px] text-neutral-400">{hint}</p>}
    </Link>
  );
}
