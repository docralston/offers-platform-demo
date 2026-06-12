import { STORE_CODES, type StoreCode } from '@/lib/config/stores';

export const DASHBOARD_STORE_ALL = 'ALL' as const;

export type DashboardStoreFilter = StoreCode | typeof DASHBOARD_STORE_ALL;

export function normalizeDashboardStore(raw?: string): DashboardStoreFilter {
  if (raw === DASHBOARD_STORE_ALL) return DASHBOARD_STORE_ALL;
  if (raw && (STORE_CODES as readonly string[]).includes(raw)) return raw as StoreCode;
  return DASHBOARD_STORE_ALL;
}
