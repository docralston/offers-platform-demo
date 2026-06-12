/**
 * Types for model-pages admin UI. Kept in admin so client components
 * can import without pulling in server-only lib/model-page-generator.
 */

export interface ListMetaResult {
  brands: string[];
  yearsByBrand: Record<string, number[]>;
  storesByBrand: Record<string, string[]>;
}

export interface ModelWithSlug {
  displayName: string;
  category: string;
  slug: string;
  inventoryModelOverride?: string;
  specs?: Record<string, number | string | undefined>;
}

export interface ModelYearPage {
  pageType: string;
  make: string;
  model: string;
  year: number;
  pagePath: string;
  canonicalUrl: string;
  seo: { title: string; metaDescription: string };
  images: {
    hero: { alt: string; path: string };
    vehicleJellybean: { alt: string; path: string };
  };
  heroSubhead: string;
  whyBullets: [string, string, string];
  trims: {
    intro: string;
    sections: Array<{
      title: string;
      items: Array<{ label: string; note: string }>;
    }>;
  };
  contentSections?: Array<{
    id: string;
    title: string;
    intent?: string;
    bodyHtml: string;
  }>;
  faqs: Array<{ q: string; a: string }>;
  links: { inventoryHref: string };
  tags: string[];
  storeKey: string;
  localSeoSummary?: string;
}
