import { getDashboardData } from '@/app/actions/offers';
import {
  formatVehicleTitle,
  getDisplayOfferType,
  getOfferDetailsSummary,
} from '@/lib/domain/offer-type';
import { getStoreDisplayId } from '@/lib/config/store-display';
import { Button, StatusBadge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import Link from 'next/link';

export async function RecentActivityWidget() {
  const { recent } = await getDashboardData();

  return (
    <section className="space-y-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-neutral-500 dark:text-neutral-400">Last edited offers.</p>
        <Button variant="tertiary" size="sm" asChild>
          <Link href="/admin/offers">View all</Link>
        </Button>
      </header>

      {recent.length === 0 ? (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">No offers yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <tr>
                <TableHead>Status</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead align="right">Actions</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {recent.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <StatusBadge status={o.status} />
                  </TableCell>
                  <TableCell>
                    {getStoreDisplayId(o.storeCode)}
                  </TableCell>
                  <TableCell className="text-neutral-500 dark:text-neutral-400">
                    {getDisplayOfferType(o)} · {getOfferDetailsSummary(o)}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{formatVehicleTitle(o)}</span>
                  </TableCell>
                  <TableCell align="right">
                    <Link
                      href={`/admin/offers/${o.id}/edit`}
                      className="text-sm font-medium text-accent-600 hover:text-accent-700 dark:text-accent-400"
                    >
                      Edit
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
