import {
  getAiUsageSummary,
  getAiUsageTable,
  getProviderBreakdownThisMonth,
  getTopExpensiveRequests,
  getWeeklyCostSeries,
  getUnpricedModelWarning,
  type AiUsageProviderBreakdownRow,
  type WeeklyCostPoint,
  purgeErrorLogs,
} from '@/app/actions/ai-usage';
import { displayAiUsageTags } from '@/lib/ai-usage-display';
import { PRICING_AS_OF } from '@/lib/openai-pricing';
import { requireAdmin } from '@/lib/auth';
import { formatAppTimestamp } from '@/lib/utils/dates';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Input, Select, Button, FormGroup, Alert } from '@/components/ui';

interface SearchParams {
  from?: string;
  to?: string;
  model?: string;
  status?: string;
  tag?: string;
  page?: string;
}

interface PageProps {
  searchParams: Promise<SearchParams>;
}

function formatDurationMs(durationMs: number | null | undefined): string {
  if (!Number.isFinite(durationMs) || durationMs == null || durationMs <= 0) return '—';
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remSeconds}s`;
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function AiUsagePage({ searchParams }: PageProps) {
  await requireAdmin();
  const params = await searchParams;

  const from = parseDate(params.from);
  const to = parseDate(params.to);
  const page = Number(params.page ?? '1') || 1;
  const status =
    params.status === 'success' || params.status === 'error'
      ? (params.status as 'success' | 'error')
      : undefined;

  const [summary, table, top20, weekly, providerBreakdown, unpricedWarning]: [
    Awaited<ReturnType<typeof getAiUsageSummary>>,
    Awaited<ReturnType<typeof getAiUsageTable>>,
    Awaited<ReturnType<typeof getTopExpensiveRequests>>,
    WeeklyCostPoint[],
    AiUsageProviderBreakdownRow[],
    Awaited<ReturnType<typeof getUnpricedModelWarning>>,
  ] = await Promise.all([
    getAiUsageSummary(),
    getAiUsageTable({
      from,
      to,
      model: params.model,
      status,
      tag: params.tag,
      page,
      pageSize: 200,
    }),
    getTopExpensiveRequests({
      from,
      to,
      model: params.model,
      status,
      tag: params.tag,
    }),
    getWeeklyCostSeries(52),
    getProviderBreakdownThisMonth(),
    getUnpricedModelWarning(),
  ]);

  const todayCost = summary.today._sum.estimatedCostUsd ?? 0;
  const todayCount = summary.today._count._all ?? 0;
  const monthCost = summary.month._sum.estimatedCostUsd ?? 0;
  const monthCount = summary.month._count._all ?? 0;

  const weeklyMax = weekly.reduce((max, point) => Math.max(max, point.totalCost), 0);
  const weeklyTotal = weekly.reduce((sum, point) => sum + point.totalCost, 0);
  const weekFormatter = weekly.length
    ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })
    : null;

  const totalPages = Math.max(1, Math.ceil(table.total / table.pageSize));

  return (
    <div className="space-y-8">
      <header className="border-b border-neutral-200 pb-4 dark:border-neutral-700">
        <h1 className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
          AI usage
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Internal-only AI provider usage and cost diagnostics. Estimated from vendor list prices as of{' '}
          {PRICING_AS_OF}.
        </p>
      </header>

      {unpricedWarning.count > 0 && (
        <Alert tone="warning" title="Unpriced models detected">
          {unpricedWarning.count} successful request{unpricedWarning.count === 1 ? '' : 's'} in the last{' '}
          {unpricedWarning.days} days used models with no pricing rule — add rates in{' '}
          <code className="text-xs">lib/openai-pricing.ts</code> and run{' '}
          <code className="text-xs">npm run backfill:openai-costs -- --all</code>.
        </Alert>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-md border border-neutral-200 bg-surface-slate px-4 py-3 dark:border-neutral-700 dark:bg-surface-slate-dark">
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Cost today
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
            ${Number(todayCost).toFixed(6)}
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {todayCount} requests
          </p>
        </div>
        <div className="rounded-md border border-neutral-200 bg-surface-slate px-4 py-3 dark:border-neutral-700 dark:bg-surface-slate-dark">
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Cost this month
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
            ${Number(monthCost).toFixed(6)}
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {monthCount} requests
          </p>
        </div>
        <div className="rounded-md border border-neutral-200 bg-surface-slate px-4 py-3 dark:border-neutral-700 dark:bg-surface-slate-dark">
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Cost per week (last 52)
          </p>
          <div className="mt-2 h-24 flex items-end gap-[1px]">
            {weekly.length > 0 && weeklyMax > 0 ? (
              weekly.map((point, index) => {
                const height =
                  point.totalCost <= 0 ? 2 : Math.max(4, (point.totalCost / weeklyMax) * 100);
                return (
                  <div
                     
                    key={index}
                    className="flex-1 rounded-t-sm bg-emerald-500/70 dark:bg-emerald-400/80"
                    style={{ height: `${height}%` }}
                    title={`Week of ${
                      weekFormatter ? weekFormatter.format(point.weekStart) : ''
                    }: $${point.totalCost.toFixed(2)}`}
                  />
                );
              })
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-neutral-500 dark:text-neutral-400">
                No data yet
              </div>
            )}
          </div>
          {weekly.length > 0 && weekFormatter && (
            <div className="mt-1 flex items-center justify-between text-[10px] text-neutral-500 dark:text-neutral-400">
              <span>{weekFormatter.format(weekly[0].weekStart)}</span>
              <span>{weekFormatter.format(weekly[weekly.length - 1].weekStart)}</span>
            </div>
          )}
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Total: ${weeklyTotal.toFixed(2)} (max week: ${weeklyMax.toFixed(2)})
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
          Provider and API path spend (month-to-date)
        </h2>
        <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-700">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>API path</TableHead>
                <TableHead>Requests</TableHead>
                <TableHead>Success/Error</TableHead>
                <TableHead>Avg duration</TableHead>
                <TableHead>Cost (USD)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providerBreakdown.map((row) => (
                <TableRow key={`${row.provider}-${row.apiPath}`}>
                  <TableCell>{row.provider}</TableCell>
                  <TableCell>{row.apiPath}</TableCell>
                  <TableCell className="tabular-nums">{row.requests}</TableCell>
                  <TableCell className="tabular-nums">{row.success}/{row.errors}</TableCell>
                  <TableCell className="tabular-nums">{formatDurationMs(row.avgDurationMs)}</TableCell>
                  <TableCell className="tabular-nums">${row.totalCostUsd.toFixed(5)}</TableCell>
                </TableRow>
              ))}
              {providerBreakdown.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" className="py-6 text-sm text-neutral-500 dark:text-neutral-400">
                    No month-to-date usage rows yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-4">
        <form
          method="get"
          className="rounded-md border border-neutral-200 bg-surface-amber px-3 py-3 dark:border-neutral-700 dark:bg-surface-amber-dark sm:px-4"
        >
          <div className="grid grid-cols-2 gap-3 lg:flex lg:flex-row lg:flex-wrap lg:items-end lg:gap-4">
            <FormGroup label="From" htmlFor="from" className="min-w-0">
              <Input
                id="from"
                name="from"
                type="date"
                defaultValue={params.from}
                className="w-full min-w-[7rem]"
              />
            </FormGroup>
            <FormGroup label="To" htmlFor="to" className="min-w-0">
              <Input
                id="to"
                name="to"
                type="date"
                defaultValue={params.to}
                className="w-full min-w-[7rem]"
              />
            </FormGroup>
            <FormGroup label="Model" htmlFor="model" className="min-w-0">
              <Input
                id="model"
                name="model"
                type="text"
                defaultValue={params.model}
                placeholder="e.g. gpt-5-nano"
                className="w-full min-w-[8rem]"
              />
            </FormGroup>
            <FormGroup label="Status" htmlFor="status" className="min-w-0">
              <Select
                id="status"
                name="status"
                defaultValue={params.status ?? ''}
                className="w-full min-w-[6rem]"
              >
                <option value="">All</option>
                <option value="success">Success</option>
                <option value="error">Error</option>
              </Select>
            </FormGroup>
            <FormGroup label="Feature tag" htmlFor="tag" className="min-w-0">
              <Input
                id="tag"
                name="tag"
                type="text"
                defaultValue={params.tag}
                placeholder="Any tag key/value (e.g. year, 2026, model-page-generator)"
                className="w-full min-w-[8rem]"
              />
            </FormGroup>
            <div className="flex items-end lg:ml-auto">
              <Button type="submit" variant="secondary" size="sm" className="w-full lg:w-auto">
                Apply filters
              </Button>
            </div>
          </div>
        </form>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
              Last {table.rows.length} requests
            </h2>
            <form action={purgeErrorLogs}>
              <Button type="submit" variant="secondary" size="sm">
                Purge error rows
              </Button>
            </form>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Showing page {table.page} of {totalPages} ({table.total} total)
            </p>
          </div>
          <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-700">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Tokens (in/out/total)</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Cost (USD)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tags</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.rows.map((row) => {
                  const tagsForDisplay = displayAiUsageTags(row.createdAt, row.tags);
                  return (
                  <TableRow
                    key={row.id}
                    className={
                      row.status === 'error'
                        ? '[&_td]:text-red-600 [&_td]:dark:text-red-400'
                        : undefined
                    }
                  >
                    <TableCell>
                      {formatAppTimestamp(row.createdAt)}
                    </TableCell>
                    <TableCell>{row.model}</TableCell>
                    <TableCell className="tabular-nums">
                      {row.inputTokens}/{row.outputTokens}/{row.totalTokens}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatDurationMs(row.durationMs)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      ${Number(row.estimatedCostUsd).toFixed(5)}
                    </TableCell>
                  <TableCell>{row.status}</TableCell>
                  <TableCell className="text-xs text-neutral-500 dark:text-neutral-400">
                    {tagsForDisplay ? (
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(tagsForDisplay).map(
                          ([key, value]) => {
                            const displayKey = key === 'brandSlug' ? 'brand' : key;
                            return (
                              <span
                                key={key}
                                className="inline-flex items-center rounded-full border border-neutral-200/80 bg-neutral-50 px-2 py-0.5 text-[11px] font-medium text-neutral-700 dark:border-neutral-700/80 dark:bg-neutral-800 dark:text-neutral-200"
                              >
                                <span className="mr-1 text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                                  {displayKey}
                                </span>
                                <span className="truncate">
                                  {typeof value === 'string'
                                    ? value
                                    : value == null
                                      ? ''
                                      : String(value)}
                                </span>
                              </span>
                            );
                          }
                        )}
                      </div>
                    ) : (
                      <span className="text-neutral-400 dark:text-neutral-600">—</span>
                    )}
                  </TableCell>
                  </TableRow>
                  );
                })}
                {table.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" className="py-6 text-sm text-neutral-500 dark:text-neutral-400">
                      No requests found for the selected filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              <Button
                asChild
                variant="tertiary"
                size="sm"
                disabled={table.page <= 1}
              >
                <a
                  href={`?${new URLSearchParams({
                    ...params,
                    page: String(table.page - 1),
                  }).toString()}`}
                >
                  Previous
                </a>
              </Button>
              <Button
                asChild
                variant="tertiary"
                size="sm"
                disabled={table.page >= totalPages}
              >
                <a
                  href={`?${new URLSearchParams({
                    ...params,
                    page: String(table.page + 1),
                  }).toString()}`}
                >
                  Next
                </a>
              </Button>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
          Top 20 most expensive requests
        </h2>
        <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-700">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Cost (USD)</TableHead>
                <TableHead>Tokens (total)</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Feature</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {top20.map((row) => (
                <TableRow
                  key={row.id}
                  className={
                    row.status === 'error'
                      ? '[&_td]:text-red-600 [&_td]:dark:text-red-400'
                      : undefined
                  }
                >
                  <TableCell>
                    {formatAppTimestamp(row.createdAt)}
                  </TableCell>
                  <TableCell>{row.model}</TableCell>
                  <TableCell className="tabular-nums">
                    ${Number(row.estimatedCostUsd).toFixed(5)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {row.totalTokens}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {formatDurationMs(row.durationMs)}
                  </TableCell>
                  <TableCell className="text-xs text-neutral-500 dark:text-neutral-400">
                    {typeof (row.tags as any)?.feature === 'string'
                      ? (row.tags as any).feature
                      : ''}
                  </TableCell>
                </TableRow>
              ))}
              {top20.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" className="py-6 text-sm text-neutral-500 dark:text-neutral-400">
                    No requests available yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

