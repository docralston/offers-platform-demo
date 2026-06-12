export type BannerThemeId =
  | 'midnight'
  | 'royal'
  | 'emerald'
  | 'sunset'
  | 'steel'
  | 'graphite'
  | 'arctic'
  | 'plum'
  | 'toyota-specials'
  | 'bmw-specials'
  | 'lexus-specials';

export type BannerThemeOption = {
  id: BannerThemeId;
  label: string;
};

export const BANNER_THEME_OPTIONS: BannerThemeOption[] = [
  { id: 'midnight', label: 'Midnight' },
  { id: 'royal', label: 'Royal Blue' },
  { id: 'emerald', label: 'Emerald' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'steel', label: 'Steel' },
  { id: 'graphite', label: 'Graphite' },
  { id: 'arctic', label: 'Arctic Light' },
  { id: 'plum', label: 'Plum' },
  { id: 'toyota-specials', label: 'Toyota Specials' },
  { id: 'bmw-specials', label: 'BMW Specials' },
  { id: 'lexus-specials', label: 'Lexus Specials' },
];

export function getBannerThemeCssVariables(themeId: BannerThemeId | undefined): string {
  const theme = themeId ?? 'midnight';
  switch (theme) {
    case 'royal':
      return `
        --theme-bg-1: #0b1538;
        --theme-bg-2: #172554;
        --theme-bg-3: #0f172a;
        --theme-panel: rgba(10, 20, 44, 0.72);
        --theme-panel-border: rgba(147, 197, 253, 0.38);
        --theme-copy: rgba(226, 232, 240, 0.9);
        --theme-cta-bg: #f8fafc;
        --theme-cta-fg: #0f172a;
      `.trim();
    case 'emerald':
      return `
        --theme-bg-1: #06291f;
        --theme-bg-2: #064e3b;
        --theme-bg-3: #111827;
        --theme-panel: rgba(5, 40, 30, 0.72);
        --theme-panel-border: rgba(52, 211, 153, 0.35);
        --theme-copy: rgba(220, 252, 231, 0.9);
        --theme-cta-bg: #ecfeff;
        --theme-cta-fg: #052e2b;
      `.trim();
    case 'sunset':
      return `
        --theme-bg-1: #3b0a14;
        --theme-bg-2: #7c2d12;
        --theme-bg-3: #111827;
        --theme-panel: rgba(55, 20, 14, 0.72);
        --theme-panel-border: rgba(251, 146, 60, 0.35);
        --theme-copy: rgba(255, 237, 213, 0.9);
        --theme-cta-bg: #fff7ed;
        --theme-cta-fg: #7c2d12;
      `.trim();
    case 'steel':
      return `
        --theme-bg-1: #1f2937;
        --theme-bg-2: #374151;
        --theme-bg-3: #0f172a;
        --theme-panel: rgba(31, 41, 55, 0.72);
        --theme-panel-border: rgba(148, 163, 184, 0.34);
        --theme-copy: rgba(226, 232, 240, 0.9);
        --theme-cta-bg: #f1f5f9;
        --theme-cta-fg: #111827;
      `.trim();
    case 'graphite':
      return `
        --theme-bg-1: #0f1115;
        --theme-bg-2: #1f2937;
        --theme-bg-3: #111827;
        --theme-panel: rgba(17, 24, 39, 0.72);
        --theme-panel-border: rgba(203, 213, 225, 0.28);
        --theme-copy: rgba(226, 232, 240, 0.92);
        --theme-cta-bg: #e2e8f0;
        --theme-cta-fg: #0f172a;
      `.trim();
    case 'arctic':
      return `
        --theme-bg-1: #e2e8f0;
        --theme-bg-2: #e8edf4;
        --theme-bg-3: #cbd5e1;
        --theme-panel: rgba(255, 255, 255, 0.84);
        --theme-panel-border: rgba(15, 23, 42, 0.16);
        --theme-copy: rgba(15, 23, 42, 0.82);
        --theme-cta-bg: #0f172a;
        --theme-cta-fg: #f8fafc;
        --theme-headline: #0f172a;
        --theme-price: #0f172a;
      `.trim();
    case 'plum':
      return `
        --theme-bg-1: #2d133f;
        --theme-bg-2: #4c1d95;
        --theme-bg-3: #1e1b4b;
        --theme-panel: rgba(56, 23, 109, 0.66);
        --theme-panel-border: rgba(196, 181, 253, 0.36);
        --theme-copy: rgba(237, 233, 254, 0.94);
        --theme-cta-bg: #f5f3ff;
        --theme-cta-fg: #4c1d95;
      `.trim();
    case 'toyota-specials':
      return `
        --theme-bg-1: #f6f7f9;
        --theme-bg-2: #f8fafc;
        --theme-bg-3: #e5e7eb;
        --theme-panel: rgba(255, 255, 255, 0.88);
        --theme-panel-border: rgba(17, 24, 39, 0.14);
        --theme-copy: rgba(55, 65, 81, 0.9);
        --theme-cta-bg: #111827;
        --theme-cta-fg: #ffffff;
        --theme-headline: #111827;
        --theme-price: #111827;
      `.trim();
    case 'bmw-specials':
      return `
        --theme-bg-1: #f5f5f5;
        --theme-bg-2: #f3f4f6;
        --theme-bg-3: #e5e7eb;
        --theme-panel: rgba(255, 255, 255, 0.9);
        --theme-panel-border: rgba(0, 0, 0, 0.15);
        --theme-copy: rgba(31, 41, 55, 0.88);
        --theme-cta-bg: #1d69d3;
        --theme-cta-fg: #ffffff;
        --theme-headline: #111827;
        --theme-price: #111827;
      `.trim();
    case 'lexus-specials':
      return `
        --theme-bg-1: #f5f5f5;
        --theme-bg-2: #f3f4f6;
        --theme-bg-3: #e5e7eb;
        --theme-panel: rgba(255, 255, 255, 0.9);
        --theme-panel-border: rgba(26, 26, 26, 0.12);
        --theme-copy: rgba(55, 65, 81, 0.88);
        --theme-cta-bg: #1a1a1a;
        --theme-cta-fg: #ffffff;
        --theme-headline: #111827;
        --theme-price: #111827;
      `.trim();
    case 'midnight':
    default:
      return `
        --theme-bg-1: #080b14;
        --theme-bg-2: #111827;
        --theme-bg-3: #050608;
        --theme-panel: rgba(7, 11, 17, 0.72);
        --theme-panel-border: rgba(255, 255, 255, 0.16);
        --theme-copy: rgba(248, 250, 252, 0.9);
        --theme-cta-bg: #ffffff;
        --theme-cta-fg: #0f172a;
        --theme-headline: #f8fafc;
        --theme-price: #ffffff;
      `.trim();
  }
}
