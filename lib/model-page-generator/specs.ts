/**
 * Resolve authoritative spec data per model/year and build prompt block.
 * Prefer specs file (configs/pages/<brand>/<year>/specs-<year>.json), fallback to inline spec on ModelSpec.
 */

import * as fs from "fs";
import * as path from "path";
import type { ModelSpec, ModelSpecs } from "./schema";

export interface SpecsOptions {
  year: number;
  brandSlug: string;
  configsDir?: string;
}

/**
 * Load specs from configs/pages/<brand>/<year>/specs-<year>.json keyed by model displayName.
 */
function loadSpecsFile(configsDir: string, brandSlug: string, year: number): Record<string, ModelSpecs> {
  const filePath = path.join(configsDir, "pages", brandSlug.toLowerCase(), String(year), `specs-${year}.json`);
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, ModelSpecs> = {};
    for (const [key, val] of Object.entries(data)) {
      if (val != null && typeof val === "object" && !Array.isArray(val)) {
        out[key] = val as ModelSpecs;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Format a single spec object as a short bullet list for the prompt.
 */
function formatSpecs(specs: ModelSpecs): string {
  const parts: string[] = [];
  if (specs.mpgCity != null) parts.push(`MPG city: ${specs.mpgCity}`);
  if (specs.mpgHighway != null) parts.push(`MPG highway: ${specs.mpgHighway}`);
  if (specs.horsepower != null) parts.push(`Horsepower: ${specs.horsepower}`);
  if (specs.torque != null) parts.push(`Torque: ${specs.torque} lb-ft`);
  if (specs.engine != null) parts.push(`Engine: ${specs.engine}`);
  for (const [k, v] of Object.entries(specs)) {
    if (v === undefined || v === null) continue;
    if (["mpgCity", "mpgHighway", "horsepower", "torque", "engine"].includes(k)) continue;
    parts.push(`${k}: ${v}`);
  }
  return parts.join("; ");
}

/**
 * Return the prompt block for specifications: either "use only these numbers" or "do not state specific numeric specs".
 */
export function getSpecsBlock(spec: ModelSpec, options: SpecsOptions): string {
  const fromFile =
    options.configsDir != null
      ? loadSpecsFile(options.configsDir, options.brandSlug, options.year)[spec.displayName]
      : undefined;
  const specs = spec.specs ?? fromFile;

  if (specs != null && Object.keys(specs).length > 0) {
    const formatted = formatSpecs(specs);
    return `Specifications (use ONLY these numbers when mentioning fuel economy, power, or other specs; do not invent any figures): ${formatted}. If you mention a spec not listed here, phrase it in general terms or say it varies by trim.`;
  }
  return "Do not state specific MPG, horsepower, or other numeric specifications. Speak in general terms (e.g. efficient, capable) or say availability and specs vary by trim.";
}
