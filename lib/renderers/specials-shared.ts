import type { Offer } from '@prisma/client';
import { getCertifiedQualifyingModelYearsLabel } from '@/lib/config/certified-qualifying-years';
import { formatOemBrandLabel } from '@/lib/config/oem-labels';
import { getMakeForStoreCode } from '@/lib/config/stores';
import type { StoreConfig } from '@/lib/config/stores';
import {
  getImageUrlForOffer,
  getInventoryUrlForStore,
  VEHICLE_PLACEHOLDER_IMAGE_URL,
} from '@/lib/domain/offer-assets';
import { monthlyPaymentPer1000 } from '@/lib/domain/apr-disclaimer';
import { formatLeaseMiles, formatVehicleTitle, modelForDisplay } from '@/lib/domain/offer-type';
import { getFinanceApr } from '@/lib/domain/finance-rates';
import { formatAprPercent } from '@/lib/domain/apr-format';
import { buildOfferDisclaimerText } from '@/lib/disclaimers';
import {
  DISCLAIMER_DOC_FEE_USD,
  getCaptiveLenderAbbrev,
  getSalespersonTitleForStore,
} from '@/lib/disclaimers/config';

export type SpecialsBrand = 'toyota' | 'bmw' | 'lexus';

export const BRAND_SCOPE: Record<SpecialsBrand, string> = {
  toyota: 'tto-scope',
  bmw: 'bmw-scope',
  lexus: 'lexus-scope',
};

export function getBrandCssVariables(brand: SpecialsBrand): string {
  const vars: Record<SpecialsBrand, string> = {
    toyota: `
      --bg: #f6f7f9;
      --card: #ffffff;
      --text: #111827;
      --muted: #6b7280;
      --border: rgba(17, 24, 39, 0.12);
      --shadow: 0 8px 24px rgba(17, 24, 39, 0.08);
      --radius: 18px;
      --lease: #0ea5e9;
      --finance: #22c55e;
      --cta: #111827;
      --media-from: rgba(14, 165, 233, 0.10);
      --media-to: rgba(34, 197, 94, 0.08);
      --pill-lease-bg: rgba(14, 165, 233, 0.12);
      --pill-lease-fg: #0369a1;
      --pill-lease-border: rgba(14, 165, 233, 0.22);
      --pill-finance-bg: rgba(34, 197, 94, 0.12);
      --pill-finance-fg: #166534;
      --pill-finance-border: rgba(34, 197, 94, 0.22);
    `,
    bmw: `
      --bg: #f5f5f5;
      --card: #ffffff;
      --text: #000000;
      --muted: #4b4b4b;
      --border: rgba(0, 0, 0, 0.14);
      --shadow: 0 10px 26px rgba(0, 0, 0, 0.12);
      --radius: 0;
      --lease: #000000;
      --finance: #000000;
      --cta: #1D69D3;
      --media-from: rgba(0, 0, 0, 0.06);
      --media-to: rgba(0, 0, 0, 0.02);
      --pill-lease-bg: transparent;
      --pill-lease-fg: #000000;
      --pill-lease-border: rgba(0, 0, 0, 0.75);
      --pill-finance-bg: transparent;
      --pill-finance-fg: #000000;
      --pill-finance-border: rgba(0, 0, 0, 0.75);
    `,
    lexus: `
      --bg: #f5f5f5;
      --card: #ffffff;
      --text: #1a1a1a;
      --muted: #6b6b6b;
      --border: rgba(0, 0, 0, 0.08);
      --shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
      --radius: 12px;
      --lease: #1a1a1a;
      --finance: #0d5c2e;
      --cta: #1a1a1a;
      --media-from: rgba(26, 26, 26, 0.08);
      --media-to: rgba(13, 92, 46, 0.06);
      --pill-lease-bg: rgba(26, 26, 26, 0.10);
      --pill-lease-fg: #1a1a1a;
      --pill-lease-border: rgba(26, 26, 26, 0.20);
      --pill-finance-bg: rgba(13, 92, 46, 0.12);
      --pill-finance-fg: #0d5c2e;
      --pill-finance-border: rgba(13, 92, 46, 0.22);
    `,
  };
  return vars[brand].trim();
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function hasLease(o: Offer): boolean {
  return o.leasePayment != null && o.leaseTerm != null && o.leaseMiles != null && o.dueAtSigning != null;
}

export function hasFinance(o: Offer): boolean {
  return (
    o.offerType === 'Finance' &&
    ((o.aprRate != null && o.aprTermMonths != null) ||
      (o.financeRates != null && Array.isArray(o.financeRates) && (o.financeRates as unknown[]).length > 0))
  );
}

export { getFinanceApr };

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export function buildFineprint(
  offers: Offer[],
  storeCode: string,
  _options: { docFee?: number; acquisitionFee?: number },
  templatesConfig?: import('@/lib/disclaimers/template-resolver').DisclaimerTemplatesConfig,
): string {
  const { textMinified } = buildOfferDisclaimerText(offers, storeCode, templatesConfig);
  let fineprint = textMinified;

  if (offers.some((o) => o.condition === 'CERTIFIED' && o.offerType === 'Finance')) {
    const yearsLabel = getCertifiedQualifyingModelYearsLabel(storeCode);
    if (yearsLabel) fineprint += ` Qualifying Certified model years: ${yearsLabel}.`;
  }

  return fineprint;
}

function formatWebSpecialsExpiresOn(endDate: Date): string {
  return endDate.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function webSpecialsEligibilityPhrase(offer: Offer, make: string): string {
  const year = offer.year != null ? String(offer.year) : '';
  const model = modelForDisplay(make, offer.model);
  const condition = (offer.condition || 'NEW').toUpperCase();
  const stock = condition === 'CERTIFIED' ? 'certified' : condition === 'USED' ? 'used' : 'new';
  return `all ${stock} in-stock ${year} ${make} ${model} models`.replace(/\s+/g, ' ').trim();
}

/**
 * Per-card finance disclaimer for web specials (card fineprint).
 * Returns null when the card has no finance offer.
 */
export function buildWebSpecialsFinanceFineprint(
  offers: Offer[],
  storeCode: string,
  options: { docFee?: number } = {}
): string | null {
  const financeOffer = offers.find(hasFinance);
  if (!financeOffer) return null;

  const financeApr = getFinanceApr(financeOffer);
  if (!financeApr) return null;

  const docFee = options.docFee ?? DISCLAIMER_DOC_FEE_USD;
  const lender = getCaptiveLenderAbbrev(storeCode);
  const salesperson = getSalespersonTitleForStore(storeCode);
  const make = financeOffer.make?.trim() || getMakeForStoreCode(storeCode) || '';
  const year = financeOffer.year != null ? String(financeOffer.year) : '';
  const model = modelForDisplay(make, financeOffer.model);
  const rateModelPhrase = [year, model].filter(Boolean).join(' ');

  const { aprRate, aprTermMonths } = financeApr;
  const paymentPer1000 = monthlyPaymentPer1000(aprRate, aprTermMonths).toFixed(2);

  const endDates = offers.map((o) => o.endDate).filter((d): d is Date => d instanceof Date);
  const latestEndDate =
    endDates.length > 0 ? endDates.reduce((latest, d) => (d > latest ? d : latest)) : null;

  const parts = [
    `${formatAprPercent(aprRate)} financing with ${aprTermMonths} monthly payments of $${paymentPer1000} for each $1,000 borrowed on ${rateModelPhrase}.`,
    `Advertised price includes a $${docFee} document fee.`,
    `Advertised price excludes tax, tags, registration and license fees.`,
    `Vehicle(s) eligible: ${webSpecialsEligibilityPhrase(financeOffer, make)}.`,
    `On approved Tier 1+ credit through ${lender}, not all customers will qualify.`,
    `$0 security deposit.`,
    `$0 down payment required.`,
    `See ${salesperson} for full details.`,
    latestEndDate ? `Expires on ${formatWebSpecialsExpiresOn(latestEndDate)}.` : '',
  ].filter(Boolean);

  let fineprint = parts.join(' ');

  if (financeOffer.condition === 'CERTIFIED' && financeOffer.offerType === 'Finance') {
    const yearsLabel = getCertifiedQualifyingModelYearsLabel(storeCode);
    if (yearsLabel) fineprint += ` Qualifying Certified model years: ${yearsLabel}.`;
  }

  return fineprint;
}

export function buildWebSpecialsFineprint(
  offers: Offer[],
  storeCode: string,
  options: { docFee?: number; acquisitionFee?: number } = {},
  templatesConfig?: import('@/lib/disclaimers/template-resolver').DisclaimerTemplatesConfig,
): string {
  return (
    buildWebSpecialsFinanceFineprint(offers, storeCode, options) ??
    buildFineprint(offers, storeCode, options, templatesConfig)
  );
}

export function buildIntroServiceAreaText(config: StoreConfig | null): string {
  const county = config?.location?.county;
  if (county === 'Demo County') {
    return 'Demo County, Example County, and nearby communities';
  }
  if (county) {
    return `${county} and nearby communities`;
  }
  return 'your area';
}

export function getIntroAccentColor(brand: SpecialsBrand, config: StoreConfig | null): string {
  if (config?.branding?.accentColor) return config.branding.accentColor;
  if (brand === 'toyota') return '#e10a1d';
  if (brand === 'bmw') return '#1D69D3';
  return '#1a1a1a';
}

export function resolveCardBasics(offers: Offer[], storeCode: string, titleOverride?: string | null) {
  const titleOffer = offers.find(hasLease) ?? offers.find(hasFinance) ?? offers[0];
  const msrp = titleOffer.msrp ?? null;
  const vehicleTitle = titleOverride ?? formatVehicleTitle(titleOffer);
  const inventoryUrl = getInventoryUrlForStore(titleOffer, storeCode) ?? '#';
  const imageUrl = getImageUrlForOffer(titleOffer) ?? VEHICLE_PLACEHOLDER_IMAGE_URL;
  return { titleOffer, msrp, vehicleTitle, inventoryUrl, imageUrl };
}

export function renderOfferBlocks(offers: Offer[]): { leaseHtml: string; financeHtml: string } {
  const leaseOffers = offers.filter(hasLease);
  const leaseOffer =
    leaseOffers.length > 0
      ? leaseOffers.reduce((best, o) =>
          Number(o.leasePayment!) < Number(best.leasePayment!) ? o : best
        )
      : null;
  const financeOffer = offers.find(hasFinance);
  const financeApr = financeOffer ? getFinanceApr(financeOffer) : null;

  const leaseHtml = leaseOffer
    ? `<div class="offer">
  <div class="offer-top">
    <span class="pill pill-lease">Lease</span>
    <div class="offer-main">
      <span class="price">${formatCurrency(Number(leaseOffer.leasePayment!))}/mo</span>
      <div class="offer-sub">
        <span class="offer-sub-line">${leaseOffer.leaseTerm}-mo · ${formatLeaseMiles(
          leaseOffer.leaseMiles!
        )} mi/yr</span>
        <span class="offer-sub-line offer-sub-line-nowrap">&bull; ${formatCurrency(
          Number(leaseOffer.dueAtSigning!)
        )} due at signing</span>
      </div>
    </div>
  </div>
</div>`
    : '';

  const financeHtml =
    financeOffer && financeApr
      ? `<div class="offer">
  <div class="offer-top">
    <span class="pill pill-finance">Finance</span>
    <div class="offer-main">
      <span class="price">${formatAprPercent(financeApr.aprRate)} APR</span>
      <div class="offer-sub">up to ${financeApr.aprTermMonths} months</div>
    </div>
  </div>
</div>`
      : '';
  return { leaseHtml, financeHtml };
}

export function getBrandTitle(brand: SpecialsBrand): string {
  const brandName = formatOemBrandLabel(brand);
  return `${brandName} Specials`;
}
