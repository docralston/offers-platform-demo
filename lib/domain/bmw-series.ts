/** Infer BMW series from the core model token using BMW of Demotown lineup groupings. */
export function inferBmwSeries(model: string): string | null {
  const m = model.trim();
  if (!m) return null;
  const upper = m.toUpperCase();

  // All BMW "i" models (i3, i4, i5, i7, iX, etc.) are part of the BMW i series.
  if (upper.startsWith('I')) {
    return 'BMW i';
  }

  // M Models: model starts with capital M (M2, M3, M4, M850i, etc.)
  if (/^M[A-Z0-9]/.test(upper)) {
    return 'M Models';
  }

  // Z roadster
  if (upper.startsWith('Z4')) return 'Z4';

  // X SAVs
  if (upper.startsWith('X1')) return 'X1';
  if (upper.startsWith('X2')) return 'X2';
  if (upper.startsWith('X3')) return 'X3';
  if (upper.startsWith('X5')) return 'X5';
  if (upper.startsWith('X7')) return 'X7';

  // Numeric Series (228, 330i, 540i, 740i, 840i, etc.)
  const leadingDigit = m.match(/^(\d)/)?.[1];
  switch (leadingDigit) {
    case '2':
      return '2 Series';
    case '3':
      return '3 Series';
    case '4':
      return '4 Series';
    case '5':
      return '5 Series';
    case '7':
      return '7 Series';
    case '8':
      return '8 Series';
    default:
      return null;
  }
}

