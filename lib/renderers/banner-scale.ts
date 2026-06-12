/** Computed typography/spacing tokens for banner HTML (preset templates + inline fallback). */

export type BannerScale = {
  scale: number;
  pad: number;
  titleSize: number;
  priceSize: number;
  bodySize: number;
  fineSize: number;
  ctaSize: number;
  pillSize: number;
  gap: number;
  tinyBanner: boolean;
  shortBanner: boolean;
};

export function computeBannerScale(width: number, height: number): BannerScale {
  const ratio = width / height;
  const shortBanner = height <= 110 || ratio >= 4.2;
  const tinyBanner = height <= 70 || width <= 220;
  const scale = Math.max(0.62, Math.min(2.2, Math.min(width / 900, height / 500)));

  const titleSize = Math.max(
    tinyBanner ? 10 : shortBanner ? 12 : 14,
    Math.round((shortBanner ? 22 : 34) * scale)
  );
  const priceSize = Math.max(
    tinyBanner ? 11 : shortBanner ? 13 : 14,
    Math.round((shortBanner ? 18 : 28) * scale)
  );
  const bodySize = Math.max(tinyBanner ? 8 : shortBanner ? 9 : 11, Math.round((shortBanner ? 11 : 14) * scale));
  const fineSize = Math.max(tinyBanner ? 6 : shortBanner ? 7 : 9, Math.round((shortBanner ? 9 : 11) * scale));
  const ctaSize = Math.max(tinyBanner ? 8 : shortBanner ? 9 : 11, Math.round((shortBanner ? 11 : 15) * scale));
  const pillSize = Math.max(tinyBanner ? 6 : 8, Math.round((shortBanner ? 8 : 11) * scale));
  const pad = Math.round(Math.max(6, 16 * scale));
  const gap = Math.max(tinyBanner ? 2 : 3, Math.round((shortBanner ? 4 : 8) * scale));

  return {
    scale,
    pad,
    titleSize,
    priceSize,
    bodySize,
    fineSize,
    ctaSize,
    pillSize,
    gap,
    tinyBanner,
    shortBanner,
  };
}

export function bannerScaleCssVariables(width: number, height: number): string {
  const s = computeBannerScale(width, height);
  return [
    `--banner-scale: ${s.scale.toFixed(3)}`,
    `--banner-pad: ${s.pad}px`,
    `--banner-gap: ${s.gap}px`,
    `--banner-title-size: ${s.titleSize}px`,
    `--banner-price-size: ${s.priceSize}px`,
    `--banner-body-size: ${s.bodySize}px`,
    `--banner-fine-size: ${s.fineSize}px`,
    `--banner-cta-size: ${s.ctaSize}px`,
    `--banner-pill-size: ${s.pillSize}px`,
  ].join('; ');
}
