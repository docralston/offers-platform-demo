export type BannerPreset = {
  id: string;
  label: string;
  width: number;
  height: number;
};

export const GOOGLE_BANNER_PRESETS: BannerPreset[] = [
  { id: '300x250', label: 'Medium Rectangle', width: 300, height: 250 },
  { id: '336x280', label: 'Large Rectangle', width: 336, height: 280 },
  { id: '728x90', label: 'Leaderboard', width: 728, height: 90 },
  { id: '970x90', label: 'Large Leaderboard', width: 970, height: 90 },
  { id: '970x250', label: 'Billboard', width: 970, height: 250 },
  { id: '300x600', label: 'Half Page', width: 300, height: 600 },
  { id: '160x600', label: 'Wide Skyscraper', width: 160, height: 600 },
  { id: '320x50', label: 'Mobile Leaderboard', width: 320, height: 50 },
  { id: '320x100', label: 'Large Mobile Banner', width: 320, height: 100 },
  { id: '468x60', label: 'Banner', width: 468, height: 60 },
  { id: '250x250', label: 'Square', width: 250, height: 250 },
  { id: '200x200', label: 'Small Square', width: 200, height: 200 },
  { id: '120x600', label: 'Skyscraper', width: 120, height: 600 },
  { id: '1080x1080', label: 'Social Square', width: 1080, height: 1080 },
];

export type BannerLayoutMode = 'landscape' | 'square' | 'portrait';

export function getBannerLayoutMode(width: number, height: number): BannerLayoutMode {
  const ratio = width / height;
  if (ratio >= 1.25) return 'landscape';
  if (ratio <= 0.8) return 'portrait';
  return 'square';
}

export function resolveBannerSize(
  presetId?: string,
  customWidth?: number,
  customHeight?: number
): { width: number; height: number } {
  if (presetId && presetId !== 'custom') {
    const preset = GOOGLE_BANNER_PRESETS.find((p) => p.id === presetId);
    if (!preset) throw new Error('Invalid preset size');
    return { width: preset.width, height: preset.height };
  }
  if (!customWidth || !customHeight) {
    throw new Error('Custom width and height are required');
  }
  if (customWidth < 100 || customHeight < 50 || customWidth > 4000 || customHeight > 4000) {
    throw new Error('Custom width/height out of supported range');
  }
  return { width: Math.round(customWidth), height: Math.round(customHeight) };
}
