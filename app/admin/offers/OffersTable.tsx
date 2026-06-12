'use client';

import { useRef } from 'react';
import { formatConditionLabel, formatCurrency, getOfferDetailsSummary, getDisplayOfferType } from '@/lib/domain/offer-type';
import {
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { getStoreDisplayId } from '@/lib/config/store-display';
import { formatAppTimestamp } from '@/lib/utils/dates';
import Link from 'next/link';
import type { SerializedOffer } from './types';

interface OffersTableProps {
  offers: SerializedOffer[];
  visibleIds: string[];
  sortLink: (field: string) => string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  selectedIds: string[];
  onToggleSelect: (
    id: string,
    index: number,
    event: React.MouseEvent<HTMLInputElement>,
    displayedRowIds: string[],
  ) => void;
  onSelectAll: (displayedRowIds: string[]) => void;
  onDeselectAll: (displayedRowIds: string[]) => void;
  showCheckboxes?: boolean;
}

function SortIcon({ direction }: { direction: 'asc' | 'desc' }) {
  const size = 14;
  return (
    <span className="ml-1 inline-block text-neutral-400 dark:text-neutral-500" aria-hidden>
      {direction === 'asc' ? (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 15l-6-6-6 6" />
        </svg>
      ) : (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      )}
    </span>
  );
}

function SortableHeader({
  label,
  sortField,
  sortLink,
  sortBy,
  sortOrder,
}: {
  label: string;
  sortField: string;
  sortLink: (field: string) => string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}) {
  const isActive = sortBy === sortField;
  return (
    <Link
      href={sortLink(sortField)}
      className="inline-flex items-center hover:text-neutral-900 dark:hover:text-neutral-100"
    >
      {label}
      {isActive && sortOrder ? <SortIcon direction={sortOrder} /> : null}
    </Link>
  );
}

/** Certified Finance: one row per (model, store). Dedupe key for display. */
function certifiedDedupeKey(o: SerializedOffer & { displayStoreCode: string }): string {
  return `${(o.model ?? '').trim()}\0${o.displayStoreCode}`;
}

/**
 * When Store column visible: expand multi-store offers to one row per store.
 * When Store column NOT visible: show only LEXDT for Lexus multi-store offers.
 * For Certified offers: dedupe to one per (model, displayStoreCode).
 */
function expandOffersForStoreColumn(
  offers: SerializedOffer[],
  visibleIds: string[]
): (SerializedOffer & { displayStoreCode: string })[] {
  const storeVisible = visibleIds.includes('store');
  const LEXUS_STORES = ['LEXDT', 'LEXWG'] as const;

  const rows: (SerializedOffer & { displayStoreCode: string })[] = [];

  if (storeVisible) {
    for (const o of offers) {
      const codes = o.storeCodes && o.storeCodes.length > 0 ? o.storeCodes : [o.storeCode];
      for (const sc of codes) {
        rows.push({ ...o, displayStoreCode: sc });
      }
    }
  } else {
    for (const o of offers) {
      const codes = o.storeCodes && o.storeCodes.length > 0 ? o.storeCodes : [o.storeCode];
      const isLexusMultiStore =
        codes.length > 1 && codes.some((c) => LEXUS_STORES.includes(c as (typeof LEXUS_STORES)[number]));
      if (isLexusMultiStore) {
        rows.push({ ...o, displayStoreCode: 'LEXDT' });
      } else {
        rows.push({ ...o, displayStoreCode: o.storeCode });
      }
    }
  }

  const isCertifiedFinance = (o: SerializedOffer) =>
    o.condition === 'CERTIFIED' && (o.offerType === 'Finance' || (o as { offerType?: string }).offerType === 'Finance');

  const seen = new Set<string>();
  return rows.filter((o) => {
    if (!isCertifiedFinance(o)) return true;
    const key = certifiedDedupeKey(o);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function OffersTable({
  offers,
  visibleIds,
  sortLink,
  sortBy,
  sortOrder,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  showCheckboxes = true,
}: OffersTableProps) {
  const lastMouseEventRef = useRef<{ shiftKey: boolean; ctrlKey: boolean; metaKey: boolean } | null>(null);
  const displayOffers = expandOffersForStoreColumn(offers, visibleIds);
  const displayedRowIds = displayOffers.map((o) => o.id);
  const uniqueDisplayedRowIds = Array.from(new Set(displayedRowIds));
  const selectedVisibleCount = uniqueDisplayedRowIds.filter((id) => selectedIds.includes(id)).length;
  const allSelected = uniqueDisplayedRowIds.length > 0 && selectedVisibleCount === uniqueDisplayedRowIds.length;
  const someSelected = selectedVisibleCount > 0 && selectedVisibleCount < uniqueDisplayedRowIds.length;

  return (
    <Table>
      <TableHeader>
        <tr>
          {showCheckboxes && (
            <TableHead>
              <input
                type="checkbox"
                checked={allSelected}
                ref={(input) => {
                  if (input) input.indeterminate = someSelected && !allSelected;
                }}
                onChange={(e) => {
                  if (e.target.checked) {
                    onSelectAll(uniqueDisplayedRowIds);
                  } else {
                    onDeselectAll(uniqueDisplayedRowIds);
                  }
                }}
                className="h-4 w-4 cursor-pointer appearance-none rounded border-2 border-neutral-200 bg-transparent focus:ring-2 focus:ring-accent-500 focus:ring-offset-0 dark:appearance-auto dark:border-neutral-600 dark:bg-neutral-800 dark:checked:border-accent-600 dark:checked:bg-accent-600"
                style={{
                  backgroundColor: allSelected ? '#2563eb' : 'transparent',
                  borderColor: allSelected ? '#2563eb' : '#e5e5e5',
                  backgroundImage: allSelected
                    ? "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M10 2L4 8L2 6' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E\")"
                    : 'none',
                  backgroundSize: 'contain',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'center',
                }}
                aria-label="Select all offers"
              />
            </TableHead>
          )}
          {visibleIds.includes('status') && (
            <TableHead>
              <SortableHeader label="Status" sortField="status" sortLink={sortLink} sortBy={sortBy} sortOrder={sortOrder} />
            </TableHead>
          )}
          {visibleIds.includes('store') && (
            <TableHead>
              <SortableHeader label="Store" sortField="storeCode" sortLink={sortLink} sortBy={sortBy} sortOrder={sortOrder} />
            </TableHead>
          )}
          {visibleIds.includes('condition') && (
            <TableHead>
              <SortableHeader label="Condition" sortField="condition" sortLink={sortLink} sortBy={sortBy} sortOrder={sortOrder} />
            </TableHead>
          )}
          {visibleIds.includes('year') && (
            <TableHead>
              <SortableHeader label="Year" sortField="year" sortLink={sortLink} sortBy={sortBy} sortOrder={sortOrder} />
            </TableHead>
          )}
          {visibleIds.includes('make') && (
            <TableHead>
              <SortableHeader label="Make" sortField="make" sortLink={sortLink} sortBy={sortBy} sortOrder={sortOrder} />
            </TableHead>
          )}
          {visibleIds.includes('model') && (
            <TableHead>
              <SortableHeader label="Model" sortField="model" sortLink={sortLink} sortBy={sortBy} sortOrder={sortOrder} />
            </TableHead>
          )}
          {visibleIds.includes('modelCode') && (
            <TableHead>
              <SortableHeader label="Model code" sortField="modelCode" sortLink={sortLink} sortBy={sortBy} sortOrder={sortOrder} />
            </TableHead>
          )}
          {visibleIds.includes('trim') && (
            <TableHead>
              <SortableHeader label="Trim" sortField="trim" sortLink={sortLink} sortBy={sortBy} sortOrder={sortOrder} />
            </TableHead>
          )}
          {visibleIds.includes('offerType') && (
            <TableHead>
              <SortableHeader label="Offer type" sortField="offerType" sortLink={sortLink} sortBy={sortBy} sortOrder={sortOrder} />
            </TableHead>
          )}
          {visibleIds.includes('offerDetails') && (
            <TableHead>
              <SortableHeader label="Offer details" sortField="offerDetails" sortLink={sortLink} sortBy={sortBy} sortOrder={sortOrder} />
            </TableHead>
          )}
          {visibleIds.includes('rebateTotal') && (
            <TableHead>
              <SortableHeader label="Rebate" sortField="rebateTotal" sortLink={sortLink} sortBy={sortBy} sortOrder={sortOrder} />
            </TableHead>
          )}
          {visibleIds.includes('endDate') && (
            <TableHead>
              <SortableHeader label="End date" sortField="endDate" sortLink={sortLink} sortBy={sortBy} sortOrder={sortOrder} />
            </TableHead>
          )}
          {visibleIds.includes('updated') && (
            <TableHead>
              <SortableHeader label="Updated" sortField="updatedAt" sortLink={sortLink} sortBy={sortBy} sortOrder={sortOrder} />
            </TableHead>
          )}
          {visibleIds.includes('actions') && (
            <TableHead align="right">Actions</TableHead>
          )}
        </tr>
      </TableHeader>
      <TableBody>
        {offers.length === 0 ? (
          <TableEmpty colSpan={visibleIds.length + (showCheckboxes ? 1 : 0)}>
            No offers found. Try adjusting filters or{' '}
            <Link href="/admin/offers/new" className="font-medium text-accent-600 hover:text-accent-700 dark:text-accent-400">
              create one
            </Link>
            .
          </TableEmpty>
        ) : (
          displayOffers.map((o, index) => (
            <TableRow key={`${o.id}-${(o as { displayStoreCode: string }).displayStoreCode}`}>
              {showCheckboxes && (
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(o.id)}
                    onMouseDown={(e) => {
                      // Capture modifier keys before onChange fires
                      lastMouseEventRef.current = {
                        shiftKey: e.shiftKey,
                        ctrlKey: e.ctrlKey,
                        metaKey: e.metaKey,
                      };
                    }}
                    onChange={(e) => {
                      // Create a synthetic event-like object with modifier keys
                      const syntheticEvent = {
                        shiftKey: lastMouseEventRef.current?.shiftKey ?? false,
                        ctrlKey: lastMouseEventRef.current?.ctrlKey ?? false,
                        metaKey: lastMouseEventRef.current?.metaKey ?? false,
                      } as React.MouseEvent<HTMLInputElement>;
                      onToggleSelect(o.id, index, syntheticEvent, displayedRowIds);
                      lastMouseEventRef.current = null;
                    }}
                    className="h-4 w-4 cursor-pointer appearance-none rounded border-2 border-neutral-200 bg-transparent focus:ring-2 focus:ring-accent-500 focus:ring-offset-0 dark:appearance-auto dark:border-neutral-600 dark:bg-neutral-800 dark:checked:border-accent-600 dark:checked:bg-accent-600"
                    style={{
                      backgroundColor: selectedIds.includes(o.id) ? '#2563eb' : 'transparent',
                      borderColor: selectedIds.includes(o.id) ? '#2563eb' : '#e5e5e5',
                      backgroundImage: selectedIds.includes(o.id)
                        ? "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M10 2L4 8L2 6' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' fill='none'/%3E%3C/svg%3E\")"
                        : 'none',
                      backgroundSize: 'contain',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'center',
                    }}
                    aria-label={`Select offer ${o.id}`}
                  />
                </TableCell>
              )}
              {visibleIds.includes('status') && (
                <TableCell>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={o.status} />
                    {o.validationIssues && Array.isArray(o.validationIssues) && o.validationIssues.length > 0 && (
                      <span
                        className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                        title={`${o.validationIssues.length} validation ${o.validationIssues.length === 1 ? 'issue' : 'issues'}`}
                      >
                        {o.validationIssues.length}
                      </span>
                    )}
                  </div>
                </TableCell>
              )}
              {visibleIds.includes('store') && (
                <TableCell className="font-medium">
                  {getStoreDisplayId((o as { displayStoreCode: string }).displayStoreCode)}
                </TableCell>
              )}
              {visibleIds.includes('condition') && (
                <TableCell className="text-neutral-500 dark:text-neutral-400">
                  {formatConditionLabel(o.condition as any)}
                </TableCell>
              )}
              {visibleIds.includes('year') && (
                <TableCell>
                  {o.condition === 'CERTIFIED' && getDisplayOfferType(o as any) === 'Finance' ? '—' : (o.year ?? '—')}
                </TableCell>
              )}
              {visibleIds.includes('make') && (
                <TableCell className="font-medium">{o.make ?? '—'}</TableCell>
              )}
              {visibleIds.includes('model') && <TableCell>{o.model}</TableCell>}
              {visibleIds.includes('modelCode') && (
                <TableCell className="text-neutral-500 dark:text-neutral-400">
                  {o.modelCode != null ? String(o.modelCode) : '—'}
                </TableCell>
              )}
              {visibleIds.includes('trim') && (
                <TableCell className="text-neutral-500 dark:text-neutral-400">
                  {o.trim || '—'}
                </TableCell>
              )}
              {visibleIds.includes('offerType') && (
                <TableCell>{getDisplayOfferType(o as any)}</TableCell>
              )}
              {visibleIds.includes('offerDetails') && (
                <TableCell className="text-neutral-500 dark:text-neutral-400">
                  {getOfferDetailsSummary(o as any)}
                </TableCell>
              )}
              {visibleIds.includes('rebateTotal') && (
                <TableCell className="text-neutral-500 dark:text-neutral-400">
                  {o.rebateTotal != null ? formatCurrency(Number(o.rebateTotal)) : '—'}
                </TableCell>
              )}
              {visibleIds.includes('endDate') && (
                <TableCell className="text-neutral-500 dark:text-neutral-400">
                  {new Date(o.endDate).toLocaleDateString('en-US', { timeZone: 'America/New_York' })}
                </TableCell>
              )}
              {visibleIds.includes('updated') && (
                <TableCell className="text-neutral-500 dark:text-neutral-400">
                  {formatAppTimestamp(o.updatedAt)}
                </TableCell>
              )}
              {visibleIds.includes('actions') && (
                <TableCell align="right">
                  <span className="flex justify-end gap-4">
                    <Link
                      href={`/admin/offers/${o.id}`}
                      className="text-sm font-medium text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300"
                    >
                      View
                    </Link>
                    <Link
                      href={`/admin/offers/${o.id}/edit`}
                      className="text-sm font-medium text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300"
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/admin/offers/${o.id}/history`}
                      className="text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                    >
                      History
                    </Link>
                  </span>
                </TableCell>
              )}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
