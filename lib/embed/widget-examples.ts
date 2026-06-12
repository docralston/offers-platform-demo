import type { StoreCode } from '@/lib/config/stores';

export type EmbedWidgetExample = {
  id: string;
  pageTitle: string;
  storeCode: StoreCode;
  model: string;
  year: number;
  offerSummary: string;
  scenario: string;
};

/** Live embed scenarios backed by demo seed offers (see scripts/lib/demo-seed.ts). */
export const EMBED_WIDGET_EXAMPLES: EmbedWidgetExample[] = [
  {
    id: 'toyota-camry',
    pageTitle: '2026 Toyota Camry',
    storeCode: 'TOY',
    model: 'Camry',
    year: 2026,
    offerSummary: 'Lease · $299/mo · 36 mo · 12k mi/yr',
    scenario: 'Model landing page — primary lease special above the lead form.',
  },
  {
    id: 'toyota-rav4',
    pageTitle: '2026 Toyota RAV4',
    storeCode: 'TOY',
    model: 'RAV4',
    year: 2026,
    offerSummary: 'Finance · 2.9% APR · up to 60 mo',
    scenario: 'Finance-focused VLP with APR callout and inventory CTA.',
  },
  {
    id: 'bmw-x3',
    pageTitle: '2026 BMW X3',
    storeCode: 'BMW',
    model: 'X3',
    year: 2026,
    offerSummary: 'Lease · $549/mo · 39 mo · 10k mi/yr',
    scenario: 'BMW brand styling — scoped CSS variables and dark CTAs.',
  },
  {
    id: 'bmw-3-series',
    pageTitle: '2026 BMW 3 Series',
    storeCode: 'BMW',
    model: '3 Series',
    year: 2026,
    offerSummary: 'Finance · 3.99% APR · up to 48 mo',
    scenario: 'Series name with space — same embed pattern dealers use on model pages.',
  },
  {
    id: 'lexus-rx',
    pageTitle: '2026 Lexus RX',
    storeCode: 'LEXDT',
    model: 'RX',
    year: 2026,
    offerSummary: 'Lease · $499/mo · 36 mo · 10k mi/yr',
    scenario: 'Lexus of Demotown — luxury layout and fine print.',
  },
  {
    id: 'lexus-nx',
    pageTitle: '2026 Lexus NX',
    storeCode: 'LEXWG',
    model: 'NX',
    year: 2026,
    offerSummary: 'Lease · $429/mo · 36 mo · 10k mi/yr',
    scenario: 'Second Lexus store (Exampleville) on the same platform.',
  },
];
