'use server';

import { requireUserId } from '@/lib/auth';
import { getStoreConfig as getStoreConfigServer } from '@/lib/config/stores.server';
import { STORE_CODES, type StoreCode } from '@/lib/config/stores';

export async function getStoreConfig(storeCode: StoreCode) {
  await requireUserId();
  return getStoreConfigServer(storeCode);
}

export async function getStoreCodes(): Promise<StoreCode[]> {
  await requireUserId();
  return [...STORE_CODES];
}
