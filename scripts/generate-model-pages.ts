#!/usr/bin/env npx tsx
/**
 * CLI: Generate model-year page JSON files.
 * Uses config root from getModelPageConfigRoot() (lab/modelpager/configs or MODELPAGER_CONFIGS).
 *
 * Usage:
 *   pnpm run generate:model-pages
 *   npx tsx scripts/generate-model-pages.ts --brand toyota --year 2026
 *   npx tsx scripts/generate-model-pages.ts --brand lexus --year 2026 --store lexdt
 *   npx tsx scripts/generate-model-pages.ts --brand toyota --year 2026 --dry-run
 *   npx tsx scripts/generate-model-pages.ts --brand toyota --year 2026 --force
 *   npx tsx scripts/generate-model-pages.ts --brand toyota --year 2026 --no-llm
 *   npx tsx scripts/generate-model-pages.ts --brand toyota --year 2026 --approve camry
 *   npx tsx scripts/generate-model-pages.ts --why-bullets-only --brand bmw --year 2026
 *   npx tsx scripts/generate-model-pages.ts --brand bmw --year 2026 --slug 2-series --force
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load base .env first
const envPath = path.resolve(__dirname, "..", ".env");
config({ path: envPath });

// In local development, also load .env.local if present so it can override.
const envLocalPath = path.resolve(__dirname, "..", ".env.local");
if (fs.existsSync(envLocalPath)) {
  config({ path: envLocalPath, override: true });
}

import { runGeneration, loadStore } from "@/lib/model-page-generator/run";
import { getModelPageConfigRoot } from "@/lib/model-page-generator/config-path";
import { formatOemBrandLabel } from "@/lib/config/oem-labels";
import { listModelsForYear } from "@/lib/model-page-generator/list";
import { generateWhyBulletsOnly } from "@/lib/model-page-generator/generator";
import {
  slugify,
  validatePage,
  type ModelYearPage,
} from "@/lib/model-page-generator";
import type { ModelSpec } from "@/lib/model-page-generator/schema";
import { generateReport } from "@/lib/model-page-generator/report";
import type { GateResult } from "@/lib/model-page-generator/uniqueness-gate";

interface CliArgs {
  brand: string;
  year: number;
  store: string | null;
  dryRun: boolean;
  force: boolean;
  useLlm: boolean;
  whyBulletsOnly: boolean;
  maxAttempts: number | null;
  thresholdIntra: number | null;
  thresholdCross: number | null;
  thresholdLexus: number | null;
  approveSlug: string | null;
  /** Model slug(s) matching slugify(displayName); repeat --slug for multiple. */
  modelSlugs: string[];
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let brand = "toyota";
  let year = 2026;
  let store: string | null = null;
  let dryRun = false;
  let force = false;
  let useLlm = true;
  let whyBulletsOnly = false;
  let maxAttempts: number | null = null;
  let thresholdIntra: number | null = null;
  let thresholdCross: number | null = null;
  let thresholdLexus: number | null = null;
  let approveSlug: string | null = null;
  const modelSlugs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--brand" && args[i + 1]) {
      brand = args[++i];
    } else if (args[i] === "--year" && args[i + 1]) {
      year = parseInt(args[++i], 10);
    } else if (args[i] === "--store" && args[i + 1]) {
      store = args[++i];
    } else if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i] === "--force") {
      force = true;
    } else if (args[i] === "--no-llm") {
      useLlm = false;
    } else if (args[i] === "--why-bullets-only") {
      whyBulletsOnly = true;
    } else if (args[i] === "--max-attempts" && args[i + 1]) {
      maxAttempts = parseInt(args[++i], 10);
    } else if (args[i] === "--threshold-intra" && args[i + 1]) {
      thresholdIntra = parseFloat(args[++i]);
    } else if (args[i] === "--threshold-cross" && args[i + 1]) {
      thresholdCross = parseFloat(args[++i]);
    } else if (args[i] === "--threshold-lexus" && args[i + 1]) {
      thresholdLexus = parseFloat(args[++i]);
    } else if (args[i] === "--approve" && args[i + 1]) {
      approveSlug = args[++i];
    } else if (args[i] === "--slug" && args[i + 1]) {
      modelSlugs.push(args[++i].trim().toLowerCase().replace(/\.json$/, ""));
    }
  }

  return {
    brand,
    year,
    store,
    dryRun,
    force,
    useLlm,
    whyBulletsOnly,
    maxAttempts,
    thresholdIntra,
    thresholdCross,
    thresholdLexus,
    approveSlug,
    modelSlugs,
  };
}

async function main(): Promise<number> {
  const args = parseArgs();
  const {
    brand,
    year,
    store: storeKey,
    dryRun,
    force,
    useLlm,
    whyBulletsOnly,
    maxAttempts,
    approveSlug,
    modelSlugs,
  } = args;

  const configRoot = getModelPageConfigRoot();
  const brandSlug = brand.toLowerCase();
  const pagesDir = path.join(configRoot, "pages");

  if (whyBulletsOnly) {
    const store = loadStore(configRoot, brandSlug, storeKey);
    const make =
      store.brand?.trim() || formatOemBrandLabel(brandSlug);
    const models = listModelsForYear(configRoot, brandSlug, year);
    const outDir = path.join(
      pagesDir,
      brandSlug,
      String(year),
      ...(storeKey ? [storeKey] : [])
    );
    if (!fs.existsSync(outDir)) {
      console.error(`Pages directory not found: ${outDir}`);
      return 1;
    }
    const pageFiles = fs
      .readdirSync(outDir)
      .filter(
        (f) => f.endsWith(".json") && !f.includes("-models-")
      );
    let written = 0;
    for (const filename of pageFiles) {
      const filePath = path.join(outDir, filename);
      const raw = fs.readFileSync(filePath, "utf8");
      let page: ModelYearPage;
      try {
        page = JSON.parse(raw) as ModelYearPage;
      } catch (e) {
        console.error(`Skip ${filename}: invalid JSON`);
        continue;
      }
      const spec: ModelSpec = models.find((m) => m.displayName === page.model) ?? {
        displayName: page.model,
        category: "default",
      };
      try {
        const bullets = await generateWhyBulletsOnly(store, spec, {
          make,
          year,
          brandSlug,
          configsDir: configRoot,
        });
        page.whyBullets = bullets;
      } catch (e) {
        console.error(`Skip ${filename}: ${(e as Error).message}`);
        continue;
      }
      if (!dryRun) {
        fs.writeFileSync(filePath, JSON.stringify(page, null, 2) + "\n", "utf8");
        written++;
        console.log(`Updated whyBullets: ${filename}`);
      } else {
        console.log(`Would update whyBullets: ${filename}`);
        written++;
      }
    }
    console.log(
      dryRun ? `Dry run: would update ${written} page(s).` : `Done. Updated whyBullets on ${written} page(s).`
    );
    return 0;
  }

  if (approveSlug != null && approveSlug.trim() !== "") {
    const slug = approveSlug.trim().toLowerCase().replace(/\.json$/, "");
    const outDir = path.join(
      pagesDir,
      brandSlug,
      String(year),
      ...(storeKey ? [storeKey] : [])
    );
    const sourcePath = path.join(outDir, `${slug}.json`);
    const approvedDir = path.join(configRoot, "approved-examples", brandSlug);
    const destPath = path.join(approvedDir, `${slug}.json`);
    if (!fs.existsSync(sourcePath)) {
      console.error(`Page not found: ${sourcePath}`);
      return 1;
    }
    try {
      fs.mkdirSync(approvedDir, { recursive: true });
      fs.copyFileSync(sourcePath, destPath);
      console.log(
        `Approved: ${path.relative(process.cwd(), sourcePath)} -> ${path.relative(process.cwd(), destPath)}`
      );
    } catch (err) {
      console.error(
        "Failed to copy to approved-examples:",
        (err as Error).message
      );
      return 1;
    }
    return 0;
  }

  let result: { pages: ModelYearPage[]; gateResults: GateResult[]; attemptCounts: number[] };
  try {
    result = await runGeneration(configRoot, {
      brand: brandSlug,
      year,
      storeKey,
      useLlm,
      maxAttempts: maxAttempts ?? undefined,
      maxPerRun: 9999,
      modelSlugs: modelSlugs.length > 0 ? modelSlugs : null,
    });
  } catch (e) {
    console.error((e as Error).message);
    return 1;
  }

  const { pages, gateResults, attemptCounts } = result;
  const store = loadStore(configRoot, brandSlug, storeKey);
  const cityRaw = store.location?.city ?? "Demotown";
  const city = cityRaw.toLowerCase().replace(/\s+/g, "-");
  const state = (store.location?.state ?? "PA").toLowerCase();

  let hasValidationErrors = false;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const expectedSlug = slugify(page.model);
    const expectedPagePath = `/new-${brandSlug}/${year}-${brandSlug}-${expectedSlug}-${city}-${state}.htm`;

    const errors = validatePage(page, {
      expectedSlug,
      expectedPagePath,
      brand: brandSlug,
    });
    if (errors.length > 0) {
      hasValidationErrors = true;
      console.error(`Validation failed for ${page.model} (${expectedSlug}.json):`);
      for (const err of errors) {
        console.error(`  - ${err.message}`);
      }
    }
  }

  if (hasValidationErrors) {
    return 1;
  }

  const outDir = path.join(
    pagesDir,
    brandSlug,
    String(year),
    ...(storeKey ? [storeKey] : [])
  );
  if (!dryRun) {
    try {
      fs.mkdirSync(outDir, { recursive: true });
    } catch {
      // ignore
    }
  }

  let written = 0;
  let skipped = 0;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const slug = slugify(page.model);
    const filename = `${slug}.json`;
    const filePath = path.join(outDir, filename);

    if (dryRun) {
      console.log(`Would write: ${path.relative(process.cwd(), filePath)}`);
      written++;
      continue;
    }

    if (fs.existsSync(filePath) && !force) {
      console.log(`Skip (exists): ${filename}`);
      skipped++;
      continue;
    }

    const json = JSON.stringify(page, null, 2);
    fs.writeFileSync(filePath, json + "\n", "utf8");
    console.log(`Wrote: ${path.relative(process.cwd(), filePath)}`);
    written++;
  }

  if (dryRun) {
    if (useLlm && gateResults.length > 0) {
      const report = generateReport({
        pages,
        gateResults,
        attemptCounts: attemptCounts.length > 0 ? attemptCounts : undefined,
        maxAttempts: maxAttempts ?? undefined,
      });
      console.log(report);
    }
    console.log(`Dry run: would write ${written} file(s).`);
  } else {
    console.log(`Done. Wrote ${written}, skipped ${skipped}.`);
  }
  return 0;
}

main().then((code) => process.exit(code));
