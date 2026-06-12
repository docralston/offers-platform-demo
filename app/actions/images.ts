'use server';

import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { groupOffersForCards } from '@/lib/domain/card-groups';
import {
  renderOfferImageBannerHtml,
} from '@/lib/renderers/offer-image-banners';
import {
  resolveBannerSize,
  type BannerLayoutMode,
  getBannerLayoutMode,
  type BannerPreset,
  GOOGLE_BANNER_PRESETS,
} from '@/lib/renderers/offer-image-banners-shared';
import type { BannerThemeId } from '@/lib/renderers/banner-theme-policy';
import type { SpecialsBrand } from '@/lib/renderers/specials-shared';
import { renderHtmlToWebpBuffer } from '@/lib/images/export-webp';
import { slugify } from '@/lib/model-page-generator/slug';
import { validateBannerCompatibility } from '@/lib/renderers/banner-compatibility';

export type OfferImageRequest = {
  brand: SpecialsBrand;
  storeCode: string;
  offerIds: string[];
  orderedGroupKeys?: string[];
  presetId?: string;
  customWidth?: number;
  customHeight?: number;
  includeDisclaimer?: boolean;
  ctaText?: string;
  themeId?: BannerThemeId;
  quality?: number;
};

export type OfferImageItem = {
  groupKey: string;
  filename: string;
  width: number;
  height: number;
  layout: BannerLayoutMode;
  webpBase64: string;
};

export type OfferImagesResult =
  | {
      success: true;
      data: {
        presetOptions: BannerPreset[];
        files: OfferImageItem[];
      };
    }
  | { success: false; errors: Array<{ message: string }> };

function orderOffersByGroupKeys<T extends { groupKey: string; offers: any[] }>(
  groups: T[],
  orderedGroupKeys?: string[]
) {
  if (!orderedGroupKeys?.length) return groups;
  const groupsByKey = new Map(groups.map((g) => [g.groupKey, g]));
  const used = new Set<string>();
  const ordered: T[] = [];
  for (const key of orderedGroupKeys) {
    const group = groupsByKey.get(key);
    if (group && !used.has(key)) {
      ordered.push(group);
      used.add(key);
    }
  }
  for (const group of groups) {
    if (!used.has(group.groupKey)) ordered.push(group);
  }
  return ordered;
}

export async function generateOfferImages(input: OfferImageRequest): Promise<OfferImagesResult> {
  try {
    await requireAdmin();
    if (!input.brand || !input.storeCode || input.offerIds.length === 0) {
      return { success: false, errors: [{ message: 'Brand, store, and selected offers are required.' }] };
    }

    const offers = await prisma.offer.findMany({
      where: { id: { in: input.offerIds } },
      orderBy: [{ model: 'asc' }, { trim: 'asc' }],
    });
    if (!offers.length) return { success: false, errors: [{ message: 'No offers found for selected IDs.' }] };

    const size = resolveBannerSize(input.presetId, input.customWidth, input.customHeight);
    const groups = groupOffersForCards(offers, input.storeCode, input.brand);

    const compatibility = validateBannerCompatibility({
      width: size.width,
      height: size.height,
      groups: groups.map((g) => ({
        groupKey: g.groupKey,
        title: g.title,
        offers: g.offers,
      })),
    });
    if (!compatibility.ok) {
      return { success: false, errors: [{ message: compatibility.message }] };
    }
    const orderedGroups = orderOffersByGroupKeys(groups, input.orderedGroupKeys);

    const files: OfferImageItem[] = [];
    for (const group of orderedGroups) {
      const html = renderOfferImageBannerHtml({
        offers: group.offers as any[],
        storeCode: input.storeCode,
        brand: input.brand,
        width: size.width,
        height: size.height,
        presetId: input.presetId,
        includeDisclaimer: input.includeDisclaimer ?? true,
        ctaText: input.ctaText || 'Shop Now',
        themeId: input.themeId,
        titleOverride: group.title,
      });
      const webp = await renderHtmlToWebpBuffer({
        html,
        width: size.width,
        height: size.height,
        quality: input.quality,
      });
      const baseName = slugify(group.title || 'offer');
      files.push({
        groupKey: group.groupKey,
        filename: `${input.storeCode.toLowerCase()}-${baseName}-${size.width}x${size.height}.webp`,
        width: size.width,
        height: size.height,
        layout: getBannerLayoutMode(size.width, size.height),
        webpBase64: webp.toString('base64'),
      });
    }

    return { success: true, data: { presetOptions: GOOGLE_BANNER_PRESETS, files } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate images.';
    console.error('generateOfferImages:', error);
    return { success: false, errors: [{ message }] };
  }
}

