import { describe, it, expect } from 'vitest';
import { buildInventoryUrl } from '../offer-assets';

const LEXDT_BASE = 'https://lexus-of-demotown.example.com';

describe('buildInventoryUrl (Lexus inventory slugs)', () => {
  it('uses /new-vehicles/ path for Lexus stores', () => {
    const url = buildInventoryUrl('LEXDT', 'RX');
    expect(url).toBe(`${LEXDT_BASE}/new-vehicles/rx/`);
  });

  it('maps UX variants to /new-vehicles/ux-hybrid/', () => {
    expect(buildInventoryUrl('LEXDT', 'UX')).toBe(`${LEXDT_BASE}/new-vehicles/ux-hybrid/`);
    expect(buildInventoryUrl('LEXDT', 'UX Hybrid')).toBe(
      `${LEXDT_BASE}/new-vehicles/ux-hybrid/`,
    );
    expect(buildInventoryUrl('LEXDT', 'UXh')).toBe(`${LEXDT_BASE}/new-vehicles/ux-hybrid/`);
  });

  it('produces canonical hybrid and PHEV slugs', () => {
    expect(buildInventoryUrl('LEXDT', 'RXh')).toBe(`${LEXDT_BASE}/new-vehicles/rx-hybrid/`);
    expect(buildInventoryUrl('LEXDT', 'NXh')).toBe(`${LEXDT_BASE}/new-vehicles/nx-hybrid/`);
    expect(buildInventoryUrl('LEXDT', 'ESh')).toBe(`${LEXDT_BASE}/new-vehicles/es-hybrid/`);
    expect(buildInventoryUrl('LEXDT', 'NX PHEV')).toBe(`${LEXDT_BASE}/new-vehicles/nx-phev/`);
    expect(buildInventoryUrl('LEXDT', 'TXh')).toBe(`${LEXDT_BASE}/new-vehicles/txh/`);
    expect(buildInventoryUrl('LEXDT', 'TX PHEV')).toBe(`${LEXDT_BASE}/new-vehicles/tx-phev/`);
    expect(buildInventoryUrl('LEXDT', 'LXh')).toBe(`${LEXDT_BASE}/new-vehicles/lxh/`);
  });

  it('covers the full Lexus inventory slug set', () => {
    const cases: Array<[string, string]> = [
      ['RC F', 'rc-f'],
      ['LC', 'lc'],
      ['IS 500', 'is-500'],
      ['RC', 'rc'],
      ['RXh', 'rx-hybrid'],
      ['NXh', 'nx-hybrid'],
      ['RX', 'rx'],
      ['UX Hybrid', 'ux-hybrid'],
      ['GX', 'gx'],
      ['LX', 'lx'],
      ['NX', 'nx'],
      ['RZ', 'rz'],
      ['NX PHEV', 'nx-phev'],
      ['TXh', 'txh'],
      ['TX', 'tx'],
      ['TX PHEV', 'tx-phev'],
      ['LXh', 'lxh'],
      ['LS', 'ls'],
      ['IS', 'is'],
      ['ESh', 'es-hybrid'],
      ['ES', 'es'],
    ];

    for (const [model, slug] of cases) {
      const url = buildInventoryUrl('LEXDT', model);
      expect(url).toBe(`${LEXDT_BASE}/new-vehicles/${slug}/`);
    }
  });
});

