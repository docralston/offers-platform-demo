import { Prisma } from '@prisma/client';

/**
 * Format APR percent value for display as a string with up to 2 decimal places.
 * Input is a percent (e.g. 3.99 for 3.99%), not a fractional rate.
 */
export function formatAprPercent(aprPercent: number | Prisma.Decimal): string {
  const n = Number(aprPercent);
  if (!Number.isFinite(n)) return '0%';
  if (n === 0) return '0%';
  const s = n.toFixed(2).replace(/\.?0+$/, '');
  return `${s}%`;
}

