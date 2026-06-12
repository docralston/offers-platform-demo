'use client';

import { use, useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { updateOffer, getOffer } from '@/app/actions/offers';
import { Alert, Breadcrumbs, Button } from '@/components/ui';
import type { VehicleFuelType } from '@prisma/client';
import { VehicleCondition } from '@/lib/domain/offer-status';
import { formatVehicleTitle, modelForDisplay } from '@/lib/domain/offer-type';
import { parseFinanceRates } from '@/lib/domain/finance-rates';
import { buildOfferInputPreviewFromForm, parseOfferFormData, type FinanceRateRow } from '@/lib/domain/offer-form';
import { OfferForm } from '../../OfferForm';
import Link from 'next/link';
import { ToggleStatusButton } from '../ToggleStatusButton';

interface EditOfferPageProps {
  params: Promise<{ id: string }>;
}

export default function EditOfferPage({ params }: EditOfferPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Array<{ field: string; message: string }>>([]);
  const [offer, setOffer] = useState<Awaited<ReturnType<typeof getOffer>>>(null);

  const [condition, setCondition] = useState<VehicleCondition>(VehicleCondition.NEW);
  const [offerType, setOfferType] = useState<string>('');
  const [financeRatesRows, setFinanceRatesRows] = useState<FinanceRateRow[]>([
    { aprRate: '', aprTermMonths: '', fuelType: '' },
  ]);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    getOffer(id).then((d) => {
      if (d) {
        setOffer(d);
        setCondition((d.condition as VehicleCondition) ?? VehicleCondition.NEW);
        setOfferType((d as { offerType?: string | null }).offerType ?? '');
        const rates = parseFinanceRates((d as { financeRates?: unknown }).financeRates);
        if (rates.length > 0) {
          setFinanceRatesRows(
            rates.map((r) => ({
              aprRate: String(r.aprRate),
              aprTermMonths: String(r.aprTermMonths),
              fuelType: r.fuelType ?? '',
            })),
          );
        } else if ((d as { aprRate?: unknown }).aprRate != null || (d as { aprTermMonths?: number | null }).aprTermMonths != null) {
          setFinanceRatesRows([
            {
              aprRate: String((d as { aprRate?: unknown }).aprRate ?? ''),
              aprTermMonths: String((d as { aprTermMonths?: number | null }).aprTermMonths ?? ''),
              fuelType: '',
            },
          ]);
        }
      }
      setLoading(false);
    });
  }, [id]);

  const buildOfferInput = useCallback(() => {
    const fd = new FormData(formRef.current ?? undefined);
    return buildOfferInputPreviewFromForm(fd, {
      storeCode: offer?.storeCode,
      model: offer?.model,
      modelCode: (offer as { modelCode?: string | null })?.modelCode ?? null,
      fuelType: ((offer as { fuelType?: VehicleFuelType | null })?.fuelType ?? null) as VehicleFuelType | null,
    });
  }, [offer]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setErrors([]);

    const fd = new FormData(e.currentTarget);
    const data = parseOfferFormData(fd, {
      financeRatesRowCount: financeRatesRows.length,
      includeFuelType: true,
    });
    const r = await updateOffer(id, data);
    setSaving(false);

    if (r.success) {
      const updated = await getOffer(id);
      if (updated) {
        setOffer(updated);
        setOfferType((updated as { offerType?: string | null }).offerType ?? '');
      }
      router.refresh();
    } else {
      setErrors(r.errors || []);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
        <div className="h-64 animate-pulse rounded-md border border-neutral-200 dark:border-neutral-700" />
      </div>
    );
  }

  if (!offer) {
    return (
      <Alert tone="error" title="Not found">
        Offer could not be loaded.
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-3 border-b border-neutral-200 pb-4 dark:border-neutral-700">
        <Breadcrumbs
          items={[
            { label: 'Offers', href: '/admin/offers' },
            {
              label:
                condition === VehicleCondition.CERTIFIED && offerType === 'Finance'
                  ? `Certified ${[offer?.make, modelForDisplay(offer?.make ?? null, offer?.model ?? null)].filter(Boolean).join(' ')}`.trim() || 'Offer'
                  : formatVehicleTitle(offer).trim() || 'Offer',
              href: `/admin/offers/${id}`,
            },
            { label: 'Edit' },
          ]}
        />
        <div className="ml-auto flex gap-2">
          <ToggleStatusButton
            id={id}
            status={offer.status}
            onSuccess={() => getOffer(id).then((d) => d && setOffer(d))}
          />
          <Button variant="tertiary" size="sm" asChild>
            <Link href={`/admin/offers/${id}`}>View</Link>
          </Button>
        </div>
      </header>

      {offer.validationIssues && Array.isArray(offer.validationIssues) && offer.validationIssues.length > 0 && (
        <Alert tone="warning" className="mb-6">
          <div className="space-y-2">
            <div className="font-semibold">Validation Issues ({offer.validationIssues.length})</div>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {(offer.validationIssues as Array<{ code: string; field?: string; message: string }>).map((issue, idx) => (
                <li key={idx}>
                  <span className="font-mono text-xs text-neutral-500 dark:text-neutral-400">{issue.code}</span>
                  {issue.field && <span className="text-neutral-500"> ({issue.field})</span>}: {issue.message}
                </li>
              ))}
            </ul>
            <div className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
              Fix the issues above and save to resolve.
            </div>
          </div>
        </Alert>
      )}

      <OfferForm
        formRef={formRef}
        onSubmit={handleSubmit}
        errors={errors}
        mode="edit"
        offer={offer as Record<string, unknown>}
        condition={condition}
        setCondition={setCondition}
        offerType={offerType}
        setOfferType={setOfferType}
        financeRatesRows={financeRatesRows}
        setFinanceRatesRows={setFinanceRatesRows}
        includeFuelType
        buildOfferInput={buildOfferInput}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      />
    </div>
  );
}
