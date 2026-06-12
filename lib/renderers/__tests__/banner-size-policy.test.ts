import { describe, expect, test } from 'vitest';
import {
  effectiveShowDisclaimer,
  isDisclaimerEligible,
  showVehicleColumn,
} from '@/lib/renderers/banner-size-policy';

describe('banner-size-policy', () => {
  test('disclaimer eligibility: micro and leaderboards false; rectangles true', () => {
    expect(isDisclaimerEligible(320, 50)).toBe(false);
    expect(isDisclaimerEligible(728, 90)).toBe(false);
    expect(isDisclaimerEligible(320, 100)).toBe(false);
    expect(isDisclaimerEligible(300, 250)).toBe(true);
    expect(isDisclaimerEligible(1080, 1080)).toBe(true);
  });

  test('effectiveShowDisclaimer respects opt-in and eligibility', () => {
    expect(effectiveShowDisclaimer(true, 300, 250)).toBe(true);
    expect(effectiveShowDisclaimer(false, 300, 250)).toBe(false);
    expect(effectiveShowDisclaimer(true, 320, 50)).toBe(false);
  });

  test('showVehicleColumn false for strips and micro', () => {
    expect(showVehicleColumn(320, 50)).toBe(false);
    expect(showVehicleColumn(728, 90)).toBe(false);
    expect(showVehicleColumn(300, 250)).toBe(true);
  });
});
