import type { DashboardStoreFilter } from '@/lib/dashboard/filters';
import { getOfferOutliersSummary } from '@/lib/domain/dashboard/summary';
import Link from 'next/link';

interface OfferOutliersWidgetProps {
  storeCode: DashboardStoreFilter;
}

export async function OfferOutliersWidget({ storeCode }: OfferOutliersWidgetProps) {
  const outliers = await getOfferOutliersSummary({ storeCode });

  return (
    <section className="space-y-3 p-4">
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Suspicious payments, APRs, or rebates for a quick sanity check.
      </p>

      {outliers.length === 0 ? (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          No obvious outliers detected based on current heuristics.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-200 text-[11px] uppercase tracking-wide text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                <th className="px-2 py-1 font-medium">Offer</th>
                <th className="px-2 py-1 font-medium">Metrics</th>
                <th className="px-2 py-1 font-medium">Reasons</th>
                <th className="px-2 py-1 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {outliers.map((o) => (
                <tr key={o.id} className="border-b border-neutral-100 last:border-b-0 dark:border-neutral-800">
                  <td className="max-w-[180px] px-2 py-1 align-top">
                    <div className="truncate font-medium text-neutral-800 dark:text-neutral-100">
                      {[o.year, o.model].filter(Boolean).join(' ')}
                    </div>
                    <div className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                      {o.offerType ?? '—'} · {o.status}
                    </div>
                  </td>
                  <td className="px-2 py-1 align-top text-[11px] text-neutral-600 dark:text-neutral-300">
                    {o.leasePayment != null && (
                      <div>Lease: ${o.leasePayment.toLocaleString('en-US')}</div>
                    )}
                    {o.aprRate != null && <div>APR: {o.aprRate.toFixed(2)}%</div>}
                    {o.rebateTotal != null && (
                      <div>Rebate: ${o.rebateTotal.toLocaleString('en-US')}</div>
                    )}
                  </td>
                  <td className="px-2 py-1 align-top text-[11px] text-neutral-600 dark:text-neutral-300">
                    <ul className="list-disc space-y-0.5 pl-4">
                      {o.reasons.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-2 py-1 align-top text-right">
                    <Link
                      href={`/admin/offers/${o.id}`}
                      className="text-xs font-medium text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

