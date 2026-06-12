import { Offer } from '@prisma/client';
import { getStoreConfig } from '@/lib/config/stores.server';
import { formatLeaseMiles, formatVehicleTitle } from '@/lib/domain/offer-type';
import { getInventoryUrlForStore, getImageUrlForOffer } from '@/lib/domain/offer-assets';
import { isDemoMode } from '@/lib/config/demo';
import { isSafeHttpsUrl, resolveOfferCtaHref, safeHrefUrl } from '@/lib/domain/safe-url';
import { escapeHtml } from '@/lib/renderers/specials-shared';
import { getBuyPriceLabel } from '@/lib/config/store-display';

/**
 * Renders landing page HTML using modelpager template structure
 * Based on lab/modelpager/templates/model-year-fullwidth.html
 */
export function renderLandingPageHtml(offers: Offer[], storeCode: string): string {
  const storeConfig = getStoreConfig(storeCode as any);
  const accentColor = storeConfig?.branding?.accentColor || '#EB0A1E';

  // Generate HTML for each offer as a card
  const offerCards = offers.map(offer => renderOfferCard(offer, accentColor, storeCode)).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Current Offers - ${escapeHtml(storeConfig?.dealerName || storeCode)}</title>
  <style>
    .tto-scope {
      all: initial;
      display: block;
      --tto-accent: ${accentColor};
      --tto-ink: #111827;
      --tto-black: #000000;
      --tto-muted: #6b7280;
      --tto-bg: #ffffff;
      --tto-surface: #f3f4f6;
      --tto-line: rgba(17, 24, 39, .12);
      --tto-shadow: 0 10px 26px rgba(0, 0, 0, .10);
      --tto-radius: 12px;
      --tto-font: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      font-family: var(--tto-font);
      color: var(--tto-ink);
      background: var(--tto-bg);
    }
    .tto-scope * { box-sizing: border-box; }
    .tto-page { max-width: 1120px; margin: 0 auto; padding: 18px 18px 34px; }
    .tto-card {
      background: var(--tto-bg);
      border: 1px solid var(--tto-line);
      border-radius: 10px;
      box-shadow: 0 1px 0 rgba(0, 0, 0, .03);
      padding: 18px;
      margin-bottom: 18px;
    }
    .tto-h2 { font-size: 22px; line-height: 1.2; margin-bottom: 12px; }
    .offer-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 18px; }
    @media (max-width: 680px) {
      .offer-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <section class="tto-scope">
    <div class="tto-page">
      <h1 class="tto-h2">Current Offers</h1>
      <div class="offer-grid">
        ${offerCards}
      </div>
    </div>
  </section>
</body>
</html>`;
}

function renderOfferCard(offer: Offer, accentColor: string, storeCode: string): string {
  const hasLease = offer.leasePayment !== null && offer.leaseTerm !== null &&
                   offer.leaseMiles !== null && offer.dueAtSigning !== null;
  const hasDiscount = offer.discount !== null && offer.discount !== undefined && offer.discount > 0;
  const rawInventoryUrl = getInventoryUrlForStore(offer, storeCode);
  const inventoryUrl = resolveOfferCtaHref(rawInventoryUrl);
  const showInventoryLink = isDemoMode() || isSafeHttpsUrl(rawInventoryUrl ?? undefined);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);
  };

  const vehicleTitle = escapeHtml(formatVehicleTitle(offer));
  const imageUrl = safeHrefUrl(getImageUrlForOffer(offer), '');
  return `<div class="tto-card">
    <h2 class="tto-h2">${vehicleTitle}</h2>
    ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="${vehicleTitle}" style="width: 100%; height: auto; margin-bottom: 12px;" />` : ''}
    ${hasLease ? `
      <div style="margin-bottom: 12px;">
        <strong>Lease:</strong> ${formatCurrency(offer.leasePayment!)}/mo. for ${offer.leaseTerm} mo., ${formatLeaseMiles(offer.leaseMiles!)} mi/yr<br/>
        Due at signing: ${formatCurrency(offer.dueAtSigning!)}
      </div>
    ` : ''}
    ${offer.buyFor ? `
      <div>
        ${hasDiscount ? `<div>MSRP: ${formatCurrency(offer.msrp!)}</div><div>Discount: ${formatCurrency(offer.discount!)}</div>` : ''}
        <div style="color: ${accentColor}; font-weight: 700; font-size: 20px;">${getBuyPriceLabel()}: ${formatCurrency(offer.buyFor)}</div>
      </div>
    ` : ''}
    ${showInventoryLink ? `<a href="${escapeHtml(inventoryUrl)}" style="color: ${accentColor}; text-decoration: underline; margin-top: 12px; display: inline-block;">View Inventory</a>` : ''}
  </div>`;
}
