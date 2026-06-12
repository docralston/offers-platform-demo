/**
 * One-off script: replace FAQ content in Toyota 2026 model page JSON configs
 * using data from the provided Excel spreadsheet.
 *
 * Usage:
 *   npx tsx scripts/update-toyota-faqs.ts <path-to-xlsx>
 *
 * Example:
 *   npx tsx scripts/update-toyota-faqs.ts ~/Downloads/Demo_Toyota_2026_FAQs_Q5_Added_Per_Model.xlsx
 */

import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';

const CONFIGS_DIR = path.join(
  process.cwd(),
  'lab/modelpager/configs/pages/toyota/2026'
);

// Map Excel model display names → JSON file slugs
const MODEL_TO_SLUG: Record<string, string> = {
  '2026 Toyota 4Runner': '4runner',
  '2026 Toyota bZ': 'bz',
  '2026 Toyota Camry': 'camry',
  '2026 Toyota Corolla': 'corolla',
  '2026 Toyota Corolla Cross': 'corolla-cross',
  '2026 Toyota Corolla Hatchback': 'corolla-hatchback',
  '2026 Toyota Crown': 'crown',
  '2026 Toyota Crown Signia': 'crown-signia',
  '2026 Toyota GR Corolla': 'gr-corolla',
  '2026 Toyota GR Supra': 'gr-supra',
  '2026 Toyota GR86': 'gr86',
  '2026 Toyota Grand Highlander': 'grand-highlander',
  '2026 Toyota Highlander': 'highlander',
  '2026 Toyota Land Cruiser': 'land-cruiser',
  '2026 Toyota Prius': 'prius',
  '2026 Toyota Prius Plug-In Hybrid': 'prius-plug-in-hybrid',
  '2026 Toyota RAV4': 'rav4',
  '2026 Toyota Sequoia': 'sequoia',
  '2026 Toyota Sienna': 'sienna',
  '2026 Toyota Tacoma': 'tacoma',
  '2026 Toyota Tundra': 'tundra',
};

// Variant files that inherit their base-model FAQs
const VARIANT_TO_BASE: Record<string, string> = {
  '4runner-i-force-max': '4runner',
  'corolla-hybrid': 'corolla',
  'corolla-cross-hybrid': 'corolla-cross',
  'highlander-hybrid': 'highlander',
  'grand-highlander-hybrid': 'grand-highlander',
  'tacoma-i-force-max': 'tacoma',
  'tundra-i-force-max': 'tundra',
};

interface Faq {
  q: string;
  a: string;
}

function readFaqsFromExcel(xlsxPath: string): Map<string, Faq[]> {
  const wb = XLSX.readFile(xlsxPath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

  const result = new Map<string, Faq[]>();
  for (const row of rows) {
    const model = String(row['Model'] ?? '').trim();
    const q = String(row['FAQ Question (SEO Enhanced)'] ?? '').trim();
    const a = String(row['FAQ Answer (SEO Enhanced)'] ?? '').trim();
    if (!model || !q || !a) continue;
    if (!result.has(model)) result.set(model, []);
    result.get(model)!.push({ q, a });
  }
  return result;
}

function updateJsonFaqs(filePath: string, faqs: Faq[]): void {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);
  data.faqs = faqs;
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function main() {
  const xlsxPath = process.argv[2];
  if (!xlsxPath) {
    console.error('Usage: npx tsx scripts/update-toyota-faqs.ts <path-to-xlsx>');
    process.exit(1);
  }
  const resolvedPath = xlsxPath.startsWith('~')
    ? path.join(process.env.HOME ?? '', xlsxPath.slice(1))
    : path.resolve(xlsxPath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }

  const faqsByModel = readFaqsFromExcel(resolvedPath);
  console.log(`Loaded FAQs for ${faqsByModel.size} models from Excel.\n`);

  // Build slug → FAQs map from primary models
  const faqsBySlug = new Map<string, Faq[]>();
  for (const [modelName, faqs] of faqsByModel) {
    const slug = MODEL_TO_SLUG[modelName];
    if (!slug) {
      console.warn(`  [WARN] No slug mapping for model: "${modelName}"`);
      continue;
    }
    faqsBySlug.set(slug, faqs);
  }

  // Apply variant → base-model FAQ inheritance
  for (const [variantSlug, baseSlug] of Object.entries(VARIANT_TO_BASE)) {
    const baseFaqs = faqsBySlug.get(baseSlug);
    if (baseFaqs) {
      faqsBySlug.set(variantSlug, baseFaqs);
    } else {
      console.warn(`  [WARN] Base FAQs not found for variant "${variantSlug}" (base: "${baseSlug}")`);
    }
  }

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const [slug, faqs] of faqsBySlug) {
    const filePath = path.join(CONFIGS_DIR, `${slug}.json`);
    if (!fs.existsSync(filePath)) {
      console.warn(`  [NOT FOUND] ${slug}.json`);
      notFound++;
      continue;
    }
    updateJsonFaqs(filePath, faqs);
    console.log(`  [UPDATED] ${slug}.json  (${faqs.length} FAQs)`);
    updated++;
  }

  // Report JSON files in the dir that weren't touched
  const allFiles = fs
    .readdirSync(CONFIGS_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'toy-models-2026.json');
  for (const f of allFiles) {
    const slug = f.replace('.json', '');
    if (!faqsBySlug.has(slug)) {
      console.log(`  [SKIPPED] ${f}`);
      skipped++;
    }
  }

  console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}, Not found: ${notFound}`);
}

main();
