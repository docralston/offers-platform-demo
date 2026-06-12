/**
 * Rules for which banner size + offer selection combinations are likely to render well.
 * Safe to import from client components.
 */

export type BannerCompatibilityOffer = {
  offerType?: string | null;
  leasePayment?: number | null;
  leaseTerm?: number | null;
  leaseMiles?: number | null;
  dueAtSigning?: number | null;
  aprRate?: number | { toString(): string } | null;
  aprTermMonths?: number | null;
  financeRates?: unknown;
};

export type BannerCompatibilityGroup = {
  groupKey: string;
  title?: string;
  offers: BannerCompatibilityOffer[];
};

export type BannerCompatibilityInput = {
  width: number;
  height: number;
  groups: BannerCompatibilityGroup[];
};

export type BannerCompatibilityResult =
  | { ok: true }
  | { ok: false; message: string };

function hasLeaseLike(o: BannerCompatibilityOffer): boolean {
  return (
    o.offerType === 'Lease' ||
    (o.leasePayment != null && o.leaseTerm != null && o.leaseMiles != null && o.dueAtSigning != null)
  );
}

function hasFinanceLike(o: BannerCompatibilityOffer): boolean {
  const rates = o.financeRates;
  const apr = o.aprRate;
  const hasApr = apr != null && apr !== '';
  return (
    o.offerType === 'Finance' ||
    (hasApr && o.aprTermMonths != null) ||
    (Array.isArray(rates) && rates.length > 0)
  );
}

function groupHasLeaseAndFinance(group: BannerCompatibilityGroup): boolean {
  const lease = group.offers.some(hasLeaseLike);
  const finance = group.offers.some(hasFinanceLike);
  return lease && finance;
}

type SizeTier = 'micro' | 'strip' | 'tallNarrow' | 'standard';

function getSizeTier(width: number, height: number): SizeTier {
  if (height <= 70 || width <= 220) return 'micro';
  if (
    (width === 320 && (height === 50 || height === 100)) ||
    (width === 468 && height === 60)
  ) {
    return 'micro';
  }
  if (height <= 90 && width >= 600) return 'strip';
  if (width <= 180 && height >= 500) return 'tallNarrow';
  return 'standard';
}

export function validateBannerCompatibility(input: BannerCompatibilityInput): BannerCompatibilityResult {
  const { width, height, groups } = input;
  if (!groups.length) {
    return { ok: false, message: 'Select at least one offer.' };
  }

  const tier = getSizeTier(width, height);
  const label = `${width}×${height}`;

  if (tier === 'micro') {
    if (groups.length > 1) {
      return {
        ok: false,
        message: `${label} banners support one vehicle card only. Deselect extra models or pick a larger size.`,
      };
    }
    const group = groups[0]!;
    if (groupHasLeaseAndFinance(group)) {
      return {
        ok: false,
        message: `${label} banners cannot show lease and finance together. Deselect one offer type or pick a larger size.`,
      };
    }
    if (group.offers.length > 1) {
      return {
        ok: false,
        message: `${label} banners support one offer only. Deselect extra offers or pick a larger size.`,
      };
    }
    return { ok: true };
  }

  if (tier === 'strip') {
    for (const group of groups) {
      if (groupHasLeaseAndFinance(group)) {
        return {
          ok: false,
          message: `${label} leaderboard banners cannot show lease and finance on the same vehicle. Deselect one offer type or pick a taller size.`,
        };
      }
    }
    return { ok: true };
  }

  if (tier === 'tallNarrow') {
    if (groups.length > 1) {
      return {
        ok: false,
        message: `${label} skyscraper banners work best with one vehicle card. Deselect extra models or pick a wider size.`,
      };
    }
    const group = groups[0]!;
    if (groupHasLeaseAndFinance(group)) {
      return {
        ok: false,
        message: `${label} skyscraper banners cannot show lease and finance together. Deselect one offer type or pick a wider size.`,
      };
    }
    return { ok: true };
  }

  return { ok: true };
}
