import { getMakeForStoreCode } from './stores';

/**
 * Number of model years back from the current model year that qualify for
 * Certified (CPO) finance offers. Qualifying years = [currentModelYear - N, ..., currentModelYear].
 * These shift automatically each calendar year.
 */
export const CERTIFIED_QUALIFYING_YEARS_BACK: Record<string, number> = {
  Toyota: 6,
  Lexus: 6,
  BMW: 5,
};

/** Current model year (calendar year; adjust in Q4 if your program uses next-year model). */
export function getCurrentModelYear(): number {
  return new Date().getFullYear();
}

/**
 * Returns the list of model years that currently qualify for Certified finance
 * for the given store. Used for display and data extraction on offer detail pages.
 */
export function getCertifiedQualifyingModelYears(storeCode: string): number[] {
  const make = getMakeForStoreCode(storeCode);
  if (!make) return [];
  const yearsBack = CERTIFIED_QUALIFYING_YEARS_BACK[make];
  if (yearsBack == null || yearsBack < 0) return [];
  const current = getCurrentModelYear();
  const years: number[] = [];
  for (let i = yearsBack; i >= 0; i--) {
    years.push(current - i);
  }
  return years;
}

/**
 * Human-readable label for qualifying model years, e.g. "2020–2026".
 * Empty string if store has no config.
 */
export function getCertifiedQualifyingModelYearsLabel(storeCode: string): string {
  const years = getCertifiedQualifyingModelYears(storeCode);
  if (years.length === 0) return '';
  if (years.length === 1) return String(years[0]);
  return `${years[0]}–${years[years.length - 1]}`;
}
