'use client';

import * as React from 'react';
import { getOffersForSelection } from '@/app/actions/publish';
import type { SelectionFilters } from '@/lib/domain/selection';
import { STORE_CODES, type StoreCode } from '@/lib/config/stores';
import { getStoreDisplayId } from '@/lib/config/store-display';
import { OfferStatus, VehicleCondition } from '@prisma/client';
import {
  Button,
  FormGroup,
  Input,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { formatConditionLabel, formatVehicleTitle, getOfferDetailsSummary, getOfferTypeLabel } from '@/lib/domain/offer-type';
import { formatEasternDate } from '@/lib/utils/dates';
import { applyCheckboxSelection } from '@/lib/utils/checkbox-selection';
import { groupOffersForCards } from '@/lib/domain/card-groups';

export interface SerializedOfferForSelection {
  id: string;
  storeCode: string;
  condition: string;
  year: number | null;
  make: string | null;
  model: string;
  trim: string | null;
  offerType: string | null;
  endDate: string;
  [key: string]: unknown;
}

export interface OfferSelectionSectionProps {
  onSelectionChange: (selectedIds: string[]) => void;
  /** Called when filters are applied; use to get storeCode for generate actions. */
  onFiltersApplied?: (filters: { storeCode: string }) => void;
  /** Optional callback that receives the full selected offer objects. */
  onSelectedOffersChange?: (selectedOffers: SerializedOfferForSelection[]) => void;
  storeCodeRequired?: boolean;
  /** When set, only these store codes are shown in the Store dropdown (e.g. Specials by brand). */
  allowedStoreCodes?: readonly StoreCode[];
  /** When set (e.g. when one store per brand), initial store selection. */
  initialStoreCode?: string;
  /** When true, shows an Offer type filter (Lease / Finance / Cash / All). */
  showOfferTypeFilter?: boolean;
  /** When true, shows a Condition filter (All / New / Certified / Used). */
  showConditionFilter?: boolean;
  /** When true, shows a Year filter. */
  showYearFilter?: boolean;
  /** When true, shows a helper to auto-select groups with both lease and finance offers. */
  showAutoSelectFullCards?: boolean;
  /** Optional controlled selection from parent pages. */
  selectedIdsExternal?: string[];
}

const defaultDateFrom = () => {
  const now = new Date();
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
  const [y, m, d] = f.format(now).split('-');
  return `${y}-${m}-01`;
};

const defaultDateTo = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const last = new Date(y, m + 1, 0);
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(last);
};

export function OfferSelectionSection({
  onSelectionChange,
  onFiltersApplied,
  onSelectedOffersChange,
  storeCodeRequired = true,
  allowedStoreCodes,
  initialStoreCode,
  showOfferTypeFilter = false,
  showConditionFilter = false,
  showYearFilter = false,
  showAutoSelectFullCards = false,
  selectedIdsExternal,
}: OfferSelectionSectionProps) {
  const storeOptions = allowedStoreCodes && allowedStoreCodes.length > 0 ? allowedStoreCodes : STORE_CODES;
  const [filters, setFilters] = React.useState<SelectionFilters>({
    storeCode: initialStoreCode ?? '',
    dateFrom: defaultDateFrom(),
    dateTo: defaultDateTo(),
    year: null,
    search: '',
    status: OfferStatus.LIVE,
  });
  const [offers, setOffers] = React.useState<SerializedOfferForSelection[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = React.useState<number | null>(null);
  const [sortState, setSortState] = React.useState<{
    column: 'store' | 'offerType' | 'vehicle' | 'endDate';
    direction: 'asc' | 'desc';
  } | null>(null);
  const yearOptions = React.useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years: number[] = [];
    for (let year = currentYear + 1; year >= currentYear - 15; year -= 1) {
      years.push(year);
    }
    return years;
  }, []);

  React.useEffect(() => {
    onSelectionChange(Array.from(selectedIds));
  }, [selectedIds, onSelectionChange]);

  React.useEffect(() => {
    if (!selectedIdsExternal) return;
    const nextSet = new Set(selectedIdsExternal);
    setSelectedIds((prev) => {
      const sameSize = nextSet.size === prev.size;
      const sameValues = sameSize && Array.from(nextSet).every((id) => prev.has(id));
      return sameValues ? prev : nextSet;
    });
    setLastSelectedIndex(null);
  }, [selectedIdsExternal]);

  React.useEffect(() => {
    if (!onSelectedOffersChange) return;
    if (selectedIds.size === 0) {
      onSelectedOffersChange([]);
      return;
    }
    const selected = offers.filter((o) => selectedIds.has(o.id));
    onSelectedOffersChange(selected);
  }, [offers, selectedIds, onSelectedOffersChange]);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (storeCodeRequired && !filters.storeCode) return;
    setLoading(true);
    setLoadError(null);
    try {
      const list = await getOffersForSelection({
        ...filters,
        storeCode: filters.storeCode || (STORE_CODES[0] ?? ''),
      });
      setOffers(list as SerializedOfferForSelection[]);
      setSelectedIds(new Set());
      setLastSelectedIndex(null);
      onFiltersApplied?.({ storeCode: filters.storeCode || (STORE_CODES[0] ?? '') });
    } catch (error) {
      console.error('Error loading offers for selection:', error);
      setOffers([]);
      setSelectedIds(new Set());
      setLastSelectedIndex(null);
      setLoadError('Could not load offers. Please refresh and sign in again.');
    } finally {
      setLoading(false);
    }
  };

  const allSelected = offers.length > 0 && selectedIds.size === offers.length;
  const someSelected = selectedIds.size > 0;

  const selectAll = () => setSelectedIds(new Set(offers.map((o) => o.id)));
  const deselectAll = () => setSelectedIds(new Set());

  const sortedOffers = React.useMemo(() => {
    if (!sortState) return offers;
    const list = [...offers];
    const dir = sortState.direction === 'asc' ? 1 : -1;

    list.sort((a, b) => {
      const compareStrings = (x: string, y: string) =>
        x.localeCompare(y, undefined, { sensitivity: 'base', numeric: true });

      switch (sortState.column) {
        case 'store': {
          const as =
            getStoreDisplayId(a.storeCode) ??
            '';
          const bs =
            getStoreDisplayId(b.storeCode) ??
            '';
          return compareStrings(as, bs) * dir;
        }
        case 'offerType': {
          const at = getOfferTypeLabel(a as any);
          const bt = getOfferTypeLabel(b as any);
          return compareStrings(at, bt) * dir;
        }
        case 'vehicle': {
          const av = formatVehicleTitle(a);
          const bv = formatVehicleTitle(b);
          return compareStrings(av, bv) * dir;
        }
        case 'endDate': {
          const at = new Date(a.endDate).getTime();
          const bt = new Date(b.endDate).getTime();
          if (at === bt) return 0;
          return at < bt ? -1 * dir : 1 * dir;
        }
        default:
          return 0;
      }
    });

    return list;
  }, [offers, sortState]);

  const displayedRowIds = React.useMemo(() => sortedOffers.map((o) => o.id), [sortedOffers]);

  const toggleOne = (id: string, index: number, shiftKey: boolean) => {
    setSelectedIds((prev) => {
      const result = applyCheckboxSelection({
        selectedIds: prev,
        displayedRowIds,
        clickedId: id,
        clickedIndex: index,
        lastSelectedIndex,
        shiftKey,
      });
      setLastSelectedIndex(result.nextLastSelectedIndex);
      return result.nextSelectedIds;
    });
  };

  const toggleSort = (column: 'store' | 'offerType' | 'vehicle' | 'endDate') => {
    setSortState((prev) => {
      if (!prev || prev.column !== column) {
        return { column, direction: 'asc' };
      }
      const nextDir = prev.direction === 'asc' ? 'desc' : 'asc';
      return { column, direction: nextDir };
    });
  };

  const renderSortIndicator = (column: 'store' | 'offerType' | 'vehicle' | 'endDate') => {
    if (!sortState || sortState.column !== column) return null;
    return (
      <span aria-hidden className="ml-1 inline-block text-[10px]">
        {sortState.direction === 'asc' ? '▲' : '▼'}
      </span>
    );
  };

  const fullCardGroups = React.useMemo(
    () =>
      groupOffersForCards(offers, filters.storeCode || '', undefined).filter((group) => {
        const hasLease = group.offers.some((offer) => isLeaseLikeOffer(offer));
        const hasFinance = group.offers.some((offer) => isFinanceLikeOffer(offer));
        return hasLease && hasFinance;
      }),
    [offers, filters.storeCode]
  );

  const handleAutoSelectFullCards = () => {
    if (!offers.length) return;
    const ids = fullCardGroups
      .flatMap((group) => group.offers.map((offer) => offer.id));
    setSelectedIds(new Set(ids));
    setLastSelectedIndex(null);
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={handleApply}
        className="rounded-md border border-neutral-200 bg-surface-amber px-3 py-3 dark:border-neutral-700 dark:bg-surface-amber-dark sm:px-4"
      >
        <div className="grid grid-cols-2 gap-3 lg:flex lg:flex-row lg:flex-wrap lg:items-end lg:gap-4">
          <FormGroup label="Store" htmlFor="sel-store" className="min-w-0">
            <Select
              id="sel-store"
              value={filters.storeCode}
              onChange={(e) => setFilters((f) => ({ ...f, storeCode: e.target.value }))}
              className="w-full min-w-[6rem]"
            >
              <option value="">Select store</option>
              {storeOptions.map((c) => (
                <option key={c} value={c}>
                  {getStoreDisplayId(c)}
                </option>
              ))}
            </Select>
          </FormGroup>
          <FormGroup label="Date from" htmlFor="sel-dateFrom" className="min-w-0">
            <Input
              id="sel-dateFrom"
              type="date"
              value={
                filters.dateFrom != null
                  ? (typeof filters.dateFrom === 'string'
                      ? filters.dateFrom
                      : formatEasternDate(filters.dateFrom))
                  : ''
              }
              onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value || undefined }))}
              className="w-full min-w-[7rem]"
            />
          </FormGroup>
          <FormGroup label="Date to" htmlFor="sel-dateTo" className="min-w-0">
            <Input
              id="sel-dateTo"
              type="date"
              value={
                filters.dateTo != null
                  ? (typeof filters.dateTo === 'string'
                      ? filters.dateTo
                      : formatEasternDate(filters.dateTo))
                  : ''
              }
              onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value || undefined }))}
              className="w-full min-w-[7rem]"
            />
          </FormGroup>
          <FormGroup label="Status" htmlFor="sel-status" className="min-w-0">
            <Select
              id="sel-status"
              value={filters.status ?? ''}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  status: (e.target.value as OfferStatus) || OfferStatus.LIVE,
                }))
              }
              className="w-full min-w-[6rem]"
            >
              <option value={OfferStatus.LIVE}>Live</option>
              <option value={OfferStatus.INACTIVE}>Inactive</option>
            </Select>
          </FormGroup>
          {showOfferTypeFilter && (
            <FormGroup label="Offer type" htmlFor="sel-offerType" className="min-w-0">
              <Select
                id="sel-offerType"
                value={filters.offerType ?? ''}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    offerType: (e.target.value || null) as any,
                  }))
                }
                className="w-full min-w-[6rem]"
              >
                <option value="">All</option>
                <option value="Lease">Lease</option>
                <option value="Finance">Finance</option>
                <option value="Cash">Cash</option>
              </Select>
            </FormGroup>
          )}
          {showConditionFilter && (
            <FormGroup label="Condition" htmlFor="sel-condition" className="min-w-0">
              <Select
                id="sel-condition"
                value={filters.condition ?? ''}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    condition: (e.target.value || null) as VehicleCondition | null,
                  }))
                }
                className="w-full min-w-[6rem]"
              >
                <option value="">All</option>
                <option value={VehicleCondition.NEW}>New</option>
                <option value={VehicleCondition.CERTIFIED}>Certified</option>
                <option value={VehicleCondition.USED}>Used</option>
              </Select>
            </FormGroup>
          )}
          {showYearFilter && (
            <FormGroup label="Year" htmlFor="sel-year" className="min-w-0">
              <Select
                id="sel-year"
                value={filters.year == null ? '' : String(filters.year)}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    year: e.target.value ? Number(e.target.value) : null,
                  }))
                }
                className="w-full min-w-[6rem]"
              >
                <option value="">All</option>
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </Select>
            </FormGroup>
          )}
          <FormGroup
            label={
              <span className="flex w-full items-baseline justify-between gap-2">
                <span>Search</span>
                <span className="hidden font-normal text-neutral-500 text-xs sm:inline dark:text-neutral-400">
                  Model, trim
                </span>
              </span>
            }
            htmlFor="sel-search"
            className="min-w-0"
          >
            <Input
              id="sel-search"
              type="text"
              placeholder="e.g. Camry"
              value={filters.search ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value || undefined }))}
              className="w-full min-w-[7rem]"
            />
          </FormGroup>
          <div className="flex items-end lg:ml-auto">
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={loading || (storeCodeRequired && !filters.storeCode)}
              className="w-full lg:w-auto"
            >
              {loading ? 'Loading…' : 'Apply filters'}
            </Button>
          </div>
        </div>
      </form>

      {offers.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-700">
          {showAutoSelectFullCards && (
            <div className="border-b border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={handleAutoSelectFullCards}
              >
                Auto-select full cards (Lease + Finance)
              </Button>
              <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-400">
                {fullCardGroups.length} full card{fullCardGroups.length === 1 ? '' : 's'} found
              </span>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) (el as HTMLInputElement).indeterminate = someSelected && !allSelected;
                    }}
                    onChange={() => (allSelected ? deselectAll() : selectAll())}
                    className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Offer type</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Offer details</TableHead>
                <TableHead>End date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedOffers.map((o, index) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(o.id)}
                      onChange={(e) => {
                        const native = e.nativeEvent;
                        const shiftKey =
                          typeof native === 'object' &&
                          native != null &&
                          'shiftKey' in native
                            ? Boolean((native as MouseEvent).shiftKey)
                            : false;
                        toggleOne(o.id, index, shiftKey);
                      }}
                      className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500"
                      aria-label={`Select ${o.model}`}
                    />
                  </TableCell>
                  <TableCell className="cursor-pointer select-none">
                    <span
                      className="inline-flex items-center"
                      onClick={() => toggleSort('store')}
                    >
                      {getStoreDisplayId(o.storeCode)}
                      {renderSortIndicator('store')}
                    </span>
                  </TableCell>
                  <TableCell className="cursor-pointer select-none">
                    <span
                      className="inline-flex items-center"
                      onClick={() => toggleSort('offerType')}
                    >
                      {getOfferTypeLabel(o as any)}
                      {renderSortIndicator('offerType')}
                    </span>
                  </TableCell>
                  <TableCell className="cursor-pointer select-none font-medium">
                    <span
                      className="inline-flex items-center"
                      onClick={() => toggleSort('vehicle')}
                    >
                      {formatVehicleTitle(o)}
                      {renderSortIndicator('vehicle')}
                    </span>
                  </TableCell>
                  <TableCell className="text-neutral-500 dark:text-neutral-400">
                    {getOfferDetailsSummary(o as any)}
                  </TableCell>
                  <TableCell className="cursor-pointer select-none text-neutral-500 dark:text-neutral-400">
                    <span
                      className="inline-flex items-center"
                      onClick={() => toggleSort('endDate')}
                    >
                      {new Date(o.endDate).toLocaleDateString('en-US', {
                        timeZone: 'America/New_York',
                      })}
                      {renderSortIndicator('endDate')}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!loading && filters.storeCode && offers.length === 0 && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No offers match the current filters. Adjust and click Apply filters.
        </p>
      )}

      {loadError && (
        <p className="text-sm text-red-600 dark:text-red-400">{loadError}</p>
      )}

      {!filters.storeCode && storeCodeRequired && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Select a store and click Apply filters.</p>
      )}
    </div>
  );
}

function isLeaseLikeOffer(offer: SerializedOfferForSelection): boolean {
  if (offer.offerType === 'Lease') return true;
  return (
    offer.leasePayment != null &&
    offer.leaseTerm != null &&
    offer.leaseMiles != null &&
    offer.dueAtSigning != null
  );
}

function isFinanceLikeOffer(offer: SerializedOfferForSelection): boolean {
  if (offer.offerType === 'Finance') return true;
  return (
    (offer.aprRate != null && offer.aprTermMonths != null) ||
    (Array.isArray(offer.financeRates) && offer.financeRates.length > 0)
  );
}
