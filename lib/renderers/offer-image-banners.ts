import type { Offer } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  GOOGLE_BANNER_PRESETS,
  getBannerLayoutMode,
  resolveBannerSize,
  type BannerLayoutMode,
} from '@/lib/renderers/offer-image-banners-shared';
import { effectiveShowDisclaimer, showVehicleColumn } from '@/lib/renderers/banner-size-policy';
import { getBannerThemeCssVariables, type BannerThemeId } from '@/lib/renderers/banner-theme-policy';
import {
  buildFineprint,
  escapeHtml,
  formatCurrency,
  getBrandCssVariables,
  renderOfferBlocks,
  resolveCardBasics,
  type SpecialsBrand,
} from '@/lib/renderers/specials-shared';
import { getStoreBannerDisplayName } from '@/lib/config/store-display';
import { bannerScaleCssVariables, computeBannerScale } from '@/lib/renderers/banner-scale';
export { effectiveShowDisclaimer, isDisclaimerEligible, showVehicleColumn } from '@/lib/renderers/banner-size-policy';
export { GOOGLE_BANNER_PRESETS, getBannerLayoutMode, resolveBannerSize };
export type { BannerLayoutMode };

type BannerRenderInput = {
  offers: Offer[];
  storeCode: string;
  brand: SpecialsBrand;
  width: number;
  height: number;
  presetId?: string;
  includeDisclaimer: boolean;
  ctaText?: string;
  titleOverride?: string | null;
  themeId?: BannerThemeId;
};

const TEMPLATE_DIR = path.join(process.cwd(), 'lib', 'renderers', 'banner-templates');
const SAFE_TEMPLATE_NAME = /^[a-z0-9-]+$/i;

export type BannerTemplateModel = {
  width: number;
  height: number;
  layout: BannerLayoutMode;
  brand: SpecialsBrand;
  storeCode: string;
  storeName: string;
  vars: string;
  vehicleImage: string;
  title: string;
  msrpLabel: string;
  offersHtml: string;
  leaseHtml: string;
  financeHtml: string;
  cta: string;
  disclaimer: string;
  disclaimerStyle: string;
  /** Empty or `style="display:none"` for `.media` when the vehicle column is omitted by policy. */
  vehicleStyle: string;
  /** Empty or ` banner--no-vehicle` for layout templates that adjust grid when `.media` is hidden. */
  bannerExtraClass: string;
};

function getStoreDisplayName(storeCode: string): string {
  return getStoreBannerDisplayName(storeCode);
}

function tryReadTemplate(name: string): string | null {
  if (!SAFE_TEMPLATE_NAME.test(name)) return null;
  const filePath = path.join(TEMPLATE_DIR, `${name}.html`);
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, 'utf8');
}

function findTemplateSource(
  presetId: string | undefined,
  width: number,
  height: number,
  layout: BannerLayoutMode
): { name: string; html: string } | null {
  const candidates = [
    presetId && SAFE_TEMPLATE_NAME.test(presetId) ? presetId : null,
    `${width}x${height}`,
    `layout-${layout}`,
  ].filter((item): item is string => Boolean(item));
  for (const candidate of candidates) {
    const html = tryReadTemplate(candidate);
    if (html) return { name: candidate, html };
  }
  return null;
}

export function renderBannerHtmlFromTemplate(templateHtml: string, model: BannerTemplateModel): string {
  const replacements: Record<string, string> = {
    'brand-css-vars': model.vars,
    width: String(model.width),
    height: String(model.height),
    layout: model.layout,
    brand: model.brand,
    'store-code': escapeHtml(model.storeCode),
    'store-name': escapeHtml(model.storeName),
    'vehicle-image': escapeHtml(model.vehicleImage),
    title: escapeHtml(model.title),
    msrp: escapeHtml(model.msrpLabel),
    offers: model.offersHtml,
    'lease-offer': model.leaseHtml,
    'finance-offer': model.financeHtml,
    cta: escapeHtml(model.cta),
    disclaimer: escapeHtml(model.disclaimer),
    'disclaimer-style': model.disclaimerStyle,
    'vehicle-style': model.vehicleStyle,
    'banner-extra-class': model.bannerExtraClass,
  };
  return templateHtml.replace(/\{([a-z0-9-]+)\}/gi, (full, rawToken) => {
    const token = String(rawToken).toLowerCase();
    return Object.hasOwn(replacements, token) ? replacements[token] : full;
  });
}

export function renderOfferImageBannerHtml(input: BannerRenderInput): string {
  const { offers, storeCode, brand, width, height, includeDisclaimer, titleOverride, presetId } = input;
  const ctaText = (input.ctaText || 'Shop Now').trim() || 'Shop Now';
  const layout = getBannerLayoutMode(width, height);
  const ratio = width / height;
  const bannerScale = computeBannerScale(width, height);
  const { shortBanner, tinyBanner, scale, pad, titleSize, priceSize, fineSize, bodySize, ctaSize } =
    bannerScale;
  const narrowPortrait = ratio <= 0.45;
  const showVehicle = showVehicleColumn(width, height);
  const effectiveDisclaimer = effectiveShowDisclaimer(includeDisclaimer, width, height);
  const vars = `${getBrandCssVariables(brand)} ${getBannerThemeCssVariables(input.themeId)}; ${bannerScaleCssVariables(width, height)}`;

  const { vehicleTitle, imageUrl, msrp } = resolveCardBasics(offers, storeCode, titleOverride);
  const { leaseHtml, financeHtml } = renderOfferBlocks(offers);
  const fineprint = effectiveDisclaimer ? buildFineprint(offers, storeCode, { docFee: 490 }) : '';
  const disclaimerStyle = effectiveDisclaimer ? '' : 'style="display:none"';
  const vehicleStyle = showVehicle ? '' : 'style="display:none"';
  const bannerExtraClass = showVehicle ? '' : ' banner--no-vehicle';

  const templateSource = findTemplateSource(presetId, width, height, layout);
  if (templateSource) {
    const policyVehiclePlaceholders = templateSource.name.startsWith('layout-');
    return renderBannerHtmlFromTemplate(templateSource.html, {
      width,
      height,
      layout,
      brand,
      storeCode,
      storeName: getStoreDisplayName(storeCode),
      vars,
      vehicleImage: imageUrl,
      title: vehicleTitle,
      msrpLabel: msrp != null && msrp > 0 ? `MSRP ${formatCurrency(msrp)}` : '',
      offersHtml: [leaseHtml, financeHtml].filter(Boolean).join(''),
      leaseHtml,
      financeHtml,
      cta: ctaText,
      disclaimer: fineprint,
      disclaimerStyle,
      vehicleStyle: policyVehiclePlaceholders ? vehicleStyle : '',
      bannerExtraClass: policyVehiclePlaceholders ? bannerExtraClass : '',
    });
  }
  const disclaimerLines = effectiveDisclaimer ? (shortBanner ? (tinyBanner ? 1 : 2) : 3) : 0;
  const disclaimerHeight = effectiveDisclaimer
    ? Math.max(
        tinyBanner ? 12 : shortBanner ? 16 : 22,
        Math.round(fineSize * (disclaimerLines + 0.8) + Math.max(4, 6 * scale))
      )
    : 0;
  const bodyHeight = Math.max(10, height - disclaimerHeight);
  const mediaCol = showVehicle ? (shortBanner ? '42%' : layout === 'landscape' ? '46%' : layout === 'portrait' ? '100%' : '50%') : '0';
  const contentCol = showVehicle
    ? shortBanner
      ? '58%'
      : layout === 'landscape'
        ? '54%'
        : layout === 'portrait'
          ? '100%'
          : '50%'
    : '100%';
  const mediaHeight = layout === 'portrait' ? `${Math.round(bodyHeight * (narrowPortrait ? 0.45 : 0.5))}px` : '100%';
  const offerMaxCount = tinyBanner ? 1 : shortBanner ? 2 : 2;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      :root { ${vars} }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        width: ${width}px;
        height: ${height}px;
        overflow: hidden;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
        background: var(--bg);
      }
      .banner {
        width: ${width}px;
        height: ${height}px;
        display: flex;
        flex-direction: column;
        border: 1px solid var(--border);
        overflow: hidden;
        background: var(--bg);
      }
      .banner .body { flex: 1 1 auto; }
      .body {
        display: flex;
        flex-direction: ${layout === 'portrait' ? 'column' : 'row'};
        align-items: stretch;
        flex: 1;
        min-height: ${bodyHeight}px;
        max-height: ${bodyHeight}px;
      }
      .body--solo {
        flex-direction: ${layout === 'portrait' ? 'column' : 'row'};
      }
      .media {
        width: ${mediaCol};
        flex: ${showVehicle ? '0 0 auto' : '0 0 0'};
        height: ${mediaHeight};
        background: linear-gradient(135deg, var(--media-from), var(--media-to));
        display: ${showVehicle ? 'flex' : 'none'};
        align-items: center;
        justify-content: center;
        padding: ${Math.max(tinyBanner ? 2 : 6, Math.round(pad * (shortBanner ? 0.35 : 0.58)))}px;
        overflow: hidden;
      }
      .media img { width: 100%; height: 100%; object-fit: contain; }
      .content {
        width: ${contentCol};
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: ${Math.max(tinyBanner ? 2 : 4, Math.round((shortBanner ? 5 : 10) * scale))}px;
        padding: ${Math.max(tinyBanner ? 4 : 6, Math.round(shortBanner ? pad * 0.5 : pad))}px;
        color: var(--text);
        overflow: hidden;
        justify-content: ${shortBanner ? 'center' : 'flex-start'};
      }
      .title {
        font-size: ${titleSize}px;
        line-height: 1.06;
        margin: 0;
        letter-spacing: -0.01em;
        display: -webkit-box;
        -webkit-line-clamp: ${tinyBanner ? 1 : shortBanner ? 2 : 3};
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .msrp {
        font-size: ${Math.max(tinyBanner ? 7 : shortBanner ? 8 : 11, Math.round((shortBanner ? 10 : 13) * scale))}px;
        color: var(--muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .offers {
        display: grid;
        gap: ${Math.max(tinyBanner ? 1 : 3, Math.round((shortBanner ? 4 : 8) * scale))}px;
      }
      .offer {
        border: 1px solid var(--border);
        padding: ${Math.max(tinyBanner ? 2 : 4, Math.round((shortBanner ? 5 : 10) * scale))}px;
        background: rgba(255,255,255,0.75);
        overflow: hidden;
      }
      .offer-top { display: flex; justify-content: space-between; gap: ${Math.max(6, Math.round(9 * scale))}px; }
      .offer-main { text-align: right; }
      .price { font-size: ${priceSize}px; font-weight: 800; white-space: nowrap; }
      .offer-sub, .offer-sub-line {
        font-size: ${bodySize}px;
        color: var(--muted);
        line-height: 1.2;
        white-space: ${tinyBanner ? 'normal' : 'nowrap'};
      }
      .pill {
        font-size: ${Math.max(tinyBanner ? 7 : 9, Math.round((shortBanner ? 9 : 12) * scale))}px;
        font-weight: 700;
        border: 1px solid;
        padding: ${Math.max(1, Math.round((shortBanner ? 2 : 5) * scale))}px ${Math.max(4, Math.round((shortBanner ? 6 : 9) * scale))}px;
        height: fit-content;
        white-space: nowrap;
      }
      .pill-lease { background: var(--pill-lease-bg); color: var(--pill-lease-fg); border-color: var(--pill-lease-border); }
      .pill-finance { background: var(--pill-finance-bg); color: var(--pill-finance-fg); border-color: var(--pill-finance-border); }
      .footer { margin-top: auto; display: flex; gap: ${Math.max(tinyBanner ? 2 : 5, Math.round((shortBanner ? 4 : 8) * scale))}px; }
      .cta {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: ${Math.max(tinyBanner ? 14 : shortBanner ? 18 : 30, Math.round((shortBanner ? 24 : 42) * scale))}px;
        width: 100%;
        background: var(--cta);
        color: #fff;
        font-weight: 800;
        font-size: ${ctaSize}px;
        white-space: nowrap;
      }
      .fineprint {
        display: ${effectiveDisclaimer ? '-webkit-box' : 'none'};
        font-size: ${fineSize}px;
        line-height: 1.2;
        color: var(--muted);
        text-align: left;
        width: 100%;
        padding: ${Math.max(tinyBanner ? 2 : 4, Math.round(6 * scale))}px ${Math.max(tinyBanner ? 3 : 6, Math.round(shortBanner ? pad * 0.4 : pad))}px;
        border-top: 1px solid var(--border);
        background: rgba(255,255,255,0.8);
        overflow: hidden;
        -webkit-line-clamp: ${disclaimerLines};
        -webkit-box-orient: vertical;
      }
      .offers .offer:nth-child(n + ${offerMaxCount + 1}) {
        display: none;
      }
    </style>
  </head>
  <body>
    <article class="banner">
      <div class="body${showVehicle ? '' : ' body--solo'}">
        ${
          showVehicle
            ? `<div class="media">
          <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(vehicleTitle)}" />
        </div>`
            : ''
        }
        <div class="content">
          <h1 class="title">${escapeHtml(vehicleTitle)}</h1>
          ${msrp != null && msrp > 0 ? `<div class="msrp">MSRP ${formatCurrency(msrp)}</div>` : ''}
          <div class="offers">${[leaseHtml, financeHtml].filter(Boolean).join('')}</div>
          <div class="footer">
            <div class="cta">${escapeHtml(ctaText)}</div>
          </div>
        </div>
      </div>
      <div class="fineprint">${escapeHtml(fineprint)}</div>
    </article>
  </body>
</html>`;
}

