import 'server-only';
import fs from 'fs';
import path from 'path';
import { isDemoMode } from '@/lib/config/demo';
import { getDemoStoreConfig } from '@/lib/config/demo-stores';
import { StoreConfig, StoreCode } from './stores';

// Map uppercase store codes to lowercase storeKeys used in configs
const STORE_KEY_MAP: Record<StoreCode, string> = {
  TOY: 'toy',
  LEXDT: 'lexdt',
  LEXWG: 'lexwg',
  BMW: 'bmw',
};

const STORES_DIR = path.join(process.cwd(), 'lab', 'modelpager', 'configs', 'stores');

/**
 * Loads store configuration from JSON files (server-only)
 */
function loadStoreConfig(storeCode: StoreCode): StoreConfig | null {
  const storeKey = STORE_KEY_MAP[storeCode];
  if (!storeKey) {
    return null;
  }

  const searchPaths = [
    path.join(STORES_DIR, storeKey, `${storeKey}.json`),
    path.join(STORES_DIR, 'toyota', `${storeKey}.json`),
    path.join(STORES_DIR, 'lexus', `${storeKey}.json`),
    path.join(STORES_DIR, 'bmw', `${storeKey}.json`),
  ];

  for (const configPath of searchPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(content) as StoreConfig;
      } catch (error) {
        console.error(`Error loading store config from ${configPath}:`, error);
        return null;
      }
    }
  }

  return null;
}

// Cache store configs
const storeConfigCache: Map<StoreCode, StoreConfig | null> = new Map();

/**
 * Gets store configuration for a given store code (server-only)
 * For client components, use the server action in app/actions/stores.ts
 */
export function getStoreConfig(storeCode: StoreCode): StoreConfig | null {
  if (isDemoMode()) {
    return getDemoStoreConfig(storeCode);
  }

  if (storeConfigCache.has(storeCode)) {
    return storeConfigCache.get(storeCode) || null;
  }

  const config = loadStoreConfig(storeCode);
  storeConfigCache.set(storeCode, config);
  return config;
}
