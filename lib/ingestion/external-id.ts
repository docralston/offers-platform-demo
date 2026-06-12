import crypto from 'crypto';
import type { OfferInput } from '@/lib/domain/validation';

/**
 * Shared helpers for computing stable externalIds for offers.
 *
 * Important: these functions intentionally ignore pricing fields (payments,
 * APR, MSRP, discounts, rebates, etc.) so that changing the numbers for an
 * otherwise identical campaign will UPDATE the existing offer instead of
 * creating a new one.
 *
 * History is captured via OfferVersion snapshots rather than by new rows.
 */

function datePart(value: OfferInput['startDate'] | OfferInput['endDate']): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const iso = (value as Date)?.toISOString?.();
  return iso ? iso.slice(0, 10) : '';
}

function baseStableParts(row: OfferInput): string[] {
  return [
    String(row.year ?? ''),
    (row.make ?? '').trim(),
    (row.model ?? '').trim(),
    (row.trim ?? '').trim(),
    (row.condition ?? '').toString(),
    (row.offerType ?? '').toString(),
    datePart(row.startDate),
    datePart(row.endDate),
  ];
}

function hashParts(parts: string[]): string {
  const hash = crypto.createHash('sha256').update(parts.join('\0')).digest('hex');
  return hash.slice(0, 32);
}

/**
 * Toyota/BMW: one externalId per logical offer per store.
 * Finance offers may still consolidate across trims based on existing rules
 * in the brand-specific ingestion, but pricing is not part of the key.
 */
export function computeToyotaExternalId(row: OfferInput): string {
  const parts = [
    row.storeCode ?? '',
    ...baseStableParts(row),
  ];
  return hashParts(parts);
}

export function computeBmwExternalId(row: OfferInput): string {
  const parts = [
    row.storeCode ?? '',
    ...baseStableParts(row),
  ];
  return hashParts(parts);
}

/**
 * Lexus: omit storeCode so the same logical offer can be shared across
 * LEXDT/LEXWG via storeCodes, matching the brand ingestion behavior.
 */
export function computeLexusExternalId(row: OfferInput): string {
  const parts = baseStableParts(row);
  return hashParts(parts);
}

