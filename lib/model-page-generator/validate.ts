/**
 * Validate generated page: required keys, no forbidden punctuation,
 * ToyotaCare is final FAQ, path/filename match rules.
 */

import { findForbiddenPunctuationPaths } from "./punctuation";
import { WARRANTY_QUESTIONS, normalizeBrandWarranty } from "./warranty-faqs";
import { slugify } from "./slug";
import type { ModelYearPage } from "./schema";

const REQUIRED_KEYS = [
  "pageType",
  "make",
  "model",
  "year",
  "pagePath",
  "canonicalUrl",
  "seo",
  "images",
  "heroSubhead",
  "whyBullets",
  "trims",
  "faqs",
  "links",
  "tags",
  "storeKey",
] as const;

function normalizeForCompare(s: string): string {
  return s
    .replace(/\u201c/g, '"')
    .replace(/\u201d/g, '"')
    .replace(/\u2018/g, "'")
    .replace(/\u2019/g, "'")
    .trim();
}

export interface ValidationError {
  path?: string;
  message: string;
}

export interface ValidatePageOptions {
  expectedSlug: string;
  expectedPagePath?: string;
  /** Brand slug (e.g. "toyota", "lexus", "bmw") for warranty FAQ check. */
  brand?: string;
}

export function validatePage(
  page: ModelYearPage,
  options: ValidatePageOptions | string
): ValidationError[] {
  const expectedSlug =
    typeof options === "string" ? options : options.expectedSlug;
  const expectedPagePath =
    typeof options === "string" ? undefined : options.expectedPagePath;

  const errors: ValidationError[] = [];

  for (const key of REQUIRED_KEYS) {
    if (!(key in page)) {
      errors.push({ message: `Missing required key: ${key}` });
    }
  }

  if (page.whyBullets && page.whyBullets.length !== 3) {
    errors.push({
      message: `whyBullets must have length 3, got ${page.whyBullets.length}`,
    });
  }

  if (page.faqs && page.faqs.length < 4) {
    errors.push({
      message: `faqs must have at least 4 items, got ${page.faqs.length}`,
    });
  }

  if (page.faqs && page.faqs.length > 0) {
    const last = page.faqs[page.faqs.length - 1];
    const brandWarranty = normalizeBrandWarranty(
      typeof options === "string" ? undefined : options.brand
    );
    const expectedQ = normalizeForCompare(WARRANTY_QUESTIONS[brandWarranty]);
    const actualQ = normalizeForCompare(last.q);
    // For Toyota and Lexus, enforce an exact match with the canonical question text.
    // For BMW, allow per-model question variants as long as the core program phrase appears.
    if (brandWarranty === "bmw") {
      const corePhrase = "BMW Ultimate Care";
      if (!actualQ.includes(corePhrase)) {
        errors.push({
          message: `Warranty FAQ must be the final FAQ and clearly reference BMW Ultimate Care. Last q: "${last.q.slice(0, 50)}..."`,
        });
      }
    } else if (actualQ !== expectedQ) {
      errors.push({
        message: `Warranty FAQ must be the final FAQ (expected "${WARRANTY_QUESTIONS[brandWarranty].slice(0, 40)}..."). Last q: "${last.q.slice(0, 50)}..."`,
      });
    }
  }

  if (page.links && !page.links.inventoryHref) {
    errors.push({ message: "links.inventoryHref is required" });
  }

  if (page.trims && (!page.trims.intro || !Array.isArray(page.trims.sections))) {
    errors.push({ message: "trims must have intro and sections array" });
  }

  const forbiddenPaths = findForbiddenPunctuationPaths(page);
  if (forbiddenPaths.length > 0) {
    errors.push({
      message: `Forbidden punctuation (smart quotes/dashes) at: ${forbiddenPaths.join(", ")}`,
    });
  }

  if (expectedPagePath && page.pagePath !== expectedPagePath) {
    errors.push({
      message: `pagePath must be ${expectedPagePath}, got ${page.pagePath}`,
    });
  }

  const actualSlug = slugify(page.model);
  if (actualSlug !== expectedSlug) {
    errors.push({
      message: `Slug mismatch: expected ${expectedSlug}, got ${actualSlug} for model "${page.model}"`,
    });
  }

  return errors;
}

export function validatePageFilename(filename: string, expectedSlug: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const expected = `${expectedSlug}.json`;
  if (filename !== expected) {
    errors.push({ message: `Filename must be ${expected}, got ${filename}` });
  }
  return errors;
}
