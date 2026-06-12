'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createOffer } from '@/app/actions/offers';
import { Breadcrumbs, Button } from '@/components/ui';
import { VehicleCondition } from '@/lib/domain/offer-status';
import { buildOfferInputPreviewFromForm, parseOfferFormData } from '@/lib/domain/offer-form';
import { OfferForm } from '../OfferForm';
import Link from 'next/link';

export default function NewOfferPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Array<{ field: string; message: string }>>([]);
  const [condition, setCondition] = useState<VehicleCondition>(VehicleCondition.NEW);
  const [offerType, setOfferType] = useState<string>('');
  const [financeRatesRows, setFinanceRatesRows] = useState<Array<{ aprRate: string; aprTermMonths: string }>>([
    { aprRate: '', aprTermMonths: '' },
  ]);
  const formRef = useRef<HTMLFormElement>(null);

  const buildOfferInput = useCallback(
    () => buildOfferInputPreviewFromForm(new FormData(formRef.current ?? undefined)),
    [],
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setErrors([]);

    const fd = new FormData(e.currentTarget);
    const data = parseOfferFormData(fd, { financeRatesRowCount: financeRatesRows.length });
    const r = await createOffer(data);
    setLoading(false);

    if (r.success && r.id) router.push(`/admin/offers/${r.id}`);
    else setErrors(r.errors || []);
  }

  return (
    <div className="space-y-6">
      <header className="border-b border-neutral-200 pb-4 dark:border-neutral-700">
        <Breadcrumbs items={[{ label: 'Offers', href: '/admin/offers' }, { label: 'New offer' }]} />
        <h1 className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">New offer</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Create a new marketing offer. Required fields are marked with *.
        </p>
      </header>

      <OfferForm
        formRef={formRef}
        onSubmit={handleSubmit}
        errors={errors}
        mode="create"
        condition={condition}
        setCondition={setCondition}
        offerType={offerType}
        setOfferType={setOfferType}
        financeRatesRows={financeRatesRows}
        setFinanceRatesRows={setFinanceRatesRows}
        buildOfferInput={buildOfferInput}
        footer={
          <>
            <Button type="button" variant="secondary" asChild>
              <Link href="/admin/offers">Cancel</Link>
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating…' : 'Create offer'}
            </Button>
          </>
        }
      />
    </div>
  );
}
