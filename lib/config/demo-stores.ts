import type { StoreCode } from '@/lib/config/stores';
import type { StoreConfig } from '@/lib/config/stores';
import { DEMO_STORE_DISPLAY_NAMES } from '@/lib/config/demo';

const DEMO_BASE = 'https://demo-dealers.example.com';

function demoSite(path: string): string {
  return `${DEMO_BASE}${path}`;
}

function baseDemoConfig(
  storeCode: StoreCode,
  storeKey: string,
  brand: string,
  city: string,
  county: string,
): StoreConfig {
  const dealerName = DEMO_STORE_DISPLAY_NAMES[storeCode];
  return {
    storeKey,
    brand,
    domain: 'demo-dealers.example.com',
    siteUrl: DEMO_BASE,
    dealerName,
    legalName: dealerName,
    location: {
      address: '100 Demo Plaza',
      city,
      state: 'PA',
      zip: '00000',
      county,
    },
    contact: {
      phone: '555-0100',
    },
    branding: {
      accentColor: '#2563eb',
      theme: 'demo',
    },
    links: {
      newInventory: demoSite('/inventory/new'),
      usedInventory: demoSite('/inventory/used'),
      service: demoSite('/service'),
      finance: demoSite('/finance'),
      trade: demoSite('/trade'),
      contact: demoSite('/contact'),
    },
    schema: {
      includeLocalBusiness: false,
      includeBreadcrumbs: false,
      includeFAQPage: false,
      includeTrimsItemList: false,
    },
  };
}

const DEMO_STORE_CONFIGS: Record<StoreCode, StoreConfig> = {
  TOY: baseDemoConfig('TOY', 'toy', 'Toyota', 'Demotown', 'Demo County'),
  BMW: baseDemoConfig('BMW', 'bmw', 'BMW', 'Demotown', 'Demo County'),
  LEXDT: baseDemoConfig('LEXDT', 'lexdt', 'Lexus', 'Demotown', 'Demo County'),
  LEXWG: baseDemoConfig('LEXWG', 'lexwg', 'Lexus', 'Exampleville', 'Example County'),
};

export function getDemoStoreConfig(storeCode: StoreCode): StoreConfig | null {
  return DEMO_STORE_CONFIGS[storeCode] ?? null;
}
