/**
 * Dry-run report: uniqueness scores, title/description lengths, CTA distribution, duplicate sentence report.
 */

import type { ModelYearPage } from "./schema";
import type { GateResult } from "./uniqueness-gate";
import { MAX_REGENERATION_ATTEMPTS } from "./config";

export interface ReportInput {
  pages: ModelYearPage[];
  gateResults: GateResult[];
  /** Optional: regeneration attempt counts per model (index). */
  attemptCounts?: number[];
  /** Optional: max attempts used (for "max attempts reached" section). */
  maxAttempts?: number;
}

/**
 * Generate a Markdown report for dry-run output.
 */
export function generateReport(input: ReportInput): string {
  const { pages, gateResults, attemptCounts, maxAttempts = MAX_REGENERATION_ATTEMPTS } = input;
  const lines: string[] = [
    "# Dry-Run Report",
    "",
    `**Total pages:** ${pages.length}`,
    "",
    "## Summary",
    "",
  ];

  const passed = gateResults.filter((r) => r.passed).length;
  lines.push(`- Passed uniqueness gate: ${passed}/${pages.length}`);
  if (attemptCounts && attemptCounts.length > 0) {
    const maxAttempts = Math.max(...attemptCounts);
    const avgAttempts = attemptCounts.reduce((a, b) => a + b, 0) / attemptCounts.length;
    lines.push(`- Max regeneration attempts: ${maxAttempts}`);
    lines.push(`- Avg regeneration attempts: ${avgAttempts.toFixed(1)}`);
  }
  lines.push("");

  lines.push("## Per-Page Details");
  lines.push("");
  lines.push("| Model | Title Len | Desc Len | CTA | Gate | Attempts | Intra |");
  lines.push("|-------|-----------|----------|-----|------|----------|-------|");

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const gate = gateResults[i];
    const titleLen = page.seo?.title?.length ?? 0;
    const descLen = page.seo?.metaDescription?.length ?? 0;
    const cta = page.seo?.metaDescription?.split(/[.!?]\s*$/).pop()?.trim() ?? "";
    const ctaDisplay = cta.length > 33 ? cta.slice(0, 30) + "..." : cta;
    const gateStatus = gate?.passed ? "pass" : "fail";
    const attemptsStr = attemptCounts && attemptCounts[i] != null ? String(attemptCounts[i]) : "—";
    const intraStr = gate?.scores?.intraBatch != null ? (gate.scores.intraBatch * 100).toFixed(1) + "%" : "—";
    lines.push(`| ${page.model} | ${titleLen} | ${descLen} | ${ctaDisplay} | ${gateStatus} | ${attemptsStr} | ${intraStr} |`);
  }
  lines.push("");

  const withScores = gateResults
    .map((g, i) => ({ model: pages[i].model, maxScore: Math.max(0, ...Object.values(g.scores ?? {})) }))
    .filter((x) => x.maxScore > 0)
    .sort((a, b) => b.maxScore - a.maxScore)
    .slice(0, 15);
  if (withScores.length > 0) {
    lines.push("## Top Similarity Offenders");
    lines.push("");
    for (const { model, maxScore } of withScores) {
      lines.push(`- ${model}: max score ${(maxScore * 100).toFixed(2)}%`);
    }
    lines.push("");
  }

  const maxAttemptsHit = attemptCounts ? pages.map((_, i) => i).filter((i) => (attemptCounts[i] ?? 0) >= maxAttempts) : [];
  if (maxAttemptsHit.length > 0) {
    lines.push("## Max Attempts Reached");
    lines.push("");
    lines.push("Pages that hit the regeneration limit (best candidate returned):");
    for (const i of maxAttemptsHit) {
      lines.push(`- ${pages[i].model}`);
    }
    lines.push("");
  }

  const failed = gateResults.filter((r) => !r.passed);
  if (failed.length > 0) {
    lines.push("## Gate Failures");
    lines.push("");
    for (let i = 0; i < gateResults.length; i++) {
      if (!gateResults[i].passed) {
        lines.push(`### ${pages[i].model}`);
        for (const f of gateResults[i].failures) {
          lines.push(`- ${f}`);
        }
        if (Object.keys(gateResults[i].scores).length > 0) {
          lines.push("Scores: " + JSON.stringify(gateResults[i].scores));
        }
        lines.push("");
      }
    }
    lines.push("## Recommendations for Threshold Tuning");
    lines.push("");
    lines.push("- If too many failures: increase `--threshold-intra`, `--threshold-cross`, or `--threshold-lexus` by 0.01–0.02.");
    lines.push("- If content is too similar: decrease thresholds or increase `--max-attempts`.");
    lines.push("- Use `tuning.analyzeSimilarityDistribution` and `tuning.recommendThresholds` to inspect distributions.");
    lines.push("");
  }

  const overTitle = pages.filter((p) => (p.seo?.title?.length ?? 0) > 60);
  const overDesc = pages.filter((p) => (p.seo?.metaDescription?.length ?? 0) > 158);
  if (overTitle.length > 0 || overDesc.length > 0) {
    lines.push("## Length Warnings");
    lines.push("");
    if (overTitle.length > 0) {
      lines.push(`- Titles over 60 chars: ${overTitle.map((p) => p.model).join(", ")}`);
    }
    if (overDesc.length > 0) {
      lines.push(`- Descriptions over 158 chars: ${overDesc.map((p) => p.model).join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
