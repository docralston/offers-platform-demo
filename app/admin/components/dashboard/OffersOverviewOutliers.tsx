'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Modal } from '@/components/ui/Modal';

interface OfferOutlierSummary {
  id: string;
  model: string;
  year: number | null;
  offerType: string | null;
  status: string;
  leasePayment: number | null;
  aprRate: number | null;
  rebateTotal: number | null;
  reasons: string[];
}

interface OffersOverviewOutliersProps {
  outliers: OfferOutlierSummary[];
  outlierCount: number;
}

export function OffersOverviewOutliers({
  outliers,
  outlierCount,
}: OffersOverviewOutliersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hasOutliers = outlierCount > 0;
  const modalTitle = useMemo(
    () => `Outliers (${outlierCount.toLocaleString('en-US')})`,
    [outlierCount],
  );

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        Outliers
      </p>
      <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
        {hasOutliers
          ? `${outlierCount.toLocaleString('en-US')} potential outliers flagged.`
          : 'No potential outliers flagged.'}
      </p>
      {hasOutliers && (
        <>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="mt-1 text-xs font-medium text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300"
          >
            View all
          </button>

          <Modal
            open={isOpen}
            onClose={() => setIsOpen(false)}
            title={modalTitle}
            size="lg"
            actions={
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:ring-offset-1 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
              >
                Close
              </button>
            }
          >
            <div className="max-h-[65vh] overflow-x-auto">
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
                  {outliers.map((outlier) => (
                    <tr
                      key={outlier.id}
                      className="border-b border-neutral-100 last:border-b-0 dark:border-neutral-800"
                    >
                      <td className="max-w-[180px] px-2 py-1 align-top">
                        <div className="truncate font-medium text-neutral-800 dark:text-neutral-100">
                          {[outlier.year, outlier.model].filter(Boolean).join(' ')}
                        </div>
                        <div className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                          {outlier.offerType ?? '—'} · {outlier.status}
                        </div>
                      </td>
                      <td className="px-2 py-1 align-top text-[11px] text-neutral-600 dark:text-neutral-300">
                        {outlier.leasePayment != null && (
                          <div>Lease: ${outlier.leasePayment.toLocaleString('en-US')}</div>
                        )}
                        {outlier.aprRate != null && <div>APR: {outlier.aprRate.toFixed(2)}%</div>}
                        {outlier.rebateTotal != null && (
                          <div>Rebate: ${outlier.rebateTotal.toLocaleString('en-US')}</div>
                        )}
                      </td>
                      <td className="px-2 py-1 align-top text-[11px] text-neutral-600 dark:text-neutral-300">
                        <ul className="list-disc space-y-0.5 pl-4">
                          {outlier.reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-2 py-1 align-top text-right">
                        <Link
                          href={`/admin/offers/${outlier.id}`}
                          onClick={() => setIsOpen(false)}
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
          </Modal>
        </>
      )}
    </div>
  );
}
