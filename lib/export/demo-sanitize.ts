/**
 * Text replacements applied when exporting a public portfolio copy of the repo.
 * Keeps real dealer names/URLs out of the public GitHub tree while preserving buildability.
 */

export const SANITIZE_TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.yml',
  '.yaml',
  '.html',
  '.css',
  '.sql',
  '.prisma',
  '.example',
  '.txt',
]);

/** Bucks / Montgomery County towns referenced in model-page renderer lists. */
const LOCAL_TOWN_REPLACEMENTS: ReadonlyArray<[string, string]> = [
  ['Carversville', 'Fairview'],
  ['Erwinna', 'Oakdale'],
  ['Fountainville', 'Brookville'],
  ['Lumberville', 'Lakeside'],
  ['Mechanicsville', 'Centralburg'],
  ['Pipersville', 'Crossville'],
  ['Chalfont', 'Greenfield'],
  ['Dublin', 'Millbrook'],
  ['Furlong', 'Cedarville'],
  ['Jamison', 'Lakewood'],
  ['Kintnersville', 'Pinehurst'],
  ['New Hope', 'Riverside'],
  ['Newtown', 'Westport'],
  ['Ottsville', 'Hillcrest'],
  ['Perkasie', 'Valleyview'],
  ['Quakertown', 'Northgate'],
  ['Warminster', 'Southgate'],
  ['Warrington', 'Eastgate'],
  ['Horsham', 'Northfield'],
  ['Hatboro', 'Westfield'],
  ['Lansdale', 'Eastford'],
  ['Montgomeryville', 'Midville'],
  ['Dresher', 'Upland'],
  ['Cheltenham', 'Fairmont'],
  ['Blue Bell', 'Bellview'],
  ['Fort Washington', 'Washingtonville'],
  ['Bryn Athyn', 'Athynville'],
  ['Lafayette Hill', 'Hilldale'],
  ['Feasterville Trevose', 'Feasterville'],
  ['Buckingham', 'Kingsport'],
];

/** Matches a real newline or a literal \\n pair in source text. */
const NL = String.raw`(?:\r?\n|\\n)`;

/** Order matters: longer / more specific patterns first. */
export const SANITIZE_REPLACEMENTS: ReadonlyArray<{
  pattern: RegExp;
  replacement: string;
}> = [
  {
    pattern: /https?:\/\/www\.thompsontoyota\.net[^\s"'`)\]]*/gi,
    replacement: 'https://toyota-of-demotown.example.com',
  },
  {
    pattern: /https?:\/\/www\.thompsonbmw\.com[^\s"'`)\]]*/gi,
    replacement: 'https://bmw-of-demotown.example.com',
  },
  {
    pattern: /https?:\/\/www\.thompsonlexusdoylestown\.com[^\s"'`)\]]*/gi,
    replacement: 'https://lexus-of-demotown.example.com',
  },
  {
    pattern: /https?:\/\/www\.thompsonlexuswillowgrove\.com[^\s"'`)\]]*/gi,
    replacement: 'https://lexus-of-exampleville.example.com',
  },
  { pattern: /https:\/\/pub-[a-f0-9]+\.r2\.dev/gi, replacement: 'https://demo-assets.example.com' },
  { pattern: /thompsontoyota\.net/gi, replacement: 'toyota-of-demotown.example.com' },
  { pattern: /thompsonbmw\.com/gi, replacement: 'bmw-of-demotown.example.com' },
  {
    pattern: /thompsonlexusdoylestown\.com/gi,
    replacement: 'lexus-of-demotown.example.com',
  },
  {
    pattern: /thompsonlexuswillowgrove\.com/gi,
    replacement: 'lexus-of-exampleville.example.com',
  },
  {
    pattern: new RegExp(`Thompson Toyota${NL}Doylestown`, 'g'),
    replacement: 'Toyota of Demotown',
  },
  {
    pattern: new RegExp(`Thompson Lexus${NL}Willow Grove`, 'g'),
    replacement: 'Lexus of Exampleville',
  },
  {
    pattern: new RegExp(`Thompson Lexus${NL}Doylestown`, 'g'),
    replacement: 'Lexus of Demotown',
  },
  {
    pattern: new RegExp(`Toyota of Demotown${NL}Doylestown`, 'g'),
    replacement: 'Toyota of Demotown',
  },
  {
    pattern: new RegExp(`Lexus of Demotown${NL}Doylestown`, 'g'),
    replacement: 'Lexus of Demotown',
  },
  {
    pattern: new RegExp(`Lexus of Demotown${NL}Willow Grove`, 'g'),
    replacement: 'Lexus of Exampleville',
  },
  { pattern: /Thompson BMW of Doylestown/gi, replacement: 'BMW of Demotown' },
  { pattern: /Thompson BMW/gi, replacement: 'BMW of Demotown' },
  { pattern: /Thompson Toyota/g, replacement: 'Toyota of Demotown' },
  { pattern: /Thompson Lexus/g, replacement: 'Lexus of Demotown' },
  { pattern: new RegExp(`BMW of${NL}Doylestown`, 'g'), replacement: 'BMW of\\nDemotown' },
  { pattern: /BMW of Doylestown/gi, replacement: 'BMW of Demotown' },
  { pattern: /Thompson Price/g, replacement: 'Demo Price' },
  { pattern: /Thompson Performance Group/gi, replacement: 'Demo Performance Group' },
  { pattern: /680 N\. Main Street/gi, replacement: '100 Demo Plaza' },
  { pattern: /122 W\. Swamp Rd\.?/gi, replacement: '100 Demo Plaza' },
  { pattern: /50 W\. Swamp Rd\.?/gi, replacement: '100 Demo Plaza' },
  { pattern: /215-340-3900/g, replacement: '555-0100' },
  { pattern: /215-345-1110/g, replacement: '555-0101' },
  { pattern: /215-345-9460/g, replacement: '555-0102' },
  { pattern: /215-\d{3}-\d{4}/g, replacement: '555-0100' },
  { pattern: /\/Users\/jeremyralston\/[^\s"'`]+/g, replacement: '/tmp/demo-artifacts/example.json' },
  { pattern: /Bucks County/g, replacement: 'Demo County' },
  { pattern: /Montgomery County/g, replacement: 'Example County' },
  { pattern: /Thompson/gi, replacement: 'Demo' },
  { pattern: /\bWillow Grove\b/gi, replacement: 'Exampleville' },
  { pattern: /\bDoylestown\b/gi, replacement: 'Demotown' },
  { pattern: /\\bDoylestown\\b/gi, replacement: String.raw`\bDemotown\b` },
  { pattern: /\\bWillow Grove\\b/gi, replacement: String.raw`\bExampleville\b` },
  ...LOCAL_TOWN_REPLACEMENTS.map(([from, to]) => ({
    pattern: new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'),
    replacement: to,
  })),
];

/** Fail export if any of these remain in sanitized text files (non-test paths). */
export const FORBIDDEN_AFTER_SANITIZE: ReadonlyArray<RegExp> = [
  /thompson/i,
  /thompsontoyota/i,
  /thompsonbmw/i,
  /thompsonlexus/i,
  /680\s+N\.?\s*Main/i,
  /Swamp\s+Rd/i,
  /215-\d{3}-\d{4}/,
  /\bDoylestown\b/i,
  /\bWillow Grove\b/i,
  /Bucks County/i,
  /Montgomery County/i,
  /pub-[a-f0-9]+\.r2\.dev/i,
  /\/Users\/jeremyralston/i,
];

export function sanitizeText(content: string): string {
  let out = content;
  for (const { pattern, replacement } of SANITIZE_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

export function findForbiddenMatches(content: string): string[] {
  const hits: string[] = [];
  for (const pattern of FORBIDDEN_AFTER_SANITIZE) {
    const m = content.match(pattern);
    if (m) hits.push(m[0]);
  }
  return hits;
}

const SANITIZE_SKIP = new Set([
  'lib/export/demo-sanitize.ts',
  'lib/export/__tests__/demo-sanitize.test.ts',
]);

export function shouldSanitizeFile(relPath: string): boolean {
  const posix = relPath.replace(/\\/g, '/');
  if (SANITIZE_SKIP.has(posix)) return false;
  const base = relPath.split('/').pop() ?? relPath;
  const dot = base.lastIndexOf('.');
  if (dot === -1) return false;
  return SANITIZE_TEXT_EXTENSIONS.has(base.slice(dot));
}

/** Test fixtures may intentionally contain forbidden strings for sanitizer coverage. */
export function shouldVerifySanitizedFile(relPath: string): boolean {
  const posix = relPath.replace(/\\/g, '/');
  if (posix.includes('/__tests__/')) return false;
  if (posix === 'lib/export/demo-sanitize.ts') return false;
  if (posix === 'lib/export/__tests__/demo-sanitize.test.ts') return false;
  return true;
}
