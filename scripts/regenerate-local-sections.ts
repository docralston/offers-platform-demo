#!/usr/bin/env npx tsx
/**
 * CLI: Regenerate local sections + internal links (same pipeline as admin "Regenerate Local").
 *
 * Usage:
 *   npm run regenerate:local-sections -- --brand bmw --year 2026 --slug i4
 *   npm run regenerate:local-sections -- --brand bmw --year 2026 --all-bmw-2026-local
 *
 * Optional: --store <key> when pages live under pages/{brand}/{year}/{store}/
 *
 * If .env.local pins deprecated Anthropic model ids, pass overrides (applied after dotenv):
 *   --anthropic-model claude-haiku-4-5 --anthropic-model-local claude-haiku-4-5 --anthropic-model-links claude-sonnet-4-6
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const envPath = path.resolve(__dirname, '..', '.env');
config({ path: envPath });
const envLocalPath = path.resolve(__dirname, '..', '.env.local');
if (fs.existsSync(envLocalPath)) {
  config({ path: envLocalPath, override: true });
}

/** Slugs from plan: 2026 BMW models for Regenerate Local batch. */
const BMW_2026_LOCAL_SLUGS = [
  'i4',
  'i5',
  'i7',
  'ix',
  'm-models',
  'x1',
  'x2',
  'x3',
  'x5',
  'x6',
  'x7',
  'xm',
  'z4',
] as const;

function applyAnthropicArgvOverrides(argv: string[]): void {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--anthropic-model' && argv[i + 1]) {
      process.env.ANTHROPIC_MODEL = argv[++i];
    } else if (argv[i] === '--anthropic-model-local' && argv[i + 1]) {
      process.env.ANTHROPIC_MODEL_LOCAL = argv[++i];
    } else if (argv[i] === '--anthropic-model-links' && argv[i + 1]) {
      process.env.ANTHROPIC_MODEL_LINKS = argv[++i];
    } else if (argv[i] === '--anthropic-model-fallback' && argv[i + 1]) {
      process.env.ANTHROPIC_MODEL_FALLBACK = argv[++i];
    }
  }
}

applyAnthropicArgvOverrides(process.argv.slice(2));

interface CliArgs {
  brand: string;
  year: number;
  store: string | null;
  modelSlugs: string[];
  allBmw2026Local: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let brand = 'bmw';
  let year = 2026;
  let store: string | null = null;
  let allBmw2026Local = false;
  const modelSlugs: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--brand' && argv[i + 1]) {
      brand = argv[++i];
    } else if (a === '--year' && argv[i + 1]) {
      year = parseInt(argv[++i], 10);
    } else if (a === '--store' && argv[i + 1]) {
      store = argv[++i];
    } else if (a === '--slug' && argv[i + 1]) {
      modelSlugs.push(argv[++i].trim().toLowerCase().replace(/\.json$/, ''));
    } else if (a === '--all-bmw-2026-local') {
      allBmw2026Local = true;
    } else if (a?.startsWith('--anthropic-') && argv[i + 1]) {
      i++;
    }
  }

  return { brand, year, store, modelSlugs, allBmw2026Local };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  let slugs = [...args.modelSlugs];
  if (args.allBmw2026Local) {
    if (args.brand.toLowerCase() !== 'bmw' || args.year !== 2026) {
      console.error('--all-bmw-2026-local requires --brand bmw --year 2026');
      return 1;
    }
    slugs = [...BMW_2026_LOCAL_SLUGS];
  }
  if (slugs.length === 0) {
    console.error(
      'Pass --slug <slug> (repeat) or --all-bmw-2026-local. Example:\n' +
        '  npm run regenerate:local-sections -- --brand bmw --year 2026 --slug i4'
    );
    return 1;
  }

  const { getModelPageConfigRoot } = await import('@/lib/model-page-generator/config-path');
  const { generateLocalSectionsOnly, applyGeneratedLocalSectionsToPage } = await import(
    '@/lib/model-page-generator/generator'
  );
  const {
    injectInternalLinks,
    applyLinkedSectionsToPage,
    withInternalLinkTargetSnapshot,
  } = await import('@/lib/model-page-generator/internal-links');
  const { listModelsForYear } = await import('@/lib/model-page-generator/list');
  const { getModelPagerPageJsonPath, persistModelYearPage } = await import(
    '@/lib/model-page-generator/persist-model-page'
  );
  const { slugify } = await import('@/lib/model-page-generator');
  const { loadStore } = await import('@/lib/model-page-generator/run');
  type ModelYearPage = import('@/lib/model-page-generator').ModelYearPage;

  const { brand, year, store: storeKey } = args;

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    const label = `[${i + 1}/${slugs.length}] ${slug}`;
    process.stdout.write(`${label} … `);
    try {
      const configRoot = getModelPageConfigRoot();
      const brandSlug = brand.toLowerCase();
      const filePath = getModelPagerPageJsonPath(configRoot, brand, year, storeKey, slug);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Page not found: ${filePath}`);
      }
      const existing = JSON.parse(fs.readFileSync(filePath, 'utf8')) as ModelYearPage;
      const store = loadStore(configRoot, brandSlug, storeKey ?? null);
      const models = listModelsForYear(configRoot, brandSlug, year);
      const normalizedSlug = slug.toLowerCase().replace(/\.json$/, '');
      const spec =
        models.find((m) => slugify(m.displayName) === normalizedSlug) ??
        models.find((m) => m.displayName === existing.model);
      if (!spec) {
        throw new Error(`Model spec not found for slug: ${slug}`);
      }
      const make =
        store.brand?.trim() || brandSlug.charAt(0).toUpperCase() + brandSlug.slice(1);
      const local = await generateLocalSectionsOnly(store, spec, {
        make,
        year,
        brandSlug,
        configsDir: configRoot,
      });
      const updated = applyGeneratedLocalSectionsToPage(existing, local);
      const linked = await injectInternalLinks(updated, store, spec, { brandSlug });
      const updatedWithLinks = withInternalLinkTargetSnapshot(
        applyLinkedSectionsToPage(updated, linked),
        store,
        brandSlug
      );
      const saveResult = persistModelYearPage(
        configRoot,
        brand,
        year,
        storeKey,
        slug,
        updatedWithLinks
      );
      if (!saveResult.success) {
        const msg =
          saveResult.errors?.map((e) => e.message).join('; ') ?? 'persist failed';
        throw new Error(msg);
      }
      console.log('ok');
    } catch (e) {
      console.log('FAILED');
      console.error((e as Error).message);
      return 1;
    }
  }
  console.log(`Done. Regenerated local sections for ${slugs.length} page(s).`);
  return 0;
}

main().then((code) => process.exit(code));
