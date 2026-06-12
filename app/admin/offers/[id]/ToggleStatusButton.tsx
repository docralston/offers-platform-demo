'use client';

import { toggleOfferStatus } from '@/app/actions/offers';
import { Button } from '@/components/ui';
import { OfferStatus } from '@/lib/domain/offer-status';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function ToggleStatusButton({
  id,
  status,
  onSuccess,
}: { id: string; status: OfferStatus; onSuccess?: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handle() {
    setLoading(true);
    try {
      const r = await toggleOfferStatus(id);
      if (r.success) {
        onSuccess?.();
        router.refresh();
      }
    } catch (error) {
      console.error('Error toggling offer status:', error);
    } finally {
      setLoading(false);
    }
  }

  const isLive = status === OfferStatus.LIVE;

  return (
    <Button
      variant={isLive ? 'secondary' : 'primary'}
      size="sm"
      onClick={handle}
      disabled={loading}
    >
      {loading ? 'Updating…' : isLive ? 'Set to INACTIVE' : 'Set to LIVE'}
    </Button>
  );
}
