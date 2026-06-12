import type { Offer } from '@prisma/client';
import { formatConditionPrefix, formatLeaseMiles, formatVehicleTitle } from '@/lib/domain/offer-type';
import { getInventoryUrlForStore, getImageUrlForOffer, VEHICLE_PLACEHOLDER_IMAGE_URL } from '@/lib/domain/offer-assets';
import { resolveOfferCtaHref, safeHrefUrl } from '@/lib/domain/safe-url';
import { escapeHtml } from '@/lib/renderers/specials-shared';
import { getBuyPriceLabel } from '@/lib/config/store-display';
import { getFinanceApr } from '@/lib/domain/finance-rates';

export type EmailBrand = 'toyota' | 'lexus' | 'bmw';

export interface RenderOfferCardOptions {
  storeCode: string;
  accentColor?: string;
  /** Optional brand key to align styling with web specials cards. */
  brand?: EmailBrand;
  /** Optional Certified finance years label for disclaimers (e.g. "2019-2024"). */
  certifiedYearsLabel?: string;
  /** 'email' = parcel.io/caniemail.org-safe table-based HTML (default) */
  format?: 'email';
}

interface BrandStyleTokens {
  cardBorderColor: string;
  cardBorderRadius: string;
  cardBackground: string;
  textColor: string;
  mutedColor: string;
  pillBorderRadius: string;
  leasePillBackground: string;
  leasePillColor: string;
  leasePillBorderColor: string;
  financePillBackground: string;
  financePillColor: string;
  financePillBorderColor: string;
  buyPillBackground: string;
  buyPillColor: string;
  buyPillBorderColor: string;
  ctaBackground: string;
  ctaColor: string;
  ctaBorderColor: string;
}

function getBrandStyles(brand: EmailBrand | undefined, accentFallback: string): BrandStyleTokens {
  const accent = accentFallback || '#EB0A1E';

  if (brand === 'lexus') {
    return {
      cardBorderColor: 'rgba(0,0,0,0.08)',
      cardBorderRadius: '12px',
      cardBackground: '#f5f5f5',
      textColor: '#1a1a1a',
      mutedColor: '#6b6b6b',
      pillBorderRadius: '0',
      leasePillBackground: 'rgba(26,26,26,0.1)',
      leasePillColor: '#1a1a1a',
      leasePillBorderColor: 'rgba(26,26,26,0.2)',
      financePillBackground: 'rgba(13,92,46,0.12)',
      financePillColor: '#0d5c2e',
      financePillBorderColor: 'rgba(13,92,46,0.22)',
      buyPillBackground: 'rgba(26,26,26,0.05)',
      buyPillColor: '#1a1a1a',
      buyPillBorderColor: 'rgba(0,0,0,0.12)',
      ctaBackground: '#1a1a1a',
      ctaColor: '#ffffff',
      ctaBorderColor: '#1a1a1a',
    };
  }

  if (brand === 'bmw') {
    return {
      cardBorderColor: 'rgba(0,0,0,0.10)',
      cardBorderRadius: '8px',
      cardBackground: '#f7f7f7',
      textColor: '#1c1c1c',
      mutedColor: '#5a5a5a',
      pillBorderRadius: '999px',
      leasePillBackground: 'rgba(28,105,212,0.12)',
      leasePillColor: '#11468f',
      leasePillBorderColor: 'rgba(28,105,212,0.24)',
      financePillBackground: 'rgba(0,102,79,0.12)',
      financePillColor: '#004434',
      financePillBorderColor: 'rgba(0,102,79,0.24)',
      buyPillBackground: 'rgba(28,105,212,0.06)',
      buyPillColor: '#11468f',
      buyPillBorderColor: 'rgba(0,0,0,0.10)',
      ctaBackground: '#1c69d4',
      ctaColor: '#ffffff',
      ctaBorderColor: '#1c69d4',
    };
  }

  // Default / Toyota
  return {
    cardBorderColor: 'rgba(17,24,39,0.12)',
    cardBorderRadius: '18px',
    cardBackground: '#f9fafb',
    textColor: '#111827',
    mutedColor: '#6b7280',
    pillBorderRadius: '999px',
    leasePillBackground: 'rgba(14,165,233,0.12)',
    leasePillColor: '#0369a1',
    leasePillBorderColor: 'rgba(14,165,233,0.22)',
    financePillBackground: 'rgba(34,197,94,0.12)',
    financePillColor: '#166534',
    financePillBorderColor: 'rgba(34,197,94,0.22)',
    buyPillBackground: 'rgba(17,24,39,0.06)',
    buyPillColor: '#111827',
    buyPillBorderColor: 'rgba(17,24,39,0.18)',
    ctaBackground: accent,
    ctaColor: '#ffffff',
    ctaBorderColor: accent,
  };
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

function formatAprCompact(rate: number): string {
  const fixed = rate.toFixed(2);
  return fixed.replace(/\.?0+$/, '');
}

function hasLease(o: Offer): boolean {
  return (
    o.leasePayment !== null &&
    o.leaseTerm !== null &&
    o.leaseMiles !== null &&
    o.dueAtSigning !== null
  );
}

function hasFinance(o: Offer): boolean {
  return (
    o.offerType === 'Finance' &&
    ((o.aprRate != null && o.aprTermMonths != null) ||
      (o.financeRates != null &&
        Array.isArray(o.financeRates) &&
        (o.financeRates as unknown[]).length > 0))
  );
}

/**
 * Renders a single vehicle offer card as HTML. Reusable outside the Emails section
 * (e.g. landing page, admin preview, parcel.io blocks). Default output is
 * parcel.io- and caniemail.org-compliant for email use.
 */
export function renderOfferCardHtml(
  offer: Offer,
  options: RenderOfferCardOptions
): string {
  return renderVehicleCardHtml([offer], options);
}

/**
 * Renders one card per vehicle from a group of offers (same condition/year/make/model).
 * Lease block is left, Finance block right, Buy block when applicable. Trim is not shown.
 * Uses placeholder image when no vehicle image URL is available.
 */
export function renderVehicleCardHtml(
  offers: Offer[],
  options: RenderOfferCardOptions
): string {
  if (offers.length === 0) return '';

  const { storeCode, accentColor: accent = '#EB0A1E', brand, certifiedYearsLabel } = options;
  const leaseOffer = offers.find(hasLease);
  const titleOffer = leaseOffer ?? offers[0];
  const financeOffer = offers.find(hasFinance);
  const financeApr = financeOffer ? getFinanceApr(financeOffer) : null;
  const buyOffer =
    offers.find(
      (o) =>
        (o.discount != null && o.discount > 0) || (o.buyFor != null && o.buyFor > 0)
    ) ?? offers[0];

  const inventoryUrl = resolveOfferCtaHref(getInventoryUrlForStore(titleOffer, storeCode) || null);
  const vehicleTitle = escapeHtml(formatVehicleTitle(titleOffer));

  const resolvedImageUrl = safeHrefUrl(
    getImageUrlForOffer(titleOffer) || VEHICLE_PLACEHOLDER_IMAGE_URL,
    VEHICLE_PLACEHOLDER_IMAGE_URL,
  );
  const styles = getBrandStyles(brand, accent);

  const imageHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;border-collapse:collapse!important;margin:0!important;padding:0!important;font-family:Arial,Helvetica,sans-serif!important;">
  <tr style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif!important;">
    <td align="center" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;padding:10px 10px 0 10px;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;font-family:Arial,Helvetica,sans-serif!important;box-sizing:border-box!important;">
      <a href="${escapeHtml(inventoryUrl)}" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;text-decoration:none;color:inherit;display:block;font-family:Arial,Helvetica,sans-serif!important;">
        <img src="${escapeHtml(resolvedImageUrl)}" alt="${vehicleTitle}" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;-ms-interpolation-mode:bicubic;outline:none;text-decoration:none;display:block;width:100%;max-width:260px;height:auto;border:0;margin:0 auto;padding:0;font-family:Arial,Helvetica,sans-serif!important;vertical-align:bottom;">
      </a>
    </td>
  </tr>
</table>`;

  const leaseHtml = leaseOffer
    ? `<tr style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif!important;">
  <td style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;padding:10px;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;font-family:Arial,Helvetica,sans-serif!important;box-sizing:border-box!important;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;border-collapse:collapse!important;font-family:Arial,Helvetica,sans-serif!important;">
      <tr style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif!important;">
        <td valign="middle" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;font-family:Arial,Helvetica,sans-serif!important;box-sizing:border-box!important;">
          <span style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;display:inline-block;padding:4px 8px;font-size:11px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;border-radius:${styles.pillBorderRadius};background:${styles.leasePillBackground};color:${styles.leasePillColor};border:1px solid ${styles.leasePillBorderColor};white-space:nowrap;font-family:Arial,Helvetica,sans-serif!important;">Lease</span>
        </td>
        <td valign="middle" align="right" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;font-family:Arial,Helvetica,sans-serif!important;box-sizing:border-box!important;">
          <div style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-size:22px;font-weight:700;line-height:1;color:${styles.textColor};font-family:Arial,Helvetica,sans-serif!important;">${formatCurrency(
            Number(leaseOffer.leasePayment!)
          )}<span style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-size:12px;font-weight:400;color:#444;white-space:nowrap;font-family:Arial,Helvetica,sans-serif!important;">/mo</span></div>
        </td>
      </tr>
      <tr style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif!important;">
        <td colspan="2" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;padding-top:4px;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;font-size:12px;color:${styles.mutedColor};line-height:1.35;font-family:Arial,Helvetica,sans-serif!important;box-sizing:border-box!important;">
          <span style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;white-space:nowrap;font-family:Arial,Helvetica,sans-serif!important;">${leaseOffer.leaseTerm} mo · ${formatLeaseMiles(
            leaseOffer.leaseMiles!
          )} mi/yr</span><br style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif!important;">
          <span style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;white-space:nowrap;font-family:Arial,Helvetica,sans-serif!important;">${formatCurrency(
            Number(leaseOffer.dueAtSigning!)
          )} due at signing</span>
        </td>
      </tr>
    </table>
  </td>
</tr>`
    : '';

  const financeHtml =
    financeOffer && financeApr
      ? `<tr style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif!important;">
  <td style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;padding:10px;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;font-family:Arial,Helvetica,sans-serif!important;box-sizing:border-box!important;border-top:1px solid ${styles.cardBorderColor};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;border-collapse:collapse!important;font-family:Arial,Helvetica,sans-serif!important;">
      <tr style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif!important;">
        <td valign="middle" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;font-family:Arial,Helvetica,sans-serif!important;box-sizing:border-box!important;">
          <span style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;display:inline-block;padding:4px 8px;font-size:11px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;border-radius:${styles.pillBorderRadius};background:${styles.financePillBackground};color:${styles.financePillColor};border:1px solid ${styles.financePillBorderColor};white-space:nowrap;font-family:Arial,Helvetica,sans-serif!important;">Finance</span>
        </td>
        <td valign="middle" align="right" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;font-family:Arial,Helvetica,sans-serif!important;box-sizing:border-box!important;">
          <div style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-size:22px;font-weight:700;line-height:1;color:${styles.textColor};font-family:Arial,Helvetica,sans-serif!important;">${formatAprCompact(
            Number(financeApr.aprRate)
          )}%<span style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-size:12px;font-weight:400;color:#444;white-space:nowrap;font-family:Arial,Helvetica,sans-serif!important;"> APR</span></div>
        </td>
      </tr>
      <tr style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif!important;">
        <td colspan="2" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;padding-top:4px;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;font-size:12px;color:${styles.mutedColor};line-height:1.35;font-family:Arial,Helvetica,sans-serif!important;box-sizing:border-box!important;">
          up to ${financeApr.aprTermMonths} months
        </td>
      </tr>
    </table>
  </td>
</tr>`
      : '';

  const hasDiscount =
    buyOffer.discount != null &&
    buyOffer.discount !== undefined &&
    Number(buyOffer.discount) > 0;
  const buyFor = Number(buyOffer.buyFor) || 0;
  const msrp = Number(buyOffer.msrp) || 0;
  const discount = Number(buyOffer.discount) || 0;

  let buyHtml = '';
  if (hasDiscount) {
    buyHtml = `<tr style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif!important;">
  <td style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;padding:10px;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;font-family:Arial,Helvetica,sans-serif!important;box-sizing:border-box!important;border-top:1px solid ${styles.cardBorderColor};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;border-collapse:collapse!important;font-family:Arial,Helvetica,sans-serif!important;">
      <tr style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif!important;">
        <td valign="middle" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;font-family:Arial,Helvetica,sans-serif!important;box-sizing:border-box!important;">
          <span style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;display:inline-block;padding:4px 8px;font-size:11px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;border-radius:${styles.pillBorderRadius};background:${styles.buyPillBackground};color:${styles.buyPillColor};border:1px solid ${styles.buyPillBorderColor};white-space:nowrap;font-family:Arial,Helvetica,sans-serif!important;">Buy</span>
        </td>
      </tr>
      <tr style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif!important;">
        <td style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;padding-top:4px;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;font-size:12px;color:${styles.mutedColor};line-height:1.3;font-family:Arial,Helvetica,sans-serif!important;box-sizing:border-box!important;">
          MSRP ${formatCurrency(msrp)}<br style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif!important;">
          Dealer Discount: <span style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;color:${accent};font-weight:700;white-space:nowrap;font-family:Arial,Helvetica,sans-serif!important;">−${formatCurrency(
            discount
          )}</span><br style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif!important;">
          <span style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-weight:600;font-family:Arial,Helvetica,sans-serif!important;">${getBuyPriceLabel()}</span>
        </td>
      </tr>
      <tr style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif!important;">
        <td style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;padding-top:4px;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;font-family:Arial,Helvetica,sans-serif!important;box-sizing:border-box!important;">
          <div style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-size:22px;font-weight:700;line-height:1;color:${accent};font-family:Arial,Helvetica,sans-serif!important;">${formatCurrency(
            buyFor
          )}</div>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
  } else if (buyOffer.buyFor) {
    buyHtml = `<tr style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif!important;">
  <td style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;padding:10px;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;font-family:Arial,Helvetica,sans-serif!important;box-sizing:border-box!important;border-top:1px solid ${styles.cardBorderColor};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;border-collapse:collapse!important;font-family:Arial,Helvetica,sans-serif!important;">
      <tr style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif!important;">
        <td valign="middle" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;font-family:Arial,Helvetica,sans-serif!important;box-sizing:border-box!important;">
          <span style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;display:inline-block;padding:4px 8px;font-size:11px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;border-radius:${styles.pillBorderRadius};background:${styles.buyPillBackground};color:${styles.buyPillColor};border:1px solid ${styles.buyPillBorderColor};white-space:nowrap;font-family:Arial,Helvetica,sans-serif!important;">Buy</span>
        </td>
      </tr>
      <tr style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif!important;">
        <td style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;padding-top:4px;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;font-size:12px;color:${styles.mutedColor};line-height:1.3;font-family:Arial,Helvetica,sans-serif!important;box-sizing:border-box!important;">
          <span style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-weight:600;font-family:Arial,Helvetica,sans-serif!important;">${getBuyPriceLabel()}</span>
        </td>
      </tr>
      <tr style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif!important;">
        <td style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;padding-top:4px;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;font-family:Arial,Helvetica,sans-serif!important;box-sizing:border-box!important;">
          <div style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-size:22px;font-weight:700;line-height:1;color:${accent};font-family:Arial,Helvetica,sans-serif!important;">${formatCurrency(
            buyFor
          )}</div>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
  }

  return `<tr style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;">
    <td style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;padding:0 0 8px 0;border-top:0 solid #e5e5e5;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;">
      <table role="presentation" width="100%!important" cellpadding="0" cellspacing="0" border="0" class="veh-card" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;border:1px solid ${styles.cardBorderColor};border-radius:${styles.cardBorderRadius};background-color:${styles.cardBackground};mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;margin:0!important;padding:0!important;box-sizing:border-box!important;font-family:Arial,Helvetica,sans-serif!important;width:100%!important;max-width:100%!important;border-collapse:separate!important;border-spacing:0!important;table-layout:fixed!important;">
        <tr style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif!important;">
          <td style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;padding:0;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;font-family:Arial,Helvetica,sans-serif!important;box-sizing:border-box!important;color:${styles.textColor};">
            ${imageHtml}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;border-collapse:collapse!important;margin:0!important;padding:10px!important;font-family:Arial,Helvetica,sans-serif!important;">
              <tr class="veh-title-row" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif!important;">
                <td valign="baseline" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;font-family:Arial,Helvetica,sans-serif!important;box-sizing:border-box!important;">
                  <a href="${inventoryUrl}" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;text-decoration:none;color:inherit;display:block;font-family:Arial,Helvetica,sans-serif!important;">
                    <div class="veh-title" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-weight:700;line-height:1.2;color:${styles.textColor};margin:0 10px 10px;font-family:Arial,Helvetica,sans-serif!important;">
                      <span style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-size:16px;font-family:Arial,Helvetica,sans-serif!important;">${vehicleTitle}</span>
                    </div>
                  </a>
                </td>
              </tr>
            </table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;border-collapse:collapse!important;margin:0!important;padding:10px!important;font-family:Arial,Helvetica,sans-serif!important;">
              <tbody>
                ${leaseHtml}
                ${financeHtml}
                ${buyHtml}
              </tbody>
            </table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;border-collapse:collapse!important;margin:0!important;padding:10px!important;font-family:Arial,Helvetica,sans-serif!important;">
              <tr style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif!important;">
                <td align="center" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;padding:8px 0;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;font-family:Arial,Helvetica,sans-serif!important;box-sizing:border-box!important;">
                  <a href="${inventoryUrl}" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;text-decoration:none;display:inline-block;font-size:13px;font-weight:700;line-height:1.1;border-radius:999px;padding:9px 14px;background:${styles.ctaBackground};color:${styles.ctaColor};border:1px solid ${styles.ctaBorderColor};font-family:Arial,Helvetica,sans-serif!important;">
                    View Inventory
                  </a>
                </td>
              </tr>
              ${
                certifiedYearsLabel
                  ? `<tr style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;font-family:Arial,Helvetica,sans-serif!important;">
                <td style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;padding-top:6px;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;font-size:10px;color:${styles.mutedColor};line-height:1.4;font-family:Arial,Helvetica,sans-serif!important;box-sizing:border-box!important;">
                  Qualifying Certified Model Years: ${certifiedYearsLabel}.
                </td>
              </tr>`
                  : ''
              }
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}
