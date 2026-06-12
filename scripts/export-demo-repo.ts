/**
 * Export a sanitized copy of the repo for the public portfolio demo.
 *
 * Usage:
 *   npm run export:demo-repo -- ../offers-platform-demo
 *   npm run export:demo-repo -- ../offers-platform-demo --force
 */
import fs from 'fs';
import path from 'path';
import {
  findForbiddenMatches,
  sanitizeText,
  shouldSanitizeFile,
  shouldVerifySanitizedFile,
} from '../lib/export/demo-sanitize';

const ROOT = process.cwd();
const destArg = process.argv[2];
const force = process.argv.includes('--force');

if (!destArg) {
  console.error('Usage: npm run export:demo-repo -- <destination-directory> [--force]');
  process.exit(1);
}

const DEST = path.resolve(destArg);

const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'artifacts',
  '.playwright',
  'coverage',
]);

const EXCLUDE_FILES = new Set([
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  '.env.build',
  '.env.vercel.production',
]);

/** Exact relative paths (POSIX) omitted from the public tree. */
const EXCLUDE_REL_PATHS = new Set([
  'scripts/run-toyota-ingestion.ts',
  'scripts/debug-extract-endpoints.cjs',
  'scripts/vercel-env-bulk.mjs',
  'scripts/setup-demo-supabase-env.mjs',
  '.github/workflows/toyota-ingestion.yml',
  '.github/workflows/demo-db-reset.yml',
  'lib/ingestion/bmw/__fixtures__/bmw-v2-sample.xlsx',
  // Dev-only / internal (legacy root paths if present)
  'appviewer.html',
  'deps.json',
  'ISSUES.md',
  'tailwind.config.js',
]);

/** Directory prefixes — skip entire subtrees. */
const EXCLUDE_DIR_PREFIXES = [
  'lib/ingestion/bmw/__fixtures__',
  'tools/',
  'docs/internal/',
];

/** Under `lab/`, only these paths are included (templates + renderer for demo builds). */
const LAB_INCLUDE_REL_PATHS = new Set([
  'lab/modelpager/templates',
  'lab/modelpager/scripts/render-model-page.js',
]);

function toPosixRel(rel: string): string {
  return rel.split(path.sep).join('/');
}

function isLabIncluded(posix: string): boolean {
  if (posix === 'lab/modelpager/scripts/render-model-page.js') return true;
  if (posix === 'lab/modelpager/templates' || posix.startsWith('lab/modelpager/templates/')) {
    return true;
  }
  // Traverse only toward whitelisted lab paths
  if (posix === 'lab/modelpager' || posix === 'lab/modelpager/scripts') return true;
  return false;
}

function shouldSkip(rel: string): boolean {
  const posix = toPosixRel(rel);
  if (posix === 'lab') return false;
  if (posix.startsWith('lab/')) {
    return !isLabIncluded(posix);
  }
  const parts = posix.split('/');
  if (parts.some((p) => EXCLUDE_DIRS.has(p))) return true;
  if (EXCLUDE_FILES.has(path.basename(rel))) return true;
  if (EXCLUDE_REL_PATHS.has(posix)) return true;
  if (
    EXCLUDE_DIR_PREFIXES.some((prefix) => {
      const normalized = prefix.replace(/\/+$/, '');
      return posix === normalized || posix.startsWith(`${normalized}/`);
    })
  ) {
    return true;
  }
  if (posix.endsWith('.xlsx') || posix.endsWith('.xls')) return true;
  return false;
}

function copyRecursive(src: string, dest: string, rel = '') {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (shouldSkip(relPath)) continue;
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      copyRecursive(from, to, relPath);
    } else {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
    }
  }
}

function walkFiles(dir: string, rel = '', out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, relPath, out);
    } else {
      out.push(relPath);
    }
  }
  return out;
}

function sanitizeTree(destRoot: string): { filesSanitized: number; violations: string[] } {
  let filesSanitized = 0;
  const violations: string[] = [];

  for (const rel of walkFiles(destRoot)) {
    if (!shouldSanitizeFile(rel)) continue;
    const posix = toPosixRel(rel);
    const filePath = path.join(destRoot, rel);
    const raw = fs.readFileSync(filePath, 'utf8');
    const sanitized = sanitizeText(raw);
    if (sanitized !== raw) {
      fs.writeFileSync(filePath, sanitized, 'utf8');
      filesSanitized += 1;
    }
    if (!shouldVerifySanitizedFile(posix)) continue;
    const forbidden = findForbiddenMatches(sanitized);
    if (forbidden.length > 0) {
      violations.push(`${rel}: ${[...new Set(forbidden)].join(', ')}`);
    }
  }

  return { filesSanitized, violations };
}

function patchEnvExample(destRoot: string) {
  const envPath = path.join(destRoot, '.env.example');
  if (!fs.existsSync(envPath)) return;
  let text = fs.readFileSync(envPath, 'utf8');
  if (!text.includes('DEMO_LLM_BYOK')) {
    text = text.replace(
      'NEXT_PUBLIC_DEMO_MODE=false',
      'NEXT_PUBLIC_DEMO_MODE=false\nDEMO_LLM_BYOK=false\nNEXT_PUBLIC_DEMO_LLM_BYOK=false\nDEMO_LLM_RATE_LIMIT=10\nDEMO_LLM_RATE_WINDOW_MS=3600000',
    );
  }
  text = text.replace(
    '# LLM providers (model pages, SEO, search queries)',
    '# LLM providers (production only — omit on demo when using BYOK)',
  );
  text = text.replace(
    'MODELPAGER_CONFIGS=lab/modelpager/configs',
    'MODELPAGER_CONFIGS=demo/modelpager-configs',
  );
  fs.writeFileSync(envPath, text, 'utf8');
}

function writePortfolioReadme(destRoot: string) {
  const readme = `# Offers Platform — Portfolio Demo

Public demonstration of a multi-store automotive offers admin and publishing platform.

**Live site:** [offers-platform-demo.vercel.app](https://offers-platform-demo.vercel.app)

All dealership names, offers, and inventory on this deployment are **fictional**. This is not connected to production dealer systems.

## Try the admin UI

1. Open [offers-platform-demo.vercel.app/admin](https://offers-platform-demo.vercel.app/admin) (or **Admin sign-in** on the demo landing page).
2. When prompted for an **access code**, enter:

   \`\`\`
   demo
   \`\`\`

3. Explore offers, publishing outputs, disclaimers, and the embed widget at **Admin → Embed** (\`/admin/embed\`).

No email or password is required on the hosted demo. Offer data resets daily at 2:00 AM US Eastern.

## Stack

Next.js · PostgreSQL (Supabase) · Clerk · Prisma · Vitest

## Quick start (local)

\`\`\`bash
npm install
cp .env.example .env.local
# Set DATABASE_URL, DIRECT_URL, Clerk keys, DEMO_CLERK_USER_ID; DEMO_MODE=true
npm run db:migrate
npm run db:seed-demo
npm run dev
\`\`\`

Sign in locally with access code \`demo\` when \`DEMO_MODE=true\` (see \`.env.example\`).

## What is intentionally excluded

- \`lab/\` production model-page configs (demo ships \`demo/modelpager-configs/\`)
- Toyota Playwright ingestion scripts and operator CI workflows
- Spreadsheet fixtures and \`.env*\` secrets

Model page **bulk generation** on the hosted demo uses **bring-your-own-key** (\`DEMO_LLM_BYOK\`) so visitors use their own LLM API key.

## Copyright

© 2026 Ralston Digital. All rights reserved.
`;
  fs.writeFileSync(path.join(destRoot, 'README.md'), readme, 'utf8');
  fs.writeFileSync(path.join(destRoot, 'PORTFOLIO_README.md'), readme, 'utf8');
}

function writeManifest(destRoot: string, filesSanitized: number, skipped: string[]) {
  const manifest = {
    exportedAt: new Date().toISOString(),
    sourceNote: 'Sanitized export — do not merge back into private repo without review',
    filesSanitized,
    excludedPaths: [...EXCLUDE_REL_PATHS, ...EXCLUDE_DIR_PREFIXES],
    skippedToyotaIngestion: true,
  };
  fs.writeFileSync(
    path.join(destRoot, 'export-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  void skipped;
}

if (fs.existsSync(DEST)) {
  if (!force) {
    console.error(`Destination already exists: ${DEST}`);
    console.error('Pass --force to replace it.');
    process.exit(1);
  }
  fs.rmSync(DEST, { recursive: true, force: true });
}

fs.mkdirSync(DEST, { recursive: true });
copyRecursive(ROOT, DEST);

const { filesSanitized, violations } = sanitizeTree(DEST);
patchEnvExample(DEST);
writePortfolioReadme(DEST);
writeManifest(DEST, filesSanitized, []);

if (violations.length > 0) {
  console.error('\nExport failed — forbidden dealer identifiers remain:\n');
  for (const v of violations.slice(0, 30)) {
    console.error(`  - ${v}`);
  }
  if (violations.length > 30) {
    console.error(`  ... and ${violations.length - 30} more`);
  }
  fs.rmSync(DEST, { recursive: true, force: true });
  process.exit(1);
}

console.log(`Exported demo repo to ${DEST}`);
console.log(`Sanitized ${filesSanitized} text files`);
console.log('\nNext steps:');
console.log('  1. cd into dest && git init && git add . && git commit');
console.log('  2. Push to a public GitHub repo (keep your main repo private)');
console.log('  3. Connect offers-platform-demo on Vercel — see docs/deploy/DEMO_PUBLIC_REPO.md');
