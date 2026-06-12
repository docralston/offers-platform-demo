'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { clearArchivedOffers } from '@/app/actions/offers';
import { getOfferDetailsSummary } from '@/lib/domain/offer-type';
import { applyCheckboxSelection } from '@/lib/utils/checkbox-selection';
import { Button, ConfirmModal } from '@/components/ui';
import { BulkActions } from './BulkActions';
import { OffersTable } from './OffersTable';
import type { SerializedOffer } from './types';

interface OffersPageClientProps {
  offers: SerializedOffer[];
  inactiveOffers: SerializedOffer[];
  archivedOffers: SerializedOffer[];
  visibleIds: string[];
  searchParams: {
    storeCode?: string;
    status?: string;
    condition?: string;
    offerType?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    sort?: string;
    order?: 'asc' | 'desc';
    cols?: string;
  };
  allowBulkDelete?: boolean;
}

/** Three-state sort cycle: default -> asc -> desc -> default. Returns URL for next state. */
function buildSortUrl(
  currentSort: string | undefined,
  currentOrder: 'asc' | 'desc' | undefined,
  field: string,
  baseParams: Record<string, string>
): string {
  const u = new URLSearchParams(baseParams);
  if (!currentSort || currentSort !== field) {
    u.set('sort', field);
    u.set('order', 'asc');
    return `/admin/offers?${u.toString()}`;
  }
  if (currentOrder === 'asc') {
    u.set('sort', field);
    u.set('order', 'desc');
    return `/admin/offers?${u.toString()}`;
  }
  // desc -> default: remove sort and order
  return `/admin/offers?${u.toString()}`;
}

export function OffersPageClient({
  offers,
  inactiveOffers,
  archivedOffers,
  visibleIds,
  searchParams,
  allowBulkDelete = false,
}: OffersPageClientProps) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedInactiveIds, setSelectedInactiveIds] = useState<string[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [lastInactiveSelectedIndex, setLastInactiveSelectedIndex] = useState<number | null>(null);
  const [clearArchivedModalOpen, setClearArchivedModalOpen] = useState(false);
  const [clearArchivedLoading, setClearArchivedLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const baseParams: Record<string, string> = {};
  if (searchParams.storeCode) baseParams.storeCode = searchParams.storeCode;
  if (searchParams.status) baseParams.status = searchParams.status;
  if (searchParams.condition) baseParams.condition = searchParams.condition;
  if (searchParams.offerType) baseParams.offerType = searchParams.offerType;
  if (searchParams.search) baseParams.search = searchParams.search;
  if (searchParams.dateFrom) baseParams.dateFrom = searchParams.dateFrom;
  if (searchParams.dateTo) baseParams.dateTo = searchParams.dateTo;
  if (searchParams.cols) baseParams.cols = searchParams.cols;

  const sortLink = (field: string) =>
    buildSortUrl(searchParams.sort, searchParams.order, field, baseParams);

  // Client-side sort by Offer details when that column is selected (no DB column)
  const sortedOffers = useMemo(() => {
    if (searchParams.sort !== 'offerDetails' || offers.length === 0) return offers;
    const order = searchParams.order === 'asc' ? 1 : -1;
    return [...offers].sort((a, b) => {
      const sa = getOfferDetailsSummary(a as any);
      const sb = getOfferDetailsSummary(b as any);
      return order * sa.localeCompare(sb, undefined, { sensitivity: 'base' });
    });
  }, [offers, searchParams.sort, searchParams.order]);

  const sortedArchivedOffers = useMemo(() => {
    if (searchParams.sort !== 'offerDetails' || archivedOffers.length === 0) return archivedOffers;
    const order = searchParams.order === 'asc' ? 1 : -1;
    return [...archivedOffers].sort((a, b) => {
      const sa = getOfferDetailsSummary(a as any);
      const sb = getOfferDetailsSummary(b as any);
      return order * sa.localeCompare(sb, undefined, { sensitivity: 'base' });
    });
  }, [archivedOffers, searchParams.sort, searchParams.order]);

  const sortedInactiveOffers = useMemo(() => {
    if (searchParams.sort !== 'offerDetails' || inactiveOffers.length === 0) return inactiveOffers;
    const order = searchParams.order === 'asc' ? 1 : -1;
    return [...inactiveOffers].sort((a, b) => {
      const sa = getOfferDetailsSummary(a as any);
      const sb = getOfferDetailsSummary(b as any);
      return order * sa.localeCompare(sb, undefined, { sensitivity: 'base' });
    });
  }, [inactiveOffers, searchParams.sort, searchParams.order]);

  const handleToggleSelect = (
    id: string,
    index: number,
    event: React.MouseEvent<HTMLInputElement>,
    displayedRowIds: string[],
  ) => {
    setSelectedIds((prev) => {
      const result = applyCheckboxSelection({
        selectedIds: new Set(prev),
        displayedRowIds,
        clickedId: id,
        clickedIndex: index,
        lastSelectedIndex,
        shiftKey: event.shiftKey,
      });
      setLastSelectedIndex(result.nextLastSelectedIndex);
      return Array.from(result.nextSelectedIds);
    });
  };

  const handleSelectAll = (displayedRowIds: string[]) => {
    setSelectedIds(Array.from(new Set(displayedRowIds)));
  };

  const handleDeselectAll = () => {
    setSelectedIds([]);
  };

  const handleToggleInactiveSelect = (
    id: string,
    index: number,
    event: React.MouseEvent<HTMLInputElement>,
    displayedRowIds: string[],
  ) => {
    setSelectedInactiveIds((prev) => {
      const result = applyCheckboxSelection({
        selectedIds: new Set(prev),
        displayedRowIds,
        clickedId: id,
        clickedIndex: index,
        lastSelectedIndex: lastInactiveSelectedIndex,
        shiftKey: event.shiftKey,
      });
      setLastInactiveSelectedIndex(result.nextLastSelectedIndex);
      return Array.from(result.nextSelectedIds);
    });
  };

  const handleSelectAllInactive = (displayedRowIds: string[]) => {
    setSelectedInactiveIds(Array.from(new Set(displayedRowIds)));
  };

  const handleDeselectAllInactive = () => {
    setSelectedInactiveIds([]);
  };

  async function handleClearArchived() {
    setClearArchivedLoading(true);
    try {
      const result = await clearArchivedOffers();
      if (result.success) {
        setClearArchivedModalOpen(false);
        router.refresh();
      }
    } finally {
      setClearArchivedLoading(false);
    }
  }

  return (
    <>
      <BulkActions
        selectedIds={selectedIds}
        onClearSelection={handleDeselectAll}
        allowBulkDelete={allowBulkDelete}
      />
      <OffersTable
        offers={sortedOffers}
        visibleIds={visibleIds}
        sortLink={sortLink}
        sortBy={searchParams.sort}
        sortOrder={searchParams.order}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onSelectAll={handleSelectAll}
        onDeselectAll={handleDeselectAll}
      />
      {inactiveOffers.length > 0 && (
        <section className="mt-12">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              Inactive Offers
            </h2>
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Current offers that are explicitly set to inactive
            </p>
          </div>
          <BulkActions
            selectedIds={selectedInactiveIds}
            onClearSelection={handleDeselectAllInactive}
            allowBulkDelete={allowBulkDelete}
          />
          <OffersTable
            offers={sortedInactiveOffers}
            visibleIds={visibleIds}
            sortLink={sortLink}
            sortBy={searchParams.sort}
            sortOrder={searchParams.order}
            selectedIds={selectedInactiveIds}
            onToggleSelect={handleToggleInactiveSelect}
            onSelectAll={handleSelectAllInactive}
            onDeselectAll={handleDeselectAllInactive}
          />
        </section>
      )}
      {archivedOffers.length > 0 && (
        <section className="mt-12">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                Archived Offers
              </h2>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                Offers that have exceeded their end date
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowArchived((prev) => !prev)}
                disabled={clearArchivedLoading}
              >
                {showArchived ? 'Hide' : `Show (${archivedOffers.length})`}
              </Button>
              {showArchived && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setClearArchivedModalOpen(true)}
                  disabled={clearArchivedLoading}
                >
                  {clearArchivedLoading ? 'Clearing…' : 'Clear'}
                </Button>
              )}
            </div>
          </div>
          <ConfirmModal
            open={clearArchivedModalOpen}
            onClose={() => setClearArchivedModalOpen(false)}
            onConfirm={handleClearArchived}
            title="Clear archived offers"
            body={
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Permanently delete all {archivedOffers.length} archived offer{archivedOffers.length !== 1 ? 's' : ''}? This cannot be undone.
              </p>
            }
            confirmLabel="Clear"
            destructive
          />
          {showArchived && (
            <OffersTable
              offers={sortedArchivedOffers}
              visibleIds={visibleIds}
              sortLink={sortLink}
              sortBy={searchParams.sort}
              sortOrder={searchParams.order}
              selectedIds={[]}
              onToggleSelect={() => {}}
              onSelectAll={() => {}}
              onDeselectAll={() => {}}
              showCheckboxes={false}
            />
          )}
        </section>
      )}
    </>
  );
}
