#!/usr/bin/env npx tsx
/**
 * CLI: Validate existing model-year page JSON files.
 *
 * Usage:
 *   npm run validate:model-pages -- --brand bmw --year 2026
 *   npm run validate:model-pages -- --brand lexus --year 2026 --store lexdt
 *   npm run validate:model-pages -- --brand bmw --year 2026 --slug i4 --slug 8-series
 */

import * as fs from "fs";
import * as path from "path";
import { getModelPageConfigRoot } from "@/lib/model-page-generator/config-path";
import { joinModelPagerPagesDir } from "@/lib/model-page-generator/paths";
import { loadStore } from "@/lib/model-page-generator/run";
import {
  validatePage,
  validatePageFilename,
  slugify,
  type ModelYearPage,
} from "@/lib/model-page-generator";

interface CliArgs {
  brand: string;
  year: number;
  store: string | null;
  modelSlugs: string[];
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let brand = "toyota";
  let year = 2026;
  let store: string | null = null;
  const modelSlugs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--brand" && args[i + 1]) {
      brand = args[++i];
    } else if (args[i] === "--year" && args[i + 1]) {
      year = parseInt(args[++i], 10);
    } else if (args[i] === "--store" && args[i + 1]) {
      store = args[++i];
    } else if (args[i] === "--slug" && args[i + 1]) {
      modelSlugs.push(args[++i].trim().toLowerCase().replace(/\.json$/, ""));
    }
  }

  return { brand, year, store, modelSlugs };
}

function main(): number {
  const { brand, year, store, modelSlugs } = parseArgs();
  const brandSlug = brand.toLowerCase();
  const configRoot = getModelPageConfigRoot();
  const pagesDir = joinModelPagerPagesDir(configRoot, brandSlug, year, store);

  if (!fs.existsSync(pagesDir)) {
    console.error(`Pages directory not found: ${pagesDir}`);
    return 1;
  }

  const storeCfg = loadStore(configRoot, brandSlug, store);
  const cityRaw = storeCfg.location?.city ?? "Demotown";
  const city = cityRaw.toLowerCase().replace(/\s+/g, "-");
  const state = (storeCfg.location?.state ?? "PA").toLowerCase();

  const slugFilter =
    modelSlugs.length > 0 ? new Set(modelSlugs.map((s) => s.toLowerCase())) : null;

  const files = fs
    .readdirSync(pagesDir)
    .filter((f) => f.endsWith(".json") && !f.includes("-models-"))
    .filter((f) => (slugFilter ? slugFilter.has(f.replace(/\.json$/, "").toLowerCase()) : true))
    .sort();

  if (files.length === 0) {
    console.error(
      slugFilter
        ? "No matching page JSON files found for provided slug filter."
        : "No page JSON files found to validate."
    );
    return 1;
  }

  let errorCount = 0;

  for (const filename of files) {
    const filePath = path.join(pagesDir, filename);
    const expectedSlug = filename.replace(/\.json$/, "").toLowerCase();
    const expectedPagePath = `/new-${brandSlug}/${year}-${brandSlug}-${expectedSlug}-${city}-${state}.htm`;

    let page: ModelYearPage;
    try {
      page = JSON.parse(fs.readFileSync(filePath, "utf8")) as ModelYearPage;
    } catch (e) {
      errorCount++;
      console.error(`Validation failed for ${filename}: invalid JSON (${(e as Error).message})`);
      continue;
    }

    const filenameErrors = validatePageFilename(filename, expectedSlug);
    const pageErrors = validatePage(page, {
      expectedSlug,
      expectedPagePath,
      brand: brandSlug,
    });

    const modelSlug = slugify(page.model ?? "");
    const mismatchErrors =
      modelSlug !== expectedSlug
        ? [
            {
              message: `Filename/model mismatch: filename slug ${expectedSlug}, page.model slug ${modelSlug}`,
            },
          ]
        : [];

    const errors = [...filenameErrors, ...pageErrors, ...mismatchErrors];
    if (errors.length > 0) {
      errorCount += errors.length;
      console.error(`Validation failed for ${filename}:`);
      for (const err of errors) {
        console.error(`  - ${err.message}`);
      }
      continue;
    }

    console.log(`OK: ${filename}`);
  }

  if (errorCount > 0) {
    console.error(`\nValidation failed with ${errorCount} error(s).`);
    return 1;
  }

  console.log(`\nValidation passed for ${files.length} file(s).`);
  return 0;
}

process.exit(main());
