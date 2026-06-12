'use client';

import { useRouter } from 'next/navigation';
import { restoreOfferVersion } from '@/app/actions/offers';
import { useState } from 'react';

export function RestoreButton({
  offerId,
  versionId,
  versionNumber,
}: {
  offerId: string;
  versionId: string;
  versionNumber: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRestore() {
    if (!confirm(`Are you sure you want to restore version ${versionNumber}? This will overwrite the current offer.`)) {
      return;
    }

    setLoading(true);
    const result = await restoreOfferVersion(offerId, versionId);
    setLoading(false);

    if (result.success) {
      router.push(`/admin/offers/${offerId}`);
      router.refresh();
    } else {
      alert('Failed to restore version');
    }
  }

  return (
    <button
      onClick={handleRestore}
      disabled={loading}
      className="text-indigo-600 hover:text-indigo-800 disabled:opacity-50 dark:text-indigo-400 dark:hover:text-indigo-300"
    >
      {loading ? 'Restoring...' : 'Restore'}
    </button>
  );
}
