import { formatEasternDate, createEasternDate } from '@/lib/utils/dates';
import type { StoreCode } from '@/lib/config/stores';

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === 'true';
}

/** Shared demo guest sign-in code (demo deploy only). */
export function demoAccessCode(): string {
  const code = process.env.DEMO_ACCESS_CODE?.trim();
  return code || 'demo';
}

/** Client-safe demo flag (set on demo Vercel only). */
export function isDemoModeClient(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
}

export function inDemoMode(): boolean {
  if (typeof window !== 'undefined') {
    return isDemoModeClient();
  }
  return isDemoMode();
}

export const DEMO_STORE_DISPLAY_NAMES: Record<StoreCode, string> = {
  TOY: 'Toyota of Demotown',
  BMW: 'BMW of Demotown',
  LEXDT: 'Lexus of Demotown',
  LEXWG: 'Lexus of Exampleville',
};

/** Public store IDs shown on demo deploys (internal codes stay TOY/BMW/LEXDT/LEXWG). */
export const DEMO_STORE_DISPLAY_IDS: Record<StoreCode, string> = {
  TOY: 'TOYDT',
  BMW: 'BMWDT',
  LEXDT: 'LEXDT',
  LEXWG: 'LEXEX',
};

export function demoAssetBaseUrl(): string {
  if (process.env.DEMO_ASSET_BASE_URL?.trim()) {
    return process.env.DEMO_ASSET_BASE_URL.replace(/\/+$/, '');
  }
  return '/demo/assets';
}

/** Relative path under `public/demo/assets/` — e.g. `toyota/2026/camry.webp`. */
export function demoVehicleAssetPath(make: string, year: number, filename: string): string {
  return `${make.toLowerCase()}/${year}/${filename}`;
}

export function demoStartDateEastern(reference = new Date()): Date {
  const et = formatEasternDate(reference);
  const [y, m] = et.split('-');
  return createEasternDate(`${y}-${m}-01`);
}

export function demoEndDateEastern(reference = new Date()): Date {
  const et = formatEasternDate(reference);
  const [yStr, mStr] = et.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const lastDay = new Date(y, m, 0).getDate();
  return createEasternDate(`${yStr}-${mStr}-${String(lastDay).padStart(2, '0')}`);
}

export function demoBlockedMessage(): string {
  return 'This action is disabled in demo mode.';
}
