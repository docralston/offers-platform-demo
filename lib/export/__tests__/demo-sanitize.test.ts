import {
  findForbiddenMatches,
  sanitizeText,
  shouldVerifySanitizedFile,
} from '@/lib/export/demo-sanitize';

describe('demo-sanitize', () => {
  it('replaces Thompson URLs and names', () => {
    const input =
      'Visit https://www.thompsonbmw.com/specials and Thompson BMW of Doylestown.';
    const out = sanitizeText(input);
    expect(out).toContain('bmw-of-demotown.example.com');
    expect(out).toContain('BMW of Demotown');
    expect(out).not.toMatch(/thompson/i);
  });

  it('replaces production R2 host and local geography', () => {
    const out = sanitizeText(
      'https://pub-bf1b69979e0f457d8c14aa333b7b4a2f.r2.dev/x in Bucks County near Chalfont',
    );
    expect(out).toContain('demo-assets.example.com');
    expect(out).toContain('Demo County');
    expect(out).toContain('Greenfield');
    expect(findForbiddenMatches(out)).toEqual([]);
  });

  it('normalizes escaped banner display names in source text', () => {
    const out = sanitizeText("TOY: 'Thompson Toyota\\nDoylestown',");
    expect(out).toContain("Toyota of Demotown");
    expect(out).not.toMatch(/Doylestown/i);
  });

  it('flags forbidden strings after sanitize', () => {
    const clean = sanitizeText('Toyota of Demotown at 555-0100');
    expect(findForbiddenMatches(clean)).toEqual([]);
    expect(findForbiddenMatches('still has thompsonbmw.com')).not.toEqual([]);
  });

  it('skips verification for test fixtures', () => {
    expect(shouldVerifySanitizedFile('lib/export/__tests__/demo-sanitize.test.ts')).toBe(false);
    expect(shouldVerifySanitizedFile('lib/config/store-display.ts')).toBe(true);
  });
});
