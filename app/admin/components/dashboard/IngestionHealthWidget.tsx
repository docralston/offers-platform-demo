import type { IngestionRunSummary } from '@/lib/domain/dashboard/summary';
import { getToyotaIngestionHistory } from '@/lib/domain/dashboard/summary';

export async function IngestionHealthWidget() {
  const runs = await getToyotaIngestionHistory(5);
  const latest = runs[0];
  const healthy = latest && latest.success && latest.errorCount === 0;
  const priorRuns = runs.slice(1);

  return (
    <section className="space-y-4 p-4">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Recent Toyota scraper runs from the ingestion pipeline.
      </p>

      {runs.length === 0 ? (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          No ingestion runs found in artifacts yet.
        </p>
      ) : (
        <>
          <div
            className={`rounded-md border px-3 py-3 ${
              healthy
                ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30'
                : 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30'
            }`}
          >
            <div className="flex items-start gap-2">
              <span
                className={`mt-0.5 inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${
                  healthy ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              />
              <div className="min-w-0">
                <p className="text-xs font-medium text-neutral-800 dark:text-neutral-100">
                  {healthy ? 'Latest run looks healthy' : 'Latest run has warnings or errors'}
                </p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
                  {latest.runId}
                </p>
              </div>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-2">
              <Stat label="Inserted" value={latest.inserted} />
              <Stat label="Updated" value={latest.updated} />
              <Stat label="Inactivated" value={latest.inactivated} />
              <Stat
                label="Errors"
                value={latest.errorCount}
                highlight={latest.errorCount > 0 ? 'warn' : undefined}
              />
            </dl>
          </div>

          {priorRuns.length > 0 && (
            <div>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Previous runs
              </h3>
              <ul className="space-y-2">
                {priorRuns.map((run) => (
                  <li key={run.runId}>
                    <RunListItem run={run} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: 'warn';
}) {
  return (
    <div className="rounded border border-neutral-200/80 bg-white/70 px-2.5 py-2 dark:border-neutral-700/80 dark:bg-neutral-900/50">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-lg font-semibold tabular-nums ${
          highlight === 'warn'
            ? 'text-amber-700 dark:text-amber-300'
            : 'text-neutral-900 dark:text-neutral-100'
        }`}
      >
        {value.toLocaleString('en-US')}
      </dd>
    </div>
  );
}

function RunListItem({ run }: { run: IngestionRunSummary }) {
  const ok = run.success && run.errorCount === 0;

  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900/60">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-mono text-[11px] text-neutral-700 dark:text-neutral-200">{run.runId}</p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
            ok
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
              : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
          }`}
        >
          {run.success ? 'Success' : 'Failed'}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
        +{run.inserted} ins · {run.updated} upd · {run.inactivated} deact
        {run.errorCount > 0 && (
          <span className="text-amber-700 dark:text-amber-300"> · {run.errorCount} err</span>
        )}
      </p>
    </div>
  );
}
