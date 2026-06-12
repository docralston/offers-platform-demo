/**
 * Rules for which banner dimensions support disclaimer text and a vehicle photo column.
 * Safe to import from client components (pure, no Node APIs).
 */

/** Fine print is only shown when the canvas has enough vertical space and isn't a narrow strip. */
export function isDisclaimerEligible(width: number, height: number): boolean {
  if (height <= 100) return false;
  if (height <= 110 && width <= 400) return false;
  const area = width * height;
  if (height < 120 && area < 40_000) return false;
  return true;
}

export function effectiveShowDisclaimer(userOptIn: boolean, width: number, height: number): boolean {
  return userOptIn && isDisclaimerEligible(width, height);
}

/**
 * Generic fallback and layout-* templates omit the vehicle column for micro strips and short leaderboards.
 * Preset-specific HTML files may still show a cropped vehicle if desired.
 */
export function showVehicleColumn(width: number, height: number): boolean {
  if (height <= 70 || width <= 220) return false;
  if (height <= 100) return false;
  return true;
}
