import type {
  AssetStatus,
  ModelAssetCoverageRow,
  ModelCoverageBrand,
} from '@/lib/domain/dashboard/summary';
import { getModelAssetCoverage } from '@/lib/domain/dashboard/summary';
import Link from 'next/link';
import { ModelAssetCoverageYearSelector } from './ModelAssetCoverageYearSelector';
import { Fragment } from 'react';
import { AssetStatusCellClient } from './AssetStatusCellClient';
import { refreshAllAssetHealth } from '@/app/actions/asset-health';
import { generateMissingModelPageConfig } from '@/app/actions/model-pages';
import { formatOemBrandLabel } from '@/lib/config/oem-labels';

interface ModelAssetCoverageWidgetProps {
  year: number;
}

const BRANDS_IN_ORDER: ModelCoverageBrand[] = ['bmw', 'toyota', 'lexus'];

export async function ModelAssetCoverageWidget({ year }: ModelAssetCoverageWidgetProps) {
  const brandRows = await Promise.all(
    BRANDS_IN_ORDER.map(async (brand) => ({
      brand,
      rows: await getModelAssetCoverage({ brand, year }),
    })),
  );

  return (
    <section className="space-y-3 rounded-md border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Model pages, assets, and offer coverage
          </h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Which models have a model page, images, and at least one lease, finance, or cash/other offer.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ModelAssetCoverageYearSelector />
          <Link
            href="/admin/model-pages"
            className="text-xs font-medium text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300"
          >
            View model pages
          </Link>
        </div>
      </header>

      <p className="mt-2 text-[11px] text-neutral-500 dark:text-neutral-500">
        <span className="mr-2 inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Live
        </span>
        <span className="mr-2 inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full border border-emerald-500" /> Placeholder
        </span>
        <span className="mr-2 inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-neutral-300 dark:bg-neutral-700" /> Missing
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Error
        </span>
      </p>

      {brandRows.every((b) => b.rows.length === 0) ? (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          No model coverage data available yet for this year.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-white dark:bg-neutral-900">
              <tr className="border-b border-neutral-200 text-[11px] uppercase tracking-wide text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                <th className="px-2 py-1 font-medium text-left">Model</th>
                <th className="px-2 py-1 font-medium text-center">
                  <div className="inline-flex items-center gap-1">
                    <span>Model page</span>
                    <form
                      action={async () => {
                        'use server';
                        await refreshAllAssetHealth(year);
                      }}
                    >
                      <button
                        type="submit"
                        className="text-[10px] text-neutral-500 hover:text-accent-600"
                        title="Re-run asset health checks for model pages, hero, and vehicle images"
                      >
                        ⟳
                      </button>
                    </form>
                  </div>
                </th>
                <th className="px-2 py-1 font-medium text-center">
                  <div className="inline-flex items-center gap-1">
                    <span>Hero img</span>
                    <form
                      action={async () => {
                        'use server';
                        await refreshAllAssetHealth(year);
                      }}
                    >
                      <button
                        type="submit"
                        className="text-[10px] text-neutral-500 hover:text-accent-600"
                        title="Re-run asset health checks"
                      >
                        ⟳
                      </button>
                    </form>
                  </div>
                </th>
                <th className="px-2 py-1 font-medium text-center">
                  <div className="inline-flex items-center gap-1">
                    <span>Vehicle img</span>
                    <form
                      action={async () => {
                        'use server';
                        await refreshAllAssetHealth(year);
                      }}
                    >
                      <button
                        type="submit"
                        className="text-[10px] text-neutral-500 hover:text-accent-600"
                        title="Re-run asset health checks"
                      >
                        ⟳
                      </button>
                    </form>
                  </div>
                </th>
                <th className="px-2 py-1 font-medium text-center">Config</th>
                <th className="px-2 py-1 font-medium text-center">Lease</th>
                <th className="px-2 py-1 font-medium text-center">Finance</th>
                <th className="px-2 py-1 font-medium text-center">Cash</th>
              </tr>
            </thead>
            <tbody>
              {brandRows.map(({ brand, rows }, index) => (
                <Fragment key={brand}>
                  {rows.length > 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className={`px-2 pb-1 ${
                          index === 0 ? 'pt-3' : 'pt-6'
                        }`}
                      >
                        <span className="inline-block border-b-2 border-black pb-0.5 text-sm font-semibold uppercase tracking-wide text-neutral-700 dark:text-neutral-200">
                          {formatOemBrandLabel(brand)}
                        </span>
                      </td>
                    </tr>
                  )}
                  {rows.map((row) => (
                    <tr
                      key={`${brand}-${row.model}`}
                      className="border-b border-neutral-100 last:border-b-0 dark:border-neutral-800"
                    >
                      <td className="px-2 py-1 text-xs font-medium text-neutral-800 dark:text-neutral-100">
                        {row.model}
                      </td>
                      <AssetStatusCellClient
                        status={row.modelPageStatus}
                        info={row.modelPageInfo}
                        label="Model page"
                      />
                      <AssetStatusCellClient
                        status={row.heroImageStatus}
                        info={row.heroImageInfo}
                        label="Hero image"
                      />
                      <AssetStatusCellClient
                        status={row.vehicleImageStatus}
                        info={row.vehicleImageInfo}
                        label="Vehicle image"
                      />
                      <td className="px-2 py-1 text-center align-top">
                        {row.hasModelPage ? (
                          <span className="text-[11px] text-neutral-400 dark:text-neutral-500">—</span>
                        ) : (
                          <form
                            action={async () => {
                              'use server';
                              await generateMissingModelPageConfig(brand, year, row.model);
                            }}
                          >
                            <button
                              type="submit"
                              className="text-xs font-medium text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300"
                              title={`Generate starter config for ${row.model}`}
                            >
                              Generate config
                            </button>
                          </form>
                        )}
                      </td>
                      <StatusCell ok={row.hasLeaseOffer} text={row.leaseOfferText} />
                      <StatusCell ok={row.hasFinanceOffer} text={row.financeOfferText} />
                      <StatusCell ok={row.hasCashOrOtherOffer} text={row.cashOrOtherOfferText} />
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StatusCell({ ok, text }: { ok: boolean; text?: string | null }) {
  const showPill = ok && text;
  return (
    <td className="px-2 py-1 text-center align-top">
      {showPill ? (
        <span className="inline-flex items-center justify-center rounded-full border border-emerald-400/70 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:border-emerald-500/70 dark:bg-emerald-900/30 dark:text-emerald-100">
          <span className="whitespace-normal break-words leading-snug">{text}</span>
        </span>
      ) : (
        <span
          className={`inline-flex h-2.5 w-2.5 rounded-full ${
            ok ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-700'
          }`}
          aria-label={ok ? 'Complete' : 'Missing'}
        />
      )}
    </td>
  );
}

