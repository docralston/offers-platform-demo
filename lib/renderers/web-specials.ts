/**
 * Web Specials page renderer. Builds full HTML for brand-specific specials cards
 * (Toyota, BMW, Lexus) from grouped offers. One card per vehicle with lease + finance.
 */
import type { Offer } from '@prisma/client';
import { getStoreConfig } from '@/lib/config/stores.server';
import { getDefaultAcquisitionFee } from '@/lib/config/stores';
import {
  formatConditionPrefix,
  formatVehicleTitle,
  getModelForSort,
  modelForDisplay,
} from '@/lib/domain/offer-type';
import { groupOffersForCards, type CardBrand } from '@/lib/domain/card-groups';
import { slugify } from '@/lib/model-page-generator/slug';
import { formatOemBrandLabel } from '@/lib/config/oem-labels';
import {
  BRAND_SCOPE,
  buildIntroServiceAreaText,
  buildWebSpecialsFineprint,
  escapeHtml,
  formatCurrency,
  getBrandCssVariables,
  getIntroAccentColor,
  hasFinance,
  hasLease,
  renderOfferBlocks,
  resolveCardBasics,
  type SpecialsBrand,
} from '@/lib/renderers/specials-shared';
import { resolveOfferCtaHref } from '@/lib/domain/safe-url';
import { pickEmbedWidgetOffers } from '@/lib/embed/widget-offers';

export type { SpecialsBrand } from '@/lib/renderers/specials-shared';

/** Shared card/layout CSS; uses CSS variables from scope. */
const SHARED_SPECIALS_CSS = `
.SCOPE_CLASS,
.SCOPE_CLASS * {
  box-sizing: border-box;
}
.SCOPE_CLASS {
  margin: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
  color: var(--text);
}
.SCOPE_CLASS a {
  color: inherit;
  text-decoration: none;
}
.SCOPE_CLASS .wrap {
  max-width: 1100px;
  margin: 0 auto;
  padding: 18px 14px 44px;
}
.SCOPE_CLASS .grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  margin-top: 14px;
}
@media (min-width: 640px) {
  .SCOPE_CLASS .wrap { padding: 26px 18px 60px; }
  .SCOPE_CLASS .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
}
@media (min-width: 1024px) {
  .SCOPE_CLASS .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
}
.SCOPE_CLASS .card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: 0 12px 26px rgba(17, 24, 39, 0.06);
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
.SCOPE_CLASS .card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
  border-color: rgba(17, 24, 39, 0.18);
}
.SCOPE_CLASS .card-media {
  position: relative;
  background: linear-gradient(
    135deg,
    var(--media-from, rgba(14,165,233,.10)),
    var(--media-to, rgba(34,197,94,.08))
  );
  display: block;
  aspect-ratio: 16 / 9;
  overflow: hidden;
}
.SCOPE_CLASS .card-media img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.SCOPE_CLASS .card-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
}
.SCOPE_CLASS .card-title {
  font-size: 24px;
  line-height: 1.25;
  margin: 0;
  letter-spacing: -0.01em;
}
@media (min-width: 640px) {
  .SCOPE_CLASS .card-title {
    min-height: 2.5em;
  }
}
.SCOPE_CLASS .offers {
  display: grid;
  gap: 8px;
}
.SCOPE_CLASS .offer {
  border: 1px solid rgba(17, 24, 39, 0.10);
  border-radius: 14px;
  padding: 10px;
  background: linear-gradient(180deg, rgba(17,24,39,.02), rgba(17,24,39,.00));
}
.SCOPE_CLASS .offer-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.SCOPE_CLASS .offer-main {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 0;
  max-width: 100%;
}
.SCOPE_CLASS .pill {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
  background: rgba(17, 24, 39, 0.06);
  color: rgba(17, 24, 39, 0.85);
  white-space: nowrap;
}
.SCOPE_CLASS .pill-lease {
  background: var(--pill-lease-bg, rgba(14, 165, 233, 0.12));
  color: var(--pill-lease-fg, #0369a1);
  border: 1px solid var(--pill-lease-border, rgba(14, 165, 233, 0.22));
}
.SCOPE_CLASS .pill-finance {
  background: var(--pill-finance-bg, rgba(34, 197, 94, 0.12));
  color: var(--pill-finance-fg, #166534);
  border: 1px solid var(--pill-finance-border, rgba(34, 197, 94, 0.22));
}
.SCOPE_CLASS .price {
  font-weight: 800;
  font-size: 22px;
  letter-spacing: -0.01em;
  white-space: nowrap;
}
.SCOPE_CLASS .offer-sub {
  margin-top: 6px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.35;
  text-align: right;
}
.SCOPE_CLASS .msrp {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.2;
  margin: 2px 0 0 0;
}
.SCOPE_CLASS .docfee {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.2;
  margin: 0;
}
.SCOPE_CLASS .offer-sub-line {
  display: block;
}
.SCOPE_CLASS .offer-sub-line-nowrap {
  white-space: normal;
}
.SCOPE_CLASS .card-actions {
  display: grid;
  gap: 8px;
  margin-top: auto;
}
.SCOPE_CLASS .btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 11px 14px;
  font-weight: 700;
  font-size: 14px;
  background: var(--cta);
  color: #fff;
  border: 1px solid rgba(17, 24, 39, 0.18);
  transition: transform 0.12s ease, color 0.12s ease;
  width: 100%;
}
.SCOPE_CLASS .btn:hover {
  transform: translateY(-1px);
}
.SCOPE_CLASS .btn-contact {
  background: #e10a1d;
  border-color: #e10a1d;
}
.SCOPE_CLASS .btn-contact:hover {
  opacity: 0.9;
}
.SCOPE_CLASS .fineprint {
  color: var(--muted);
  font-size: 10px;
  line-height: 1.35;
}
`;

/** BMW-specific overrides for a black/white, square, left-aligned layout. */
const BMW_SPECIALS_CSS = `
.SCOPE_CLASS .card {
  border-radius: 0;
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.12);
}
.SCOPE_CLASS .card-body,
.SCOPE_CLASS .card-title,
.SCOPE_CLASS .msrp,
.SCOPE_CLASS .docfee,
.SCOPE_CLASS .offers,
.SCOPE_CLASS .fineprint {
  text-align: left;
}
.SCOPE_CLASS .offers {
  display: grid;
  gap: 8px;
}
.SCOPE_CLASS .offer {
  border-radius: 0;
  background: #ffffff;
  border-color: rgba(0, 0, 0, 0.16);
}
.SCOPE_CLASS .offer-top {
  flex-direction: row-reverse;
}
.SCOPE_CLASS .offer-main {
  align-items: flex-start;
}
.SCOPE_CLASS .offer-sub {
  text-align: left;
}
.SCOPE_CLASS .pill {
  border-radius: 0;
  background: transparent;
  color: #000000;
  border-color: rgba(0, 0, 0, 0.75);
  justify-content: center;
}
.SCOPE_CLASS .pill-lease {
  background: transparent;
}
.SCOPE_CLASS .pill-finance {
  background: transparent;
}
.SCOPE_CLASS .btn {
  border-radius: 0;
  background: #1D69D3;
  color: #ffffff;
  border-color: #1D69D3;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.SCOPE_CLASS .btn:hover {
  background: #000000;
  color: #ffffff;
}
.SCOPE_CLASS .btn-contact {
  background: #1D69D3;
  color: #ffffff;
  border-color: #1D69D3;
}
.SCOPE_CLASS .btn-contact:hover {
  background: #000000;
  color: #ffffff;
  border-color: #000000;
}
`;

/** Lexus-specific layout styling, closely matching existing Lexus event pages. */
const LEXUS_SPECIALS_CSS = `
.SCOPE_CLASS,
.SCOPE_CLASS * {
  box-sizing: border-box;
}
.SCOPE_CLASS {
  margin: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
  color: var(--text);
}
.SCOPE_CLASS a {
  color: inherit;
  text-decoration: none;
}
.SCOPE_CLASS .wrap {
  max-width: 1100px;
  margin: 0 auto;
  padding: 18px 14px 44px;
}
.SCOPE_CLASS .grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  margin-top: 14px;
}
@media (min-width: 720px) {
  .SCOPE_CLASS .wrap {
    padding: 26px 18px 60px;
  }
  .SCOPE_CLASS .grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }
}
@media (min-width: 1024px) {
  .SCOPE_CLASS .grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
  }
}
.SCOPE_CLASS .card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.06);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
.SCOPE_CLASS .card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
}
.SCOPE_CLASS .card-media {
  background: linear-gradient(135deg, rgba(26,26,26,.08), rgba(13,92,46,.06));
  aspect-ratio: 16/9;
  overflow: hidden;
  display: block;
}
.SCOPE_CLASS .card-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.SCOPE_CLASS .card-body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.SCOPE_CLASS .card-title {
  font-size: 24px;
  line-height: 1.25;
  margin: 0;
}
.SCOPE_CLASS .offers {
  display: grid;
  gap: 8px;
}
.SCOPE_CLASS .offer {
  border: 1px solid rgba(0,0,0,.06);
  border-radius: 0;
  padding: 10px;
  background: linear-gradient(180deg, rgba(0,0,0,.02), transparent);
}
.SCOPE_CLASS .offer-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.SCOPE_CLASS .offer-main {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
}
.SCOPE_CLASS .pill {
  display: inline-flex;
  align-items: center;
  border-radius: 0;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}
.SCOPE_CLASS .pill-lease {
  background: rgba(26,26,26,.1);
  color: #1a1a1a;
  border: 1px solid rgba(26,26,26,.2);
}
.SCOPE_CLASS .pill-finance {
  background: rgba(13,92,46,.12);
  color: #0d5c2e;
  border: 1px solid rgba(13,92,46,.22);
}
.SCOPE_CLASS .price {
  font-weight: 800;
  font-size: 22px;
  white-space: nowrap;
}
.SCOPE_CLASS .offer-sub {
  margin-top: 6px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.35;
  text-align: right;
}
.SCOPE_CLASS .offer-sub-line-nowrap {
  white-space: nowrap;
}
.SCOPE_CLASS .msrp {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.2;
  margin: 2px 0 0 0;
}
.SCOPE_CLASS .docfee {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.2;
  margin: 0;
}
.SCOPE_CLASS .card-actions {
  display: grid;
  gap: 8px;
  margin-top: 2px;
}
.SCOPE_CLASS .btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0;
  padding: 11px 14px;
  font-weight: 700;
  font-size: 14px;
  background: #ffffff;
  color: #000000;
  border: 1px solid #000000;
  width: 100%;
  transition: transform .12s ease;
}
.SCOPE_CLASS .btn:hover {
  transform: translateY(-1px);
}
.SCOPE_CLASS .btn-contact {
  background: #1a1a1a;
  color: #ffffff;
  border: 1px solid #1a1a1a;
}
.SCOPE_CLASS .fineprint {
  color: var(--muted);
  font-size: 10px;
  line-height: 1.35;
}
`;

const R2_BASE = 'https://demo-assets.example.com';

/** Model-specific URL overrides for Toyota web specials. */
function getToyotaCrownOverrides(offer: Offer): {
  inventoryUrl: string;
  modelDetailsUrl: string;
  imageUrl: string;
} | null {
  if (process.env.DEMO_MODE === 'true') return null;
  const model = offer.model?.trim();
  if (!model || !/^crown$/i.test(model)) return null;
  const year = offer.year ?? 2026;
  return {
    inventoryUrl: 'https://toyota-of-demotown.example.com',
    modelDetailsUrl: `https://toyota-of-demotown.example.com`,
    imageUrl: `${R2_BASE}/assets/toyota/${year}/crown/${year}-toyota-crown-jellybean.webp`,
  };
}

/**
 * Compute model-detail page URL for a given offer using the same convention
 * as the model-page generator. Falls back to null if required fields are missing.
 */
function getModelPageUrlForOffer(
  offer: Offer,
  brand: SpecialsBrand,
  storeConfig: import('@/lib/config/stores').StoreConfig | null
): string | null {
  if (!storeConfig) return null;
  const model = offer.model?.trim();
  const year = offer.year;
  if (!model || !year) return null;

  const brandSlug = brand; // 'toyota' | 'bmw' | 'lexus'
  const modelSlug = slugify(model);
  const city =
    storeConfig.location?.city ||
    (process.env.DEMO_MODE === 'true' ? 'Demotown' : 'Demotown');
  const state = storeConfig.location?.state || 'PA';
  const citySlug = city.toLowerCase().replace(/\s+/g, '-');

  const pagePath = `/new-${brandSlug}/${year}-${brandSlug}-${modelSlug}-${citySlug}-${state.toLowerCase()}.htm`;
  const siteUrl = (storeConfig.siteUrl || '').replace(/\/+$/, '');

  // Prefer absolute URL; fall back to relative path if siteUrl is missing.
  return siteUrl ? `${siteUrl}${pagePath}` : pagePath;
}

/**
 * Renders one vehicle card (lease + finance) for the web specials grid.
 */
function renderSpecialsCard(
  offers: Offer[],
  storeCode: string,
  scopeClass: string,
  options: {
    docFee?: number;
    acquisitionFee?: number;
    contactAnchor?: string;
    modelDetailsUrl?: string | null;
    inventoryUrl?: string | null;
    imageUrl?: string | null;
    titleOverride?: string | null;
    templatesConfig?: import('@/lib/disclaimers/template-resolver').DisclaimerTemplatesConfig;
    inactiveCtas?: boolean;
  }
): string {
  if (offers.length === 0) return '';
  const { titleOffer, msrp, vehicleTitle, inventoryUrl: derivedInventoryUrl, imageUrl: derivedImageUrl } =
    resolveCardBasics(offers, storeCode, options.titleOverride);
  const inventoryUrl = resolveOfferCtaHref(options.inventoryUrl ?? derivedInventoryUrl, {
    inactive: options.inactiveCtas,
  });
  const imageUrl = options.imageUrl ?? derivedImageUrl;
  const contactHref = resolveOfferCtaHref(options.contactAnchor || '#tto_leadform', {
    inactive: options.inactiveCtas,
    fallback: '#tto_leadform',
  });
  const modelDetailsHref = resolveOfferCtaHref(options.modelDetailsUrl ?? derivedInventoryUrl, {
    inactive: options.inactiveCtas,
  });
  const docFee = options.docFee ?? 490;
  const acqFee = options.acquisitionFee ?? 0;
  const { leaseHtml, financeHtml } = renderOfferBlocks(offers);
  const fineprint = buildWebSpecialsFineprint(offers, storeCode, { docFee, acquisitionFee: acqFee }, options.templatesConfig);

  const offersBlock = [leaseHtml, financeHtml].filter(Boolean).join('\n                ');

  return `<article class="card">
  <a class="card-media" href="${escapeHtml(inventoryUrl)}" aria-label="${escapeHtml(vehicleTitle)}">
    <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(vehicleTitle)}" loading="lazy" decoding="async" />
  </a>
  <div class="card-body">
    <h3 class="card-title">${escapeHtml(vehicleTitle)}</h3>
    ${msrp != null && msrp > 0 ? `<div class="msrp">MSRP ${formatCurrency(msrp)}</div>
    <div class="docfee">+${formatCurrency(docFee)} Doc Fee</div>` : ''}
    <div class="offers">
      ${offersBlock}
    </div>
    <div class="card-actions">
      <a class="btn btn-contact" href="${escapeHtml(contactHref)}">Contact Us</a>
      <a class="btn" href="${escapeHtml(modelDetailsHref)}">Model Details</a>
      <span class="fineprint">${escapeHtml(fineprint)}</span>
    </div>
  </div>
</article>`;
}

function renderIntroSection(
  brand: SpecialsBrand,
  config: import('@/lib/config/stores').StoreConfig | null
): string {
  const brandName = formatOemBrandLabel(brand);
  const accentColor = getIntroAccentColor(brand, config);
  const serviceArea = buildIntroServiceAreaText(config);

  return `<section aria-label="Intro">
          <div style="margin:0 auto 15px;text-align:center;font-size:3.5rem;font-weight:bold;text-box-edge: cap alphabetic;text-box-trim: trim-both;">DEAR <span style="color:${escapeHtml(accentColor)};">${escapeHtml(brandName.toUpperCase())}</span></div>
          <p style="text-align:center;text-wrap:balance;margin-bottom:20px;">Explore special offers on new ${escapeHtml(brandName)} vehicles for drivers in ${escapeHtml(serviceArea)}.</p>
        </section>`;
}

/**
 * Returns full HTML document for the Web Specials page.
 * Groups offers by vehicle (storeCode, condition, year, make, model); one card per vehicle.
 */
export function renderWebSpecialsHtml(
  offers: Offer[],
  storeCode: string,
  brand: SpecialsBrand,
  templatesConfig?: import('@/lib/disclaimers/template-resolver').DisclaimerTemplatesConfig,
): string {
  const scopeClass = BRAND_SCOPE[brand];
  const cssVars = getBrandCssVariables(brand);
  const baseCss =
    brand === 'lexus'
      ? LEXUS_SPECIALS_CSS
      : brand === 'bmw'
      ? `${SHARED_SPECIALS_CSS}\n${BMW_SPECIALS_CSS}`
      : SHARED_SPECIALS_CSS;
  const styles = [
    `.${scopeClass} { ${cssVars} }`,
    baseCss.replace(/SCOPE_CLASS/g, scopeClass),
  ].join('\n');

  const config = getStoreConfig(storeCode as import('@/lib/config/stores').StoreCode);
  const acquisitionFee = getDefaultAcquisitionFee(storeCode) ?? 0;
  // Web specials pages are expected to have a local form anchor called "#tto_leadform"
  // that lives on the same page as the cards.
  const contactAnchor = '#tto_leadform';

  const brandForCards: CardBrand = brand;

  const cardGroups = groupOffersForCards(offers, storeCode, brandForCards);

  const cards = cardGroups
    .map((group) => {
      const titleOffer = group.titleOffer;
      const crownOverrides = brand === 'toyota' ? getToyotaCrownOverrides(titleOffer) : null;
      const modelDetailsUrl =
        crownOverrides?.modelDetailsUrl ?? getModelPageUrlForOffer(titleOffer, brand, config);

      return renderSpecialsCard(group.offers, storeCode, scopeClass, {
        docFee: 490,
        acquisitionFee,
        contactAnchor,
        modelDetailsUrl,
        inventoryUrl: crownOverrides?.inventoryUrl,
        imageUrl: crownOverrides?.imageUrl,
        titleOverride: group.title,
        templatesConfig,
      });
    })
    .join('\n          ');

  const brandName = formatOemBrandLabel(brand);
  const title = `${brandName} Specials`;
  const description = `Explore current ${brandName} lease and finance specials.`;
  const intro = renderIntroSection(brand, config);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <style>
${styles}
    </style>
  </head>
  <body>
    <div class="${scopeClass}">
      <main class="wrap">
        ${intro}
        <section class="grid" aria-label="Specials grid">
          ${cards}
        </section>
      </main>
    </div>
  </body>
</html>`;
}

/** Embed widget layout: single column, full width of host container (ignores viewport breakpoints). */
const EMBED_WIDGET_LAYOUT_CSS = `
.offers-widget-root {
  width: 100%;
  max-width: 100%;
}
.offers-widget-root .widget {
  width: 100%;
  margin-top: 0;
}
.offers-widget-root .grid {
  grid-template-columns: 1fr !important;
  width: 100%;
  margin-top: 0;
}
.offers-widget-root .card {
  width: 100%;
}
`;

export function renderWebSpecialsWidgetEmbed(
  offers: Offer[],
  storeCode: string,
  brand: SpecialsBrand,
  options?: {
    contactAnchor?: string;
    templatesConfig?: import('@/lib/disclaimers/template-resolver').DisclaimerTemplatesConfig;
    inactiveCtas?: boolean;
    offerType?: import('@prisma/client').OfferTypeEnum;
  },
): string {
  const scopeClass = BRAND_SCOPE[brand];
  const cssVars = getBrandCssVariables(brand);
  const baseCss =
    brand === 'lexus'
      ? LEXUS_SPECIALS_CSS
      : brand === 'bmw'
        ? `${SHARED_SPECIALS_CSS}\n${BMW_SPECIALS_CSS}`
        : SHARED_SPECIALS_CSS;
  const styles = [
    `.${scopeClass} { ${cssVars} }`,
    baseCss.replace(/SCOPE_CLASS/g, scopeClass),
    EMBED_WIDGET_LAYOUT_CSS,
  ].join('\n');

  const config = getStoreConfig(storeCode as import('@/lib/config/stores').StoreCode);
  const acquisitionFee = getDefaultAcquisitionFee(storeCode) ?? 0;
  const inactiveCtas = options?.inactiveCtas;
  const templatesConfig = options?.templatesConfig;
  const embedOffers = pickEmbedWidgetOffers(offers, options?.offerType);
  if (embedOffers.length === 0) return '';

  const cardGroups = groupOffersForCards(embedOffers, storeCode, brand);
  const group = cardGroups[0];
  if (!group) return '';

  const titleOffer = group.titleOffer;
  const crownOverrides = brand === 'toyota' ? getToyotaCrownOverrides(titleOffer) : null;
  const modelDetailsUrl =
    crownOverrides?.modelDetailsUrl ?? getModelPageUrlForOffer(titleOffer, brand, config);

  const card = renderSpecialsCard(group.offers, storeCode, scopeClass, {
    docFee: 490,
    acquisitionFee,
    contactAnchor: options?.contactAnchor,
    inactiveCtas,
    modelDetailsUrl,
    inventoryUrl: crownOverrides?.inventoryUrl,
    imageUrl: crownOverrides?.imageUrl,
    titleOverride: group.title,
    templatesConfig,
  });

  if (!card.trim()) {
    return '';
  }

  return `<style>${styles}</style>
<div class="offers-widget-root">
<div class="${scopeClass}">
<section class="widget" aria-label="Special offer">
          ${card}
        </section>
</div>
</div>`;
}
