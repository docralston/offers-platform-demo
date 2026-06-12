import type { StoreCode } from '@/lib/config/stores';
import { getOfferCoverageSummary, type OfferCoverageCell } from '@/lib/domain/dashboard/summary';

interface OfferCoverageWidgetProps {
  storeCode: StoreCode;
  year?: number;
}

export async function OfferCoverageWidget({ storeCode, year }: OfferCoverageWidgetProps) {
  const { cells } = await getOfferCoverageSummary({ storeCode, year });

  if (cells.length === 0) {
    return (
      <section className="rounded-md border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Offer coverage</h2>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          No offers found yet for this store and year.
        </p>
      </section>
    );
  }

  const grouped = groupByModelYear(cells);
  const columns: Array<{ id: OfferCoverageCell['offerType']; label: string }> = [
    { id: 'Lease', label: 'Lease' },
    { id: 'Finance', label: 'Finance' },
    { id: 'CashOrOther', label: 'Cash / Other' },
  ];

  const badgeClassForStatus = (status: OfferCoverageCell['status']) => {
    switch (status) {
      case 'OK':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
      case 'EXPIRING_SOON':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200';
      case 'MISSING':
      default:
        return 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300';
    }
  };

  const labelForStatus = (status: OfferCoverageCell['status']) => {
    switch (status) {
      case 'OK':
        return 'OK';
      case 'EXPIRING_SOON':
        return 'Expiring soon';
      case 'MISSING':
      default:
        return 'Missing';
    }
  };

  return (
    <section className="space-y-3 rounded-md border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Offer coverage by model</h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Rows show models; columns show offer types with status badges.
          </p>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead>
            <tr className="border-b border-neutral-200 text-[11px] uppercase tracking-wide text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
              <th className="px-2 py-1 font-medium">Model / Year</th>
              {columns.map((col) => (
                <th key={col.id} className="px-2 py-1 font-medium">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map((row) => (
              <tr key={row.key} className="border-b border-neutral-100 last:border-b-0 dark:border-neutral-800">
                <td className="whitespace-nowrap px-2 py-1 text-xs font-medium text-neutral-800 dark:text-neutral-100">
                  {row.model}
                  {row.year ? <span className="ml-1 text-neutral-500 dark:text-neutral-400">({row.year})</span> : null}
                </td>
                {columns.map((col) => {
                  const cell = row.byType[col.id];
                  if (!cell) {
                    return (
                      <td key={col.id} className="px-2 py-1 text-xs text-neutral-400 dark:text-neutral-600">
                        —
                      </td>
                    );
                  }
                  return (
                    <td key={col.id} className="px-2 py-1">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClassForStatus(
                          cell.status,
                        )}`}
                        title={`Live: ${cell.liveCount} · Inactive: ${cell.inactiveCount}`}
                      >
                        {labelForStatus(cell.status)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function groupByModelYear(cells: OfferCoverageCell[]): Array<{
  key: string;
  model: string;
  year: number | null;
  byType: Record<OfferCoverageCell['offerType'], OfferCoverageCell | undefined>;
}> {
  const map = new Map<
    string,
    {
      key: string;
      model: string;
      year: number | null;
      byType: Record<OfferCoverageCell['offerType'], OfferCoverageCell | undefined>;
    }
  >();

  for (const cell of cells) {
    const key = `${cell.model}::${cell.year ?? ''}`;
    let row = map.get(key);
    if (!row) {
      row = {
        key,
        model: cell.model,
        year: cell.year ?? null,
        byType: {
          Lease: undefined,
          Finance: undefined,
          CashOrOther: undefined,
        },
      };
      map.set(key, row);
    }
    row.byType[cell.offerType] = cell;
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.model === b.model) {
      const ay = a.year ?? 0;
      const by = b.year ?? 0;
      return ay - by;
    }
    return a.model.localeCompare(b.model);
  });
}

