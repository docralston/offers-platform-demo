import { getCertifiedQualifyingModelYears, getOffer } from '@/app/actions/offers';
import { Breadcrumbs, Button, StatusBadge } from '@/components/ui';
import { getDisclaimerForFinanceOffer } from '@/lib/domain/apr-disclaimer';
import { formatAprPercent } from '@/lib/domain/apr-format';
import { parseFinanceRates, sortFinanceRatesForDisplay, uniqueFinanceRates } from '@/lib/domain/finance-rates';
import { formatConditionLabel, formatConditionPrefix, formatCurrency, formatLeaseMiles, formatAprSummary, getDisplayOfferType, modelForDisplay } from '@/lib/domain/offer-type';
import { buildInventoryUrl, buildImageUrl, getInventoryUrlForStore } from '@/lib/domain/offer-assets';
import { getStoreDisplayId } from '@/lib/config/store-display';
import { inferBmwSeries } from '@/lib/domain/bmw-series';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ToggleStatusButton } from './ToggleStatusButton';
import { EditableAdditionalNotes } from './EditableAdditionalNotes';

function isCertifiedFinance(offer: { condition: string; offerType?: string | null }): boolean {
  return offer.condition === 'CERTIFIED' && getDisplayOfferType(offer) === 'Finance';
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function OfferDetailPage({ params }: PageProps) {
  const { id } = await params;
  const offer = await getOffer(id);
  if (!offer) notFound();

  const d = (date: Date | string) =>
    typeof date === 'string' 
      ? new Date(date).toLocaleDateString('en-US', { timeZone: 'America/New_York' })
      : date.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
  const n = (v: number | null) => (v != null ? v.toLocaleString() : '—');
  const s = (v: string | null) => (v && v.trim() ? v : '—');

  const certifiedFinance = isCertifiedFinance(offer);
  const qualifyingModelYears = certifiedFinance
    ? await getCertifiedQualifyingModelYears({
        storeCode: offer.storeCode,
        storeCodes: (offer as { storeCodes?: string[] | null }).storeCodes ?? null,
        make: offer.make,
        model: offer.model,
      })
    : '';
  const isBmwOffer =
    offer.storeCode === 'BMW' ||
    ((offer as { storeCodes?: string[] | null }).storeCodes?.includes('BMW') ?? false);
  const seriesLabel = isBmwOffer
    ? s(
        ((offer as { series?: string | null }).series ??
          inferBmwSeries(offer.model) ??
          null) as string | null
      )
    : '—';
  const breadcrumbLabel = certifiedFinance
    ? `${formatConditionPrefix(offer.condition)}${[offer.make, modelForDisplay(offer.make, offer.model)].filter(Boolean).join(' ')}`.trim()
    : `${offer.year ?? ''} ${offer.make ?? ''} ${modelForDisplay(offer.make, offer.model)}`.replace(/\s+/g, ' ').trim();
  const titleParts = certifiedFinance
    ? [offer.make, modelForDisplay(offer.make, offer.model)].filter(Boolean)
    : [offer.year, offer.make, modelForDisplay(offer.make, offer.model)].filter(Boolean);

  return (
    <div className="space-y-5">
      <header className="border-b border-neutral-200 pb-3 dark:border-neutral-700">
        <Breadcrumbs
          items={[
            { label: 'Offers', href: '/admin/offers' },
            { label: breadcrumbLabel || 'Offer' },
          ]}
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            {formatConditionPrefix(offer.condition)}{titleParts.join(' ')}
            {offer.trim ? ` ${offer.trim}` : ''}
          </h1>
          <StatusBadge status={offer.status} />
          <div className="flex flex-wrap gap-2">
            <ToggleStatusButton id={offer.id} status={offer.status} />
            <Button variant="secondary" size="sm" asChild>
              <Link href={`/admin/offers/${offer.id}/edit`}>Edit</Link>
            </Button>
            <Button variant="tertiary" size="sm" asChild>
              <Link href={`/admin/offers/${offer.id}/history`}>History</Link>
            </Button>
          </div>
        </div>
      </header>

      {offer.validationIssues && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-medium">
            This offer has validation issues.
          </p>
          <p className="mt-1">Fix issues on the edit page and save.</p>
        </div>
      )}

      {(offer.offerType === 'Other' || getDisplayOfferType(offer) === 'Other') && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          This offer is classified as &quot;Other&quot; (no lease or finance terms were extracted). Lease and Finance sections may be empty.
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Section title="Vehicle">
          <DefList
            items={[
              ['Offer type', getDisplayOfferType(offer)],
              ['Rebate total', (offer as { rebateTotal?: unknown }).rebateTotal != null ? formatCurrency(Number((offer as { rebateTotal?: unknown }).rebateTotal)) : '—'],
              ['Store', (offer as { storeCodes?: string[] }).storeCodes?.length
                ? (offer as { storeCodes: string[] }).storeCodes
                    .map((sc) => getStoreDisplayId(sc))
                    .join(', ')
                : getStoreDisplayId(offer.storeCode)],
              ['Condition', formatConditionLabel(offer.condition)],
              ['Make', s(offer.make)],
              ['Model', offer.model],
              ['Series', seriesLabel],
              ['Year', certifiedFinance ? '—' : (offer.year != null ? String(offer.year) : '—')],
              ...(certifiedFinance
                ? [['Qualifying model years', qualifyingModelYears || '—']] as [string, string][]
                : []),
              ['Trim', s(offer.trim)],
              ['Model code', offer.modelCode != null ? String(offer.modelCode) : '—'],
            ]}
          />
        </Section>

        <div className="space-y-4">
          <Section title="Dates">
            <DefList
              items={[
                ['Start (publish)', d(offer.startDate)],
                ['End (unpublish)', d(offer.endDate)],
              ]}
            />
          </Section>
          <Section title="Disclaimer">
            <p className="text-sm text-neutral-900 dark:text-neutral-100">
              {getDisclaimerForFinanceOffer(offer) ?? s(offer.disclaimer)}
            </p>
          </Section>
          <Section title="Additional notes">
            <EditableAdditionalNotes offerId={offer.id} initialValue={offer.additionalNotes} />
          </Section>
        </div>

        <Section title="Lease">
          <DefList
            items={[
              ['Payment', n(offer.leasePayment)],
              ['Term (mo.)', n(offer.leaseTerm)],
              ['Miles', offer.leaseMiles != null ? formatLeaseMiles(offer.leaseMiles) : '—'],
              ['Due at signing', n(offer.dueAtSigning)],
              ['Cap cost reduction', n(offer.capCostReduction)],
              ['Gross cap cost', n(offer.grossCapCost)],
              ['Net cap cost', n(offer.netCapCost)],
              ['Security deposit', n(offer.securityDeposit)],
              [
                'Per excess mile',
                offer.perExcessMile != null ? `$${Number(offer.perExcessMile).toFixed(2)}` : '—',
              ],
              ['Acquisition fee', n(offer.acquisitionFee)],
              ['Down payment', n(offer.downPayment)],
            ]}
          />
        </Section>

        <Section title="Buy / Finance">
          <BuyFinanceSection offer={offer} n={n} s={s} />
        </Section>

        <AssetsSection offer={offer} />
      </div>
    </div>
  );
}

function AssetsSection({
  offer,
}: {
  offer: {
    storeCode: string;
    storeCodes?: string[] | null;
    make?: string | null;
    model: string;
    year?: number | null;
    inventoryUrl?: string | null;
    imageUrl?: string | null;
  };
}) {
  const computedImageUrl = buildImageUrl(offer.make, offer.model, offer.year);
  const imageUrl = offer.imageUrl || computedImageUrl;

  const renderUrl = (url: string | null, stored: string | null) => {
    if (!url) return <span className="text-neutral-400 dark:text-neutral-500">—</span>;
    return (
      <span>
        <a href={url} target="_blank" rel="noreferrer" className="break-all text-accent-600 hover:underline dark:text-accent-400">
          {url}
        </a>
        {!stored && (
          <span className="ml-1 text-xs text-neutral-400 dark:text-neutral-500">(computed)</span>
        )}
      </span>
    );
  };

  const lexStores = ['LEXDT', 'LEXWG'] as const;
  const storeCodes = offer.storeCodes?.length ? offer.storeCodes : [offer.storeCode];
  const lexStoreCodes = storeCodes.filter((sc) => lexStores.includes(sc as (typeof lexStores)[number]));

  const inventoryItems: [string, React.ReactNode][] = [];
  if (lexStoreCodes.length > 1) {
    for (const sc of lexStoreCodes) {
      const url = getInventoryUrlForStore(offer, sc);
      const label = sc === 'LEXDT' ? 'Inventory URL (Demotown)' : 'Inventory URL (Exampleville)';
      inventoryItems.push([label, renderUrl(url, null)]);
    }
  } else {
    const url = getInventoryUrlForStore(offer, offer.storeCode) || buildInventoryUrl(offer.storeCode, offer.model);
    inventoryItems.push(['Inventory URL', renderUrl(url, offer.inventoryUrl ?? null)]);
  }

  return (
    <Section title="Assets" className="col-span-2 xl:col-span-1">
      {imageUrl && (
        <div className="mb-3">
          <img
            src={imageUrl}
            alt={[offer.year, offer.make, modelForDisplay(offer.make, offer.model)].filter(Boolean).join(' ')}
            className="h-auto w-full rounded object-contain"
            style={{ maxHeight: '120px' }}
          />
        </div>
      )}
      <DefList
        items={[
          ...inventoryItems,
          ['Image URL', renderUrl(imageUrl, offer.imageUrl ?? null)],
        ]}
      />
    </Section>
  );
}

function BuyFinanceSection({
  offer,
  n,
  s,
}: {
  offer: { offerType?: string | null; aprRate?: unknown; aprTermMonths?: number | null; msrp?: number | null; discount?: number | null; buyFor?: number | null; stockNumber?: string | null; financeRates?: unknown };
  n: (v: number | null) => string;
  s: (v: string | null) => string;
}) {
  const financeRates = parseFinanceRates(offer.financeRates);
  const sortedRates = sortFinanceRatesForDisplay(uniqueFinanceRates(financeRates));
  const hasFinanceRatesList = sortedRates.length > 0;
  const singleApr =
    offer.aprRate != null && !Number.isNaN(Number(offer.aprRate))
      ? formatAprPercent(Number(offer.aprRate)).replace(/%$/, '')
      : '—';
  const singleTerm = offer.aprTermMonths != null ? String(offer.aprTermMonths) : '—';

  const baseItems: [string, React.ReactNode][] = [
    ['MSRP', n(offer.msrp ?? null)],
    ['Discount', n(offer.discount ?? null)],
    ['Buy for', n(offer.buyFor ?? null)],
    ['Stock #', s(offer.stockNumber ?? null)],
  ];

  if (offer.offerType === 'Finance') {
    if (hasFinanceRatesList) {
      return (
        <div className="space-y-2">
          <DefList items={[['Best rate', formatAprSummary(Number(offer.aprRate), offer.aprTermMonths ?? undefined)], ...baseItems]} />
          <div>
            <p className="mb-1 text-xs font-medium text-neutral-500 dark:text-neutral-400">All finance rates</p>
            <ul className="list-inside list-disc space-y-0.5 text-sm text-neutral-900 dark:text-neutral-100">
              {sortedRates.map((r, i) => (
                <li key={`${r.aprRate}-${r.aprTermMonths}-${i}`}>
                  {formatAprSummary(r.aprRate, r.aprTermMonths)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      );
    }
    baseItems.unshift(['APR term (mo.)', singleTerm]);
    baseItems.unshift(['APR rate (%)', singleApr]);
  }

  return <DefList items={baseItems} />;
}

function Section({
  title,
  children,
  className = '',
}: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={className}>
      <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
        {title}
      </h2>
      <div className="rounded-md border border-neutral-200 bg-surface-slate px-3 py-2 dark:border-neutral-700 dark:bg-surface-slate-dark">
        {children}
      </div>
    </section>
  );
}

function DefList({
  items,
}: {
  items: [string, React.ReactNode][];
}) {
  return (
    <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-[auto_1fr]">
      {items.map(([label, value]) => (
        <span key={label} className="contents">
          <dt className="text-xs text-neutral-500 dark:text-neutral-400">{label}</dt>
          <dd className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{value}</dd>
        </span>
      ))}
    </dl>
  );
}
