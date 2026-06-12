/**
 * Load approved (gold) page examples per brand for few-shot style prompting.
 * Reads from configs/approved-examples/<brand>/*.json and returns excerpt strings.
 */

import * as fs from "fs";
import * as path from "path";
import { slugify } from "./slug";
import type { ModelYearPage } from "./schema";

/** Build a single style excerpt from an approved page: metaDescription, heroSubhead, one whyBullet, trims intro. */
function buildExcerpt(page: ModelYearPage): string {
  const parts: string[] = [];
  if (page.seo?.metaDescription?.trim()) {
    parts.push(`Meta: ${page.seo.metaDescription.trim()}`);
  }
  if (page.heroSubhead?.trim()) {
    parts.push(`Hero: ${page.heroSubhead.trim()}`);
  }
  const bullets = Array.isArray(page.whyBullets) ? page.whyBullets : [];
  const firstBullet = bullets.find((b) => typeof b === "string" && b.trim());
  if (firstBullet) {
    parts.push(`Bullet: ${String(firstBullet).trim()}`);
  }
  if (page.trims?.intro?.trim()) {
    parts.push(`Trims intro: ${page.trims.intro.trim()}`);
  }
  return parts.join(" ");
}

/**
 * Load approved page JSONs from configs/approved-examples/<brand>/.
 * Excludes *-models-*.json. Returns full page objects for excerpt building.
 */
function loadApprovedPagesForBrand(configsDir: string, brandSlug: string): Array<{ slug: string; page: ModelYearPage }> {
  const brand = brandSlug.toLowerCase();
  const dir = path.join(configsDir, "approved-examples", brand);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return [];
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json") && !f.includes("-models-"));
  const out: Array<{ slug: string; page: ModelYearPage }> = [];
  for (const file of files) {
    const filePath = path.join(dir, file);
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const page = JSON.parse(raw) as ModelYearPage;
      const slug = file.replace(/\.json$/, "");
      out.push({ slug, page });
    } catch {
      // skip invalid or unreadable files
    }
  }
  return out;
}

/**
 * Get 1-2 approved excerpts for the given brand to inject into the prompt.
 * Selection is deterministic by modelIndex. Optionally exclude the current model's slug.
 */
export function getApprovedExcerpts(
  configsDir: string,
  brandSlug: string,
  modelIndex: number,
  excludeSlug?: string
): string[] {
  const approved = loadApprovedPagesForBrand(configsDir, brandSlug);
  const filtered = excludeSlug
    ? approved.filter(({ slug, page }) => slug !== excludeSlug && slugify(page.model ?? "") !== excludeSlug)
    : approved;

  const excerpts: string[] = [];

  // Keep existing behavior: take up to 2 approved JSON examples as style anchors.
  if (filtered.length > 0) {
    const n = filtered.length;
    const indices = n <= 2 ? [0, 1].filter((i) => i < n) : [modelIndex % n, (modelIndex + 1) % n];
    const uniqueIndices = [...new Set(indices)].slice(0, 2);
    excerpts.push(...uniqueIndices.map((i) => buildExcerpt(filtered[i].page)).filter(Boolean));
  }

  return excerpts;
}

/**
 * Load the brand prompt guide (e.g. prompts/bmw.md) for use in narrow prompts
 * (why bullets only, FAQs only, local sections). Returns null if no file exists.
 */
export function getBrandPromptDoc(configsDir: string, brandSlug: string): string | null {
  const brand = brandSlug?.toLowerCase() ?? "";
  if (!brand) return null;
  try {
    const promptsPath = path.join(configsDir, "..", "prompts", `${brand}.md`);
    if (!fs.existsSync(promptsPath) || !fs.statSync(promptsPath).isFile()) {
      return null;
    }
    const raw = fs.readFileSync(promptsPath, "utf8").trim();
    return raw || null;
  } catch {
    return null;
  }
}
