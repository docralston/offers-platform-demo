import type { StoreCode } from '@/lib/config/stores';
import { getExpiringAndRecentSummary } from '@/lib/domain/dashboard/summary';
import { formatAppTimestamp } from '@/lib/utils/dates';
import Link from 'next/link';

interface ExpiringAndRecentWidgetProps {
  storeCode: StoreCode;
  range: '7d' | '30d' | '90d';
}

export async function ExpiringAndRecentWidget({ storeCode, range }: ExpiringAndRecentWidgetProps) {
  const { expiringSoon, recentlyUpdated } = await getExpiringAndRecentSummary({ storeCode, range });

  return (
    <section className="space-y-4 rounded-md border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Expiring &amp; recently changed</h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Offers expiring soon and those updated recently for this store.
          </p>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Expiring soon
          </h3>
          {expiringSoon.length === 0 ? (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">No offers expiring in this window.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {expiringSoon.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-neutral-800 dark:text-neutral-100">
                      {[o.year, o.model, o.trim].filter(Boolean).join(' ')}
                    </div>
                    <div className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                      {o.offerType ?? '—'} · {o.status}
                    </div>
                  </div>
                  <div className="text-right text-[11px] text-neutral-500 dark:text-neutral-400">
                    <div>{o.endDate.toLocaleDateString('en-US', { timeZone: 'America/New_York' })}</div>
                    <Link
                      href={`/admin/offers/${o.id}`}
                      className="text-[11px] font-medium text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300"
                    >
                      View
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Recently updated
          </h3>
          {recentlyUpdated.length === 0 ? (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">No recent changes in this window.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {recentlyUpdated.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-neutral-800 dark:text-neutral-100">
                      {[o.year, o.model, o.trim].filter(Boolean).join(' ')}
                    </div>
                    <div className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                      {o.offerType ?? '—'} · {o.status}
                    </div>
                  </div>
                  <div className="text-right text-[11px] text-neutral-500 dark:text-neutral-400">
                    <div>{formatAppTimestamp(o.updatedAt)}</div>
                    <Link
                      href={`/admin/offers/${o.id}`}
                      className="text-[11px] font-medium text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300"
                    >
                      View
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

