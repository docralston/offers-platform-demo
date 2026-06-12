'use client';

import { bulkDeleteOffers, bulkUpdateOfferStatus } from '@/app/actions/offers';
import { Button, ConfirmModal } from '@/components/ui';
import { useToast } from '@/components/ui';
import { OfferStatus } from '@/lib/domain/offer-status';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface BulkActionsProps {
  selectedIds: string[];
  onClearSelection: () => void;
  allowBulkDelete?: boolean;
}

export function BulkActions({ selectedIds, onClearSelection, allowBulkDelete = false }: BulkActionsProps) {
  const router = useRouter();
  const { add: showToast } = useToast();
  const [loading, setLoading] = useState<'live' | 'inactive' | 'delete' | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  async function handleBulkUpdate(status: OfferStatus) {
    if (selectedIds.length === 0) return;

    setLoading(status === OfferStatus.LIVE ? 'live' : 'inactive');
    try {
      const result = await bulkUpdateOfferStatus(selectedIds, status);
      if (result.success) {
        onClearSelection();
        router.refresh();
      } else {
        showToast({
          message: result.errors?.[0]?.message ?? 'Failed to update offer status.',
          tone: 'error',
        });
      }
    } catch (error) {
      console.error('Error updating offers:', error);
      showToast({ message: 'Failed to update offer status.', tone: 'error' });
    } finally {
      setLoading(null);
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.length === 0) return;

    setLoading('delete');
    try {
      const result = await bulkDeleteOffers(selectedIds);
      if (result.success) {
        onClearSelection();
        router.refresh();
      } else {
        showToast({
          message: result.errors?.[0]?.message ?? 'Failed to delete offers.',
          tone: 'error',
        });
      }
    } catch (error) {
      console.error('Error deleting offers:', error);
      showToast({ message: 'Failed to delete offers.', tone: 'error' });
    } finally {
      setLoading(null);
    }
  }

  if (selectedIds.length === 0) {
    return null;
  }

  return (
    <>
      <div className="mb-4 flex items-center gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800">
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {selectedIds.length} offer{selectedIds.length !== 1 ? 's' : ''} selected
        </span>
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleBulkUpdate(OfferStatus.LIVE)}
            disabled={loading !== null}
          >
            {loading === 'live' ? 'Updating…' : 'Set to LIVE'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleBulkUpdate(OfferStatus.INACTIVE)}
            disabled={loading !== null}
          >
            {loading === 'inactive' ? 'Updating…' : 'Set to INACTIVE'}
          </Button>
          {allowBulkDelete && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteModalOpen(true)}
              disabled={loading !== null}
            >
              {loading === 'delete' ? 'Deleting…' : 'DELETE'}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={onClearSelection}
            disabled={loading !== null}
          >
            Clear
          </Button>
        </div>
      </div>

      <ConfirmModal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleBulkDelete}
        title="Delete offers"
        body={
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Delete {selectedIds.length} offer{selectedIds.length !== 1 ? 's' : ''}? This cannot be undone.
          </p>
        }
        confirmLabel="Delete"
        destructive
      />
    </>
  );
}
