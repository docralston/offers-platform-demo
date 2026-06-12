import { getOffer, getOfferVersions } from '@/app/actions/offers';
import { Breadcrumbs, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';
import { formatConditionPrefix, modelForDisplay, formatVehicleTitle, getDisplayOfferType } from '@/lib/domain/offer-type';
import { formatAppTimestamp } from '@/lib/utils/dates';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RestoreButton } from './RestoreButton';
import { ViewSnapshotButton } from './ViewSnapshotButton';

interface HistoryPageProps {
  params: Promise<{ id: string }>;
}

export default async function HistoryPage({ params }: HistoryPageProps) {
  const { id: offerId } = await params;
  const [offer, versions] = await Promise.all([getOffer(offerId), getOfferVersions(offerId)]);
  if (!offer) notFound();

  const certifiedFinance = offer.condition === 'CERTIFIED' && getDisplayOfferType(offer) === 'Finance';
  const breadcrumbLabel = certifiedFinance
    ? `${formatConditionPrefix(offer.condition)}${[offer.make, modelForDisplay(offer.make, offer.model)].filter(Boolean).join(' ')}`.trim()
    : formatVehicleTitle(offer);

  return (
    <div className="space-y-6">
      <header className="border-b border-neutral-200 pb-4 dark:border-neutral-700">
        <Breadcrumbs
          items={[
            { label: 'Offers', href: '/admin/offers' },
            { label: breadcrumbLabel || 'Offer', href: `/admin/offers/${offerId}` },
            { label: 'History' },
          ]}
        />
        <h1 className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
          Version history
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          View and restore previous versions of this offer.
        </p>
        <div className="mt-3">
          <Button variant="tertiary" size="sm" asChild>
            <Link href={`/admin/offers/${offerId}`}>Back to offer</Link>
          </Button>
        </div>
      </header>

      <Table>
        <TableHeader>
          <tr>
            <TableHead>Version</TableHead>
            <TableHead>Changed at</TableHead>
            <TableHead>Changed by</TableHead>
            <TableHead>Note</TableHead>
            <TableHead align="right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </tr>
        </TableHeader>
        <TableBody>
          {versions.map((v: { id: string; versionNumber: number; changedAt: Date; changedBy: string; changeNote: string | null; snapshot: unknown }) => (
            <TableRow key={v.id}>
              <TableCell className="font-medium">v{v.versionNumber}</TableCell>
              <TableCell className="text-neutral-500 dark:text-neutral-400">
                {formatAppTimestamp(v.changedAt)}
              </TableCell>
              <TableCell className="text-neutral-500 dark:text-neutral-400">{v.changedBy}</TableCell>
              <TableCell className="text-neutral-500 dark:text-neutral-400">{v.changeNote || '—'}</TableCell>
              <TableCell align="right">
                <span className="flex justify-end gap-2">
                  <ViewSnapshotButton snapshot={v.snapshot} versionNumber={v.versionNumber} />
                  <RestoreButton offerId={offerId} versionId={v.id} versionNumber={v.versionNumber} />
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

