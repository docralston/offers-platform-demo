import { getDashboardData } from '@/app/actions/offers';
import { getOfferOutliersSummary } from '@/lib/domain/dashboard/summary';
import { OffersOverviewOutliers } from './OffersOverviewOutliers';

export async function OffersOverviewWidget() {
  const [{ live }, outliers] = await Promise.all([
    getDashboardData(),
    getOfferOutliersSummary({ storeCode: 'TOY' }),
  ]);

  const liveOffers = live ?? 0;
  const outlierCount = outliers.length;

  return (
    <section className="mt-2 min-w-[320px] rounded-md border border-neutral-200 bg-surface-slate px-4 py-2 text-sm dark:border-neutral-700 dark:bg-surface-slate-dark">
      <div className="flex items-start gap-10">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Live offers
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
            {liveOffers.toLocaleString('en-US')}
          </p>
        </div>

        <OffersOverviewOutliers outliers={outliers} outlierCount={outlierCount} />
      </div>
    </section>
  );
}

