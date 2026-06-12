/**
 * One-shot generator for public/demo/assets placeholder WebP files.
 * Run: npx tsx scripts/generate-demo-assets.ts
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const OUT = path.join(process.cwd(), 'public/demo/assets');
const DEMO_YEAR = 2026;

const FILES = [
  'toyota/camry.webp',
  'toyota/rav4.webp',
  'toyota/tacoma.webp',
  'toyota/corolla.webp',
  'bmw/x3.webp',
  'bmw/3-series.webp',
  'bmw/x5.webp',
  'lexus/rx.webp',
  'lexus/es.webp',
  'lexus/nx.webp',
  'lexus/is.webp',
  'placeholder/vehicle-placeholder.webp',
].map((rel) => {
  if (rel.startsWith('placeholder/')) return rel;
  const [brand, file] = rel.split('/');
  return `${brand}/${DEMO_YEAR}/${file}`;
});

const COLORS: Record<string, string> = {
  toyota: '#EB0A1E',
  bmw: '#0066B1',
  lexus: '#1A1A1A',
  placeholder: '#9CA3AF',
};

async function main() {
  for (const rel of FILES) {
    const brand = rel.split('/')[0] ?? 'placeholder';
    const color = COLORS[brand] ?? '#6B7280';
    const dest = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    await sharp({
      create: {
        width: 640,
        height: 360,
        channels: 3,
        background: color,
      },
    })
      .webp({ quality: 80 })
      .toFile(dest);
    console.log('Wrote', rel);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
