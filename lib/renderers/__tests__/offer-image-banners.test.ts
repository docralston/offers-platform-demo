import { describe, expect, test } from 'vitest';
import {
  getBannerLayoutMode,
  renderBannerHtmlFromTemplate,
  renderOfferImageBannerHtml,
  resolveBannerSize,
} from '@/lib/renderers/offer-image-banners';
import { groupOffersForCards } from '@/lib/domain/card-groups';

describe('offer image banner size + layout helpers', () => {
  test('resolves a known preset', () => {
    expect(resolveBannerSize('1080x1080')).toEqual({ width: 1080, height: 1080 });
  });

  test('resolves custom dimensions', () => {
    expect(resolveBannerSize('custom', 1200, 628)).toEqual({ width: 1200, height: 628 });
  });

  test('selects layout mode from ratio', () => {
    expect(getBannerLayoutMode(1200, 628)).toBe('landscape');
    expect(getBannerLayoutMode(1080, 1080)).toBe('square');
    expect(getBannerLayoutMode(300, 600)).toBe('portrait');
  });
});

describe('offer image banner rendering', () => {
  const lease = {
    id: 'lease-1',
    storeCode: 'TOY',
    condition: 'NEW',
    year: 2026,
    make: 'Toyota',
    model: 'Camry',
    trim: 'SE',
    offerType: 'Lease',
    leasePayment: 299,
    leaseTerm: 36,
    leaseMiles: 10000,
    dueAtSigning: 3999,
    endDate: new Date('2026-05-01'),
    msrp: 33120,
  } as any;

  const finance = {
    id: 'fin-1',
    storeCode: 'TOY',
    condition: 'NEW',
    year: 2026,
    make: 'Toyota',
    model: 'Camry',
    trim: 'SE',
    offerType: 'Finance',
    aprRate: 2.99,
    aprTermMonths: 60,
    endDate: new Date('2026-05-01'),
    msrp: 33120,
  } as any;

  test('renders single card with lease + finance block and custom CTA', () => {
    const groups = groupOffersForCards([lease, finance], 'TOY', 'toyota');
    expect(groups).toHaveLength(1);

    const html = renderOfferImageBannerHtml({
      offers: groups[0].offers as any[],
      storeCode: 'TOY',
      brand: 'toyota',
      width: 1080,
      height: 1080,
      includeDisclaimer: true,
      ctaText: 'View Offers',
      titleOverride: groups[0].title,
    });

    expect(html).toContain('View Offers');
    expect(html).toContain('Lease');
    expect(html).toContain('Finance');
    expect(html).toContain('class="legal"');
    expect(html).toMatch(/doc fee|Tier 1/i);
  });

  test('uses phase-1 preset template for 728x90', () => {
    const html = renderOfferImageBannerHtml({
      offers: [lease, finance] as any[],
      storeCode: 'TOY',
      brand: 'toyota',
      width: 728,
      height: 90,
      presetId: '728x90',
      includeDisclaimer: true,
      ctaText: 'Shop Now',
      titleOverride: '2026 Toyota Camry',
    });
    expect(html).toContain('banner--728x90');
  });

  test('strips disclaimer for ineligible size even when user opts in', () => {
    const html = renderOfferImageBannerHtml({
      offers: [lease, finance] as any[],
      storeCode: 'TOY',
      brand: 'toyota',
      width: 320,
      height: 50,
      presetId: '320x50',
      includeDisclaimer: true,
      ctaText: 'Shop Now',
      titleOverride: '2026 Toyota Camry',
    });
    expect(html).toContain('banner--320x50');
    expect(html).toContain('style="display:none"');
  });

  test('omits disclaimer when disabled', () => {
    const html = renderOfferImageBannerHtml({
      offers: [lease, finance] as any[],
      storeCode: 'TOY',
      brand: 'toyota',
      width: 1200,
      height: 628,
      includeDisclaimer: false,
      ctaText: 'Shop Now',
      titleOverride: '2026 Toyota Camry',
    });
    expect(html).toContain('style="display:none"');
  });

  test('replaces template placeholders with values', () => {
    const html = renderBannerHtmlFromTemplate('<div {disclaimer-style} {vehicle-style}>{title} | {msrp} | {cta} | {unknown}</div>', {
      width: 300,
      height: 250,
      layout: 'landscape',
      brand: 'toyota',
      storeCode: 'TOY',
      storeName: 'Toyota of Demotown',
      vars: '--bg:#fff;',
      vehicleImage: 'https://example.com/car.png',
      title: '2026 Toyota Camry',
      msrpLabel: 'MSRP $33,120',
      offersHtml: '<div>offers</div>',
      leaseHtml: '<div>lease</div>',
      financeHtml: '<div>finance</div>',
      cta: 'Shop Now',
      disclaimer: 'Ends soon',
      disclaimerStyle: 'style="display:none"',
      vehicleStyle: 'style="display:none"',
      bannerExtraClass: ' banner--no-vehicle',
    });
    expect(html).toContain('2026 Toyota Camry');
    expect(html).toContain('MSRP $33,120');
    expect(html).toContain('Shop Now');
    expect(html).toContain('style="display:none"');
    expect(html).toContain('{unknown}');
  });
});

