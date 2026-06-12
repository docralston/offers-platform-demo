import { Offer } from '@prisma/client';
import { getStoreConfig } from '@/lib/config/stores.server';
import { getCertifiedQualifyingModelYearsLabel } from '@/lib/config/certified-qualifying-years';
import { EmailBrand, renderVehicleCardHtml } from './offer-card';
import { groupOffersForCards } from '@/lib/domain/card-groups';

/**
 * Renders email HTML for vehicle listings. Groups offers by vehicle
 * (storeCode, condition, year, make, model; trim ignored), one card per vehicle
 * with Lease left and Finance right. Uses shared offer card and wraps in a
 * parcel.io-safe, caniemail.org-compliant responsive grid (max 2 cols desktop,
 * single column on mobile).
 */
export function renderEmailHtml(offers: Offer[], storeCode: string): string {
  const storeConfig = getStoreConfig(storeCode as any);
  const accentColor = storeConfig?.branding?.accentColor || '#EB0A1E';

  const brand: EmailBrand =
    storeCode === 'TOY'
      ? 'toyota'
      : storeCode === 'BMW'
      ? 'bmw'
      : 'lexus';

  const cardOptions = { storeCode, accentColor, brand, format: 'email' as const };

  const yearsLabel = getCertifiedQualifyingModelYearsLabel(storeCode) || '';

  const cardGroups = groupOffersForCards(offers, storeCode, brand);

  const cards = cardGroups.map((group) => {
    return renderVehicleCardHtml(group.offers, {
      ...cardOptions,
      certifiedYearsLabel: group.hasCertifiedFinance && yearsLabel ? yearsLabel : undefined,
    });
  });

  // Chunk into rows of 2 for desktop; media query will collapse to 1 column on mobile
  const rows: string[] = [];
  for (let i = 0; i < cards.length; i += 2) {
    const rowCards = cards.slice(i, i + 2);
    const cells = rowCards
      .map(
        (card) =>
          `<td class="veh-grid-cell" width="50%" valign="top" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;padding:8px;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;font-family:Arial,Helvetica,sans-serif!important;box-sizing:border-box!important;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;font-family:Arial,Helvetica,sans-serif!important;">
              <tbody>${card}</tbody>
            </table>
          </td>`
      )
      .join('');
    rows.push(`<tr style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;">${cells}</tr>`);
  }

  const gridTable =
    rows.length > 0
      ? `<style type="text/css">
@media only screen and (max-width:480px), only screen and (max-device-width:480px) {
  .veh-offers-grid .veh-grid-cell {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
  }
}
@media only screen and (max-width:480px), only screen and (max-device-width:480px) {
  u~div .veh-offers-grid .veh-grid-cell {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
  }
}
</style>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="veh-offers-grid" style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;mso-table-lspace:0pt!important;mso-table-rspace:0pt!important;border-collapse:collapse!important;font-family:Arial,Helvetica,sans-serif!important;">
  <tbody>${rows.join('')}</tbody>
</table>`
      : '';

  const hasCertifiedFinance = cardGroups.some((g) => g.hasCertifiedFinance);

  const certifiedSentence =
    hasCertifiedFinance && yearsLabel
      ? `<p style="-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%;margin:8px 0 0 0;font-size:11px;line-height:1.4;color:#666666;font-family:Arial,Helvetica,sans-serif!important;">
  Qualifying Certified Model Years: ${yearsLabel}.
</p>`
      : '';

  return gridTable + certifiedSentence;
}
