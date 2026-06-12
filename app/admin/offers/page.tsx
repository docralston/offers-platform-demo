import { getOffers, getArchivedOffers } from '@/app/actions/offers';
import { getSettings } from '@/app/actions/settings';
import { Button, ColumnPicker, FormGroup, Input, Select } from '@/components/ui';
import { STORE_CODES } from '@/lib/config/stores';
import { getStoreDisplayId } from '@/lib/config/store-display';
import { OfferStatus, VehicleCondition, OfferTypeEnum } from '@prisma/client';
import Link from 'next/link';
import { OffersPageClient } from './OffersPageClient';
import { dedupeCertifiedFinanceCount } from '@/lib/domain/dashboard/dedupe';

const OFFERS_COLUMNS = [
  { id: 'status', label: 'Status' },
  { id: 'store', label: 'Store' },
  { id: 'condition', label: 'Condition' },
  { id: 'year', label: 'Year' },
  { id: 'make', label: 'Make' },
  { id: 'model', label: 'Model' },
  { id: 'modelCode', label: 'Model code' },
  { id: 'trim', label: 'Trim' },
  { id: 'offerType', label: 'Offer type' },
  { id: 'offerDetails', label: 'Offer details' },
  { id: 'rebateTotal', label: 'Rebate' },
  { id: 'endDate', label: 'End date' },
  { id: 'updated', label: 'Updated' },
  { id: 'actions', label: 'Actions' },
];

const OFFERS_DEFAULT_VISIBLE = OFFERS_COLUMNS.map((c) => c.id).filter((id) => id !== 'store');

interface OffersPageProps {
  searchParams: Promise<{
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
    hasIssues?: string;
  }>;
}

export default async function OffersPage({ searchParams }: OffersPageProps) {
  const p = await searchParams;
  const [offers, archivedOffersResult, settings] = await Promise.all([
    getOffers({
      storeCode: p.storeCode || undefined,
      status: (p.status as OfferStatus) || undefined,
      condition: (p.condition as VehicleCondition) || undefined,
      offerType: (p.offerType as OfferTypeEnum) || undefined,
      search: p.search || undefined,
      dateFrom: p.dateFrom ? new Date(p.dateFrom) : undefined,
      dateTo: p.dateTo ? new Date(p.dateTo) : undefined,
      sortBy: p.sort || undefined,
      sortOrder: p.order || undefined,
      hasIssues: p.hasIssues === '1',
    }),
    getArchivedOffers({ sortBy: p.sort || undefined, sortOrder: p.order || undefined }).catch(() => []),
    getSettings(),
  ]);
  const archivedOffers = Array.isArray(archivedOffersResult) ? archivedOffersResult : [];
  const currentActiveOffers = offers.filter((o) => o.status !== OfferStatus.INACTIVE);
  const currentInactiveOffers = offers.filter((o) => o.status === OfferStatus.INACTIVE);

  const visibleIds = p.cols?.split(',').filter(Boolean) || OFFERS_DEFAULT_VISIBLE;

  // Convert Prisma Decimal to number for client (Next.js can't pass Decimal to Client Components)
  const decimalToNumber = (v: unknown): number | null =>
    v == null ? null : Number(v);

  // Serialize Date objects and Decimal fields for client component
  const serializeOffer = (o: (typeof offers)[number]) => ({
    ...o,
    endDate: o.endDate.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    startDate: o.startDate?.toISOString(),
    createdAt: o.createdAt?.toISOString(),
    aprRate: decimalToNumber(o.aprRate),
    rebateTotal: decimalToNumber(o.rebateTotal),
    customerCash: decimalToNumber(o.customerCash),
    leaseCash: decimalToNumber(o.leaseCash),
    aprCash: decimalToNumber(o.aprCash),
    bonusCash: decimalToNumber(o.bonusCash),
    validationIssues: o.validationIssues, // Already JSON, pass through
  });

  const serializedOffers = currentActiveOffers.map(serializeOffer);
  const serializedInactiveOffers = currentInactiveOffers.map(serializeOffer);

  const serializedArchivedOffers = archivedOffers.map((o) => ({
    ...o,
    endDate: o.endDate.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    startDate: o.startDate?.toISOString(),
    createdAt: o.createdAt?.toISOString(),
    aprRate: decimalToNumber(o.aprRate),
    rebateTotal: decimalToNumber(o.rebateTotal),
    customerCash: decimalToNumber(o.customerCash),
    leaseCash: decimalToNumber(o.leaseCash),
    aprCash: decimalToNumber(o.aprCash),
    bonusCash: decimalToNumber(o.bonusCash),
  }));

  // Adjust "active offers" count to dedupe certified finance offers with the same
  // APR/term (e.g. 2020–2026 3 Series at the same rate/term).
  const { duplicated: duplicatedCf } = dedupeCertifiedFinanceCount(
    currentActiveOffers.filter(
      (o) =>
        o.condition === VehicleCondition.CERTIFIED &&
        o.offerType === OfferTypeEnum.Finance,
    ),
  );
  const activeCountRaw = currentActiveOffers.length;
  const activeCountAdjusted = activeCountRaw - duplicatedCf;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-4 dark:border-neutral-700">
        <div>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            Offers
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Create, manage, and stage marketing offers
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" asChild>
            <Link href="/admin/offers/import">Import</Link>
          </Button>
          <Button asChild>
            <Link href="/admin/offers/new">New offer</Link>
          </Button>
        </div>
      </header>

      <FiltersForm
        storeCode={p.storeCode}
        status={p.status}
        condition={p.condition}
        offerType={p.offerType}
        search={p.search}
        dateFrom={p.dateFrom}
        dateTo={p.dateTo}
        cols={p.cols}
        totalCount={activeCountAdjusted}
        archivedCount={archivedOffers.length}
      />

      <section aria-label="Offers table and tools">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="mr-auto flex flex-wrap items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
            <span className="font-medium">
              {activeCountAdjusted} active offer{activeCountAdjusted === 1 ? '' : 's'}
            </span>
            {serializedArchivedOffers.length > 0 && (
              <span className="ml-2">
                ({serializedArchivedOffers.length} archived offer
                {serializedArchivedOffers.length === 1 ? '' : 's'} below)
              </span>
            )}
            {(p.storeCode ||
              p.status ||
              p.condition ||
              p.offerType ||
              p.search ||
              p.dateFrom ||
              p.dateTo) && (
              <Link
                href="/admin/offers"
                className="rounded border border-transparent px-2 py-1 text-[11px] font-medium text-accent-700 hover:border-accent-200 hover:bg-accent-50 dark:text-accent-300 dark:hover:border-accent-700/60 dark:hover:bg-accent-900/30"
              >
                Clear filters
              </Link>
            )}
          </div>
          <a
            href="/api/export/offers"
            target="_blank"
            rel="noreferrer"
            title="Download CSV"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
            aria-label="Download CSV"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </a>
          <ColumnPicker
            availableColumns={OFFERS_COLUMNS.map((c) => ({ id: c.id, label: c.label }))}
            defaultVisibleIds={OFFERS_DEFAULT_VISIBLE}
          />
        </div>
        <OffersPageClient
          offers={serializedOffers as any}
          inactiveOffers={serializedInactiveOffers as any}
          archivedOffers={serializedArchivedOffers as any}
          visibleIds={visibleIds}
          searchParams={p}
          allowBulkDelete={settings.allowBulkDelete}
        />
      </section>
    </div>
  );
}

function FiltersForm({
  storeCode,
  status,
  condition,
  offerType,
  search,
  dateFrom,
  dateTo,
  cols,
  totalCount,
  archivedCount,
}: {
  storeCode?: string;
  status?: string;
  condition?: string;
  offerType?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  cols?: string;
  totalCount?: number;
  archivedCount?: number;
}) {
  return (
    <form
      method="get"
      className="rounded-md border border-neutral-200 bg-surface-amber dark:border-neutral-700 dark:bg-surface-amber-dark px-3 py-3 sm:px-4"
    >
      {cols ? <input type="hidden" name="cols" value={cols} /> : null}
      <div className="grid grid-cols-2 gap-3 lg:flex lg:flex-row lg:flex-wrap lg:items-end lg:gap-4">
        <FormGroup label="Store" htmlFor="storeCode" className="min-w-0">
          <Select id="storeCode" name="storeCode" defaultValue={storeCode ?? ''} className="w-full min-w-[6rem]">
            <option value="">All</option>
            {STORE_CODES.map((c) => (
              <option key={c} value={c}>{getStoreDisplayId(c)}</option>
            ))}
          </Select>
        </FormGroup>
        <FormGroup label="Status" htmlFor="status" className="min-w-0">
          <Select id="status" name="status" defaultValue={status ?? ''} className="w-full min-w-[6rem]">
            <option value="">All</option>
            <option value={OfferStatus.LIVE}>Live</option>
            <option value={OfferStatus.INACTIVE}>Inactive</option>
          </Select>
        </FormGroup>
        <FormGroup label="Condition" htmlFor="condition" className="min-w-0">
          <Select id="condition" name="condition" defaultValue={condition ?? ''} className="w-full min-w-[6rem]">
            <option value="">All</option>
            <option value={VehicleCondition.NEW}>New</option>
            <option value={VehicleCondition.CERTIFIED}>Certified</option>
            <option value={VehicleCondition.USED}>Used</option>
          </Select>
        </FormGroup>
        <FormGroup label="Offer type" htmlFor="offerType" className="min-w-0">
          <Select id="offerType" name="offerType" defaultValue={offerType ?? ''} className="w-full min-w-[6rem]">
            <option value="">All</option>
            <option value={OfferTypeEnum.Lease}>Lease</option>
            <option value={OfferTypeEnum.Finance}>Finance</option>
            <option value={OfferTypeEnum.Cash}>Cash</option>
          </Select>
        </FormGroup>
        <FormGroup
          label={
            <span className="flex w-full items-baseline justify-between gap-2">
              <span>Search</span>
              <span className="font-normal text-neutral-500 dark:text-neutral-400 text-xs hidden sm:inline">
                Make, model, trim
              </span>
            </span>
          }
          htmlFor="search"
          className="min-w-0"
        >
          <Input
            id="search"
            name="search"
            type="text"
            placeholder="e.g. Camry"
            defaultValue={search}
            className="w-full min-w-[7rem]"
          />
        </FormGroup>
        <FormGroup label="Date from" htmlFor="dateFrom" className="min-w-0">
          <Input
            id="dateFrom"
            name="dateFrom"
            type="date"
            defaultValue={dateFrom}
            className="w-full min-w-[7rem]"
          />
        </FormGroup>
        <FormGroup label="Date to" htmlFor="dateTo" className="min-w-0">
          <Input
            id="dateTo"
            name="dateTo"
            type="date"
            defaultValue={dateTo}
            className="w-full min-w-[7rem]"
          />
        </FormGroup>
        <div className="flex items-end lg:ml-auto">
          <Button type="submit" variant="secondary" size="sm" className="w-full lg:w-auto">
            Apply filters
          </Button>
        </div>
      </div>
    </form>
  );
}
