#!/usr/bin/env npx tsx
/**
 * Backfill or refresh search-queries/*.txt via Claude.
 *
 *   npx tsx scripts/generate-search-query-files.ts
 *   npx tsx scripts/generate-search-query-files.ts --brand bmw --year 2026 --dry-run
 *   npx tsx scripts/generate-search-query-files.ts --brand toyota --year 2026 --force
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, "..", ".env") });
const envLocal = path.resolve(__dirname, "..", ".env.local");
if (fs.existsSync(envLocal)) {
  config({ path: envLocal, override: true });
}

import { getModelPageConfigRoot } from "@/lib/model-page-generator/config-path";
import { listModelsForYear } from "@/lib/model-page-generator/list";
import { loadStore } from "@/lib/model-page-generator/store-loader";
import { generateAndWriteSearchQueriesFile } from "@/lib/model-page-generator/search-queries-generate";
import { resolveSearchQueriesFilePath } from "@/lib/model-page-generator/search-queries";
import { formatOemBrandLabel } from "@/lib/config/oem-labels";

const MIN_LINES_TO_SKIP = 5;

function parseArgs(argv: string[]) {
  let brand: string | null = null;
  let year: number | null = null;
  let dryRun = false;
  let force = false;
  let configRoot: string | null = null;

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") dryRun = true;
    else if (a === "--force") force = true;
    else if (a === "--brand" && argv[i + 1]) {
      brand = argv[++i]!.toLowerCase();
    } else if (a === "--year" && argv[i + 1]) {
      year = parseInt(argv[++i]!, 10);
    } else if (a === "--config-root" && argv[i + 1]) {
      configRoot = argv[++i]!;
    }
  }

  return { brand, year, dryRun, force, configRoot };
}

function countNonEmptyLines(filePath: string): number {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0).length;
  } catch {
    return 0;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const configDir = args.configRoot ?? getModelPageConfigRoot();

  const brands =
    args.brand != null
      ? [args.brand]
      : fs
          .readdirSync(path.join(configDir, "pages"), { withFileTypes: true })
          .filter((e) => e.isDirectory() && !e.name.startsWith("."))
          .map((e) => e.name);

  for (const brandSlug of brands) {
    const pagesBrandDir = path.join(configDir, "pages", brandSlug);
    if (!fs.existsSync(pagesBrandDir)) continue;

    const years =
      args.year != null
        ? [args.year]
        : fs
            .readdirSync(pagesBrandDir, { withFileTypes: true })
            .filter((e) => e.isDirectory() && /^\d{4}$/.test(e.name))
            .map((e) => parseInt(e.name, 10));

    for (const yr of years) {
      let models;
      try {
        models = listModelsForYear(configDir, brandSlug, yr);
      } catch {
        continue;
      }
      if (models.length === 0) continue;

      let make: string;
      try {
        const store = loadStore(configDir, brandSlug, null);
        make = store.brand?.trim() || formatOemBrandLabel(brandSlug);
      } catch {
        make = formatOemBrandLabel(brandSlug);
      }

      for (const m of models) {
        const slug = m.slug;
        const resolved = resolveSearchQueriesFilePath(
          configDir,
          brandSlug,
          yr,
          slug
        );
        let skip = false;
        if (resolved && !args.force) {
          const n = countNonEmptyLines(resolved.filePath);
          if (n >= MIN_LINES_TO_SKIP) skip = true;
        }
        if (skip) {
          console.log(
            `skip ${brandSlug}/${yr}/${slug} (has ${MIN_LINES_TO_SKIP}+ lines)`
          );
          continue;
        }

        if (args.dryRun) {
          console.log(
            `would generate ${brandSlug}/${yr}/${slug} (${m.displayName})`
          );
          continue;
        }

        try {
          console.log(`generating ${brandSlug}/${yr}/${slug}...`);
          await generateAndWriteSearchQueriesFile({
            configsDir: configDir,
            brandSlug,
            year: yr,
            slug,
            displayName: m.displayName,
            make,
            category: m.category,
          });
          console.log(`  wrote search-queries/${brandSlug}/${yr}/${slug}.txt`);
          await new Promise((r) => setTimeout(r, 400));
        } catch (e) {
          console.error(`  failed ${brandSlug}/${yr}/${slug}:`, e);
          process.exitCode = 1;
        }
      }
    }
  }
}

main();
