import { describe, it, expect } from 'vitest';
import { modelForDisplay, formatVehicleTitle } from '@/lib/domain/offer-type';

describe('modelForDisplay', () => {
  it('strips leading make from model to avoid double brand', () => {
    expect(modelForDisplay('Toyota', 'Toyota Crown')).toBe('Crown');
    expect(modelForDisplay('Toyota', 'Toyota Crown Signia')).toBe('Crown Signia');
  });

  it('strips multiple leading make tokens', () => {
    expect(modelForDisplay('Toyota', 'Toyota Toyota Crown')).toBe('Crown');
  });

  it('returns model as-is when make is not at start', () => {
    expect(modelForDisplay('Toyota', 'Crown')).toBe('Crown');
    expect(modelForDisplay('Toyota', 'Camry')).toBe('Camry');
  });

  it('handles null/empty', () => {
    expect(modelForDisplay(null, 'Crown')).toBe('Crown');
    expect(modelForDisplay('Toyota', null)).toBe('');
    expect(modelForDisplay('', '')).toBe('');
  });
});

describe('formatVehicleTitle', () => {
  it('avoids double brand in title', () => {
    expect(
      formatVehicleTitle({
        condition: 'NEW',
        year: 2026,
        make: 'Toyota',
        model: 'Toyota Crown',
      })
    ).toBe('2026 Toyota Crown');
  });

  it('includes trim when provided', () => {
    expect(
      formatVehicleTitle({
        condition: 'NEW',
        year: 2026,
        make: 'Toyota',
        model: 'Crown',
        trim: 'Limited',
      })
    ).toBe('2026 Toyota Crown Limited');
  });

  it('returns empty string for null or undefined offer', () => {
    expect(formatVehicleTitle(null)).toBe('');
    expect(formatVehicleTitle(undefined)).toBe('');
  });

  it('infers make from model when make is null (avoids "Toyota Toyota Crown")', () => {
    expect(
      formatVehicleTitle({
        condition: 'NEW',
        year: 2026,
        make: null,
        model: 'Toyota Crown',
      })
    ).toBe('2026 Toyota Crown');
  });
});
