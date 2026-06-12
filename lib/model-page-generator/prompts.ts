/**
 * Brand voice templates and prompt builder for LLM content generation.
 */

import * as fs from "fs";
import * as path from "path";
import type { StoreConfig } from "./schema";
import type { ModelSpec } from "./schema";
import { getModelPageConfigRoot } from "./config-path";

const MAX_QUERIES_IN_PROMPT = 15;

export interface PromptOptions {
  attemptNumber?: number;
  rejectionReason?: string;
  forbiddenSentences?: string[];
  requiredSignaturePhrase?: string;
  localTowns?: string[];
  /** Excerpts from approved same-brand pages for few-shot style. */
  approvedExcerpts?: string[];
  /** Optional specs block: "use only these numbers" or "do not state specific numeric specs". */
  specsBlock?: string;
  /** Optional brand prompt guide (e.g. bmw.md) for narrow prompts. */
  brandPromptExcerpt?: string;
  /** Optional list of real shopper queries for this model-year. */
  searchQueries?: string[];
  /** Modelpager config root (loads prompts/voice.json when set). */
  configsDir?: string;
  /** Optional exact SEO title to avoid returning verbatim. */
  forbiddenSeoTitle?: string;
  /** Optional exact SEO description to avoid returning verbatim. */
  forbiddenSeoDescription?: string;
  /**
   * When true, omit contentSections and localSeoSummary from this prompt; a second LLM pass
   * (`generateLocalSectionsOnly`, ANTHROPIC_MODEL_LOCAL) produces those fields.
   */
  skeletonPhase?: boolean;
}

const BRAND_VOICE_FALLBACK: Record<string, string> = {
  toyota: `Brand voice: Toyota. Practical, direct, confident, slightly assertive. No fluff. Transactional tone allowed ("get specific and move") but never distressed language. Emphasis: reliability, utility, real-life ownership simplicity, capability where relevant.`,
  lexus: `Brand voice: Lexus. Refined, calm confidence, hospitality-like, high-touch experience. No aggression, no hype, no hard sell. Emphasis: craftsmanship, comfort, quiet confidence, premium service experience.`,
  bmw: `Brand voice: BMW. Precision, performance-luxury, driver-focused, confident and technical without being nerdy. Emphasis: handling, engineering, performance, premium ownership experience. Transactional but not discounty.`,
};

const voiceRegistryCache = new Map<string, Record<string, string>>();

function loadVoiceRegistry(configsDir: string): Record<string, string> {
  const hit = voiceRegistryCache.get(configsDir);
  if (hit) return hit;
  const merged: Record<string, string> = { ...BRAND_VOICE_FALLBACK };
  const p = path.join(configsDir, "prompts", "voice.json");
  if (fs.existsSync(p)) {
    try {
      const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
      for (const [k, v] of Object.entries(raw)) {
        if (typeof v === "string" && v.trim()) merged[k.toLowerCase()] = v;
      }
    } catch {
      // keep fallback only
    }
  }
  voiceRegistryCache.set(configsDir, merged);
  return merged;
}

function getBrandVoice(brandSlug: string, configsDir?: string): string {
  const b = brandSlug?.toLowerCase() ?? "";
  const root = configsDir ?? getModelPageConfigRoot();
  const reg = loadVoiceRegistry(root);
  return reg[b] ?? reg.toyota ?? BRAND_VOICE_FALLBACK.toyota;
}

function getComparisonGuardrail(brandSlug: string): string {
  const b = brandSlug.toLowerCase();
  if (b === "toyota") {
    return `Comparison guardrail:
- NEVER compare Toyota models/brand against BMW or Lexus models/brand.
- Allowed comparison examples: Honda, Subaru, Hyundai, Kia, Nissan, Mazda, Volkswagen (segment-appropriate only).`;
  }
  if (b === "lexus") {
    return `Comparison guardrail:
- NEVER compare Lexus models/brand against BMW or Toyota models/brand.
- Allowed comparison examples: Acura, Mercedes-Benz, Audi, Genesis, Volvo, Infiniti, Cadillac (segment-appropriate only).`;
  }
  if (b === "bmw") {
    return `Comparison guardrail:
- NEVER compare BMW models/brand against Lexus or Toyota models/brand.
- Allowed comparison examples: Mercedes-Benz, Audi, Porsche, Alfa Romeo, Cadillac (segment-appropriate only).`;
  }
  return `Comparison guardrail:
- Never compare Toyota, BMW, and Lexus models/brands against each other.`;
}

function formatSearchQueriesBlock(
  queries: string[],
  year: number,
  make: string,
  displayName: string,
  forSkeletonPhase: boolean
): string {
  const lines = queries
    .slice(0, MAX_QUERIES_IN_PROMPT)
    .map((q) => `- "${q}"`)
    .join("\n");
  const skeletonTail = `Use them to align hero, meta, and bullets with what shoppers actually search for. FAQs for this model are generated in a separate step: do not write FAQ Q&A here.

For heroSubhead, seo.metaDescription, and whyBullets: weave in a light touch of these shopper themes where it fits naturally (one angle in the hero or meta, one bullet may echo a spec or capability shoppers ask about). Do not stuff keywords or paste queries verbatim.`;

  const fullTail = `Use them as the primary source of truth for the FAQ topics. Cluster related queries into 3–4 themes (for example: availability and ordering, range and charging, performance, trim comparison, tech and safety, or similar) and then write one question per theme that naturally paraphrases what shoppers are asking.

Do NOT copy queries word-for-word or stack many location phrases together; instead, rewrite them into natural-sounding questions and answers that feel specific to this ${year} ${make} ${displayName}. Avoid using the same generic question templates across different models. Each FAQ should clearly reflect a different cluster of these queries and should not reuse the same sentence structure.

For heroSubhead, seo.metaDescription, and whyBullets: weave in a light touch of the same shopper themes where it fits naturally (one angle in the hero or meta, one bullet may echo a spec or capability shoppers ask about). Do not stuff keywords.

For contentSections: one of the two sections should center on a high-intent theme from these queries that is not purely local geography (for example: trim comparison, reliability, EV range, performance, tech)—still written as helpful editorial copy, not a FAQ. The other section should stay focused on local ownership scenarios as usual.`;

  const tail = forSkeletonPhase ? skeletonTail : fullTail;

  return `The following lines are real search queries that shoppers use for this model-year (for context, not to copy verbatim):

${lines}

${tail}`;
}

/**
 * Build the system + user prompt for generating one page's content (SEO, hero, bullets, trims).
 * With `skeletonPhase: true`, omits contentSections/localSeoSummary (filled by `generateLocalSectionsOnly`
 * using ANTHROPIC_MODEL_LOCAL). With `skeletonPhase: false`/`undefined`, output includes those fields (monolithic).
 */
export function buildGenerationPrompt(
  store: StoreConfig,
  spec: ModelSpec,
  options: PromptOptions & { make: string; year: number; brandSlug: string }
): string {
  const city = store.location?.city ?? "Demotown";
  const state = store.location?.state ?? "PA";
  const county = store.location?.county ?? "Demo County";
  const dealerName = store.dealerName ?? "Dealer";
  const towns = options.localTowns ?? [];
  const townsPhrase =
    towns.length > 2
      ? `${towns.slice(0, -1).join(", ")}, and ${towns[towns.length - 1]}`
      : towns.join(", ");
  const voice = getBrandVoice(options.brandSlug, options.configsDir);
  const comparisonGuardrail = getComparisonGuardrail(options.brandSlug);

  const skeletonPhase = options.skeletonPhase === true;

  const hasQueries =
    options.searchQueries && options.searchQueries.length > 0;
  const searchPreamble = hasQueries
    ? `${formatSearchQueriesBlock(
        options.searchQueries!,
        options.year,
        options.make,
        spec.displayName,
        skeletonPhase
      )}\n\n`
    : "";

  let extra = "";
  if (options.attemptNumber && options.attemptNumber > 1) {
    extra += `\n\nThis is regeneration attempt ${options.attemptNumber}.`;
    if (options.rejectionReason) {
      extra += ` Previous attempt was rejected: ${options.rejectionReason}`;
    }
    extra += ` You MUST use different sentence structures, different verbs, different phrasing, and different sentence shapes. Use a different opening sentence pattern for the meta description and hero.`;
    if (options.forbiddenSentences?.length) {
      extra += ` Do NOT reuse any of these sentences: ${options.forbiddenSentences.slice(0, 5).join(" | ")}`;
    }
    if (options.localTowns && options.localTowns.length >= 2) {
      extra += ` Use different local references; consider highlighting: ${options.localTowns.join(", ")}.`;
    }
  }
  if (options.requiredSignaturePhrase) {
    extra += `\n\nYou MUST include at least this model-specific phrase (or a close variant) in the heroSubhead or trims.intro: "${options.requiredSignaturePhrase}".`;
  }
  if (options.approvedExcerpts && options.approvedExcerpts.length > 0) {
    extra += `\n\nWrite in a similar style and tone to these approved examples (same brand):\n${options.approvedExcerpts.map((e) => `---\n${e}`).join("\n")}\n---`;
  }
  if (options.specsBlock) {
    extra += `\n\n${options.specsBlock}`;
  }
  if (options.brandPromptExcerpt) {
    extra += `\n\nAdditional brand guidance (follow style and requirements):\n---\n${options.brandPromptExcerpt}\n---`;
  }
  if (options.forbiddenSeoTitle) {
    extra += `\n\nFor this regeneration, do NOT return this exact seo.title text: "${options.forbiddenSeoTitle}". Keep the same intent but use materially different wording.`;
  }
  if (options.forbiddenSeoDescription) {
    extra += `\n\nFor this regeneration, do NOT return this exact seo.metaDescription text: "${options.forbiddenSeoDescription}". Keep the same intent but use materially different wording.`;
  }

  const contentSectionRule = hasQueries
    ? `- contentSections: array of exactly 2 long-form content blocks. One section should emphasize a non-local search theme from the query list at the top (trims, reliability, performance, EV range, tech—editorial, not Q&A format). The other section should emphasize LOCAL intent and real ownership scenarios around ${city}, ${state} / ${county}. Each block must have:
  - id: short machine slug (no spaces) describing the section (e.g. "weekend_adventures", "commuter_focus", "winter_confidence"). If you are not sure, derive from the title plus intent.
  - title: heading that could be used as an H2/H3 (e.g. "Weekend Adventures Around ${county}", "Why the ${spec.displayName} Fits ${city} Commutes").
  - intent: coarse tag like "local_family_commute", "weekend_adventures", "city_parking", "winter_weather", "road_trips", or "premium_comfort".
  - bodyHtml: 1-3 short paragraphs of natural, editorial copy. Include at most 1–2 concrete local references per section where appropriate. You may use only basic HTML tags: <p>, <ul>, <ol>, <li>, <strong>, <em>, <br>. Do NOT use any other tags and absolutely no <script>.`
    : `- contentSections: array of exactly 2 long-form content blocks focused on LOCAL intent and real ownership scenarios. Each block must have:
  - id: short machine slug (no spaces) describing the section (e.g. "weekend_adventures", "commuter_focus", "winter_confidence"). If you are not sure, derive from the title plus intent.
  - title: heading that could be used as an H2/H3 (e.g. "Weekend Adventures Around ${county}", "Why the ${spec.displayName} Fits ${city} Commutes").
  - intent: coarse tag like "local_family_commute", "weekend_adventures", "city_parking", "winter_weather", "road_trips", or "premium_comfort".
  - bodyHtml: 1-3 short paragraphs of natural, editorial copy. Include at most 1–2 concrete local references per section (towns, roads, weather, parking, commuting patterns), and prefer narrative descriptions over obvious keyword strings. You may use only basic HTML tags: <p>, <ul>, <ol>, <li>, <strong>, <em>, <br>. Do NOT use any other tags and absolutely no <script>.`;

  const localBlocksConstraint = skeletonPhase
    ? `- Do NOT output "contentSections" or "localSeoSummary". Long-form local SEO blocks and the one-line local summary are produced in a separate generation step; including them in this response will break the pipeline.`
    : `${contentSectionRule}
- localSeoSummary: 1 concise sentence (plain text, no HTML) that summarizes why this model is a strong fit for drivers in ${city}, ${state} / ${county}. It should sound like a natural sentence and must NOT duplicate the meta description or repeat the city/county more than once.`;

  const jsonShape = skeletonPhase
    ? `{
  "seo": { "title": "...", "metaDescription": "..." },
  "heroSubhead": "...",
  "whyBullets": ["...", "...", "..."],
  "trims": { "intro": "...", "sections": [ { "title": "...", "items": [ { "label": "...", "note": "..." } ] }, { "title": "...", "items": [ { "label": "...", "note": "..." } ] } ] }
}`
    : `{
  "seo": { "title": "...", "metaDescription": "..." },
  "heroSubhead": "...",
  "whyBullets": ["...", "...", "..."],
  "trims": { "intro": "...", "sections": [ { "title": "...", "items": [ { "label": "...", "note": "..." } ] }, { "title": "...", "items": [ { "label": "...", "note": "..." } ] } ] },
  "contentSections": [
    { "id": "...", "title": "...", "intent": "...", "bodyHtml": "..." },
    { "id": "...", "title": "...", "intent": "...", "bodyHtml": "..." }
  ],
  "localSeoSummary": "..."
}`;

  const prompt = `You are writing LOCAL SEO content for a single dealer model-year page. Output ONLY valid JSON, no markdown or explanation.

${searchPreamble}${voice}
${comparisonGuardrail}

Store: ${dealerName}, ${city}, ${state}. County: ${county}.${townsPhrase ? ` Nearby towns for local references: ${townsPhrase}.` : ""}

Model: ${options.year} ${options.make} ${spec.displayName}. Category: ${spec.category}.

Constraints:
- seo.title: unique, 50-60 chars max, include locality (e.g. ${city}, ${state} or ${county}) when it fits, but do not repeat the locality more than once in the title.
- seo.metaDescription: unique, 150-158 chars max. Clearly describe the model, highlight 1–2 compelling strengths, and end with a single CTA sentence (e.g. "Schedule a test drive."). Include local context naturally (mention the city or county once if it fits), but do NOT cram multiple city/county mentions or keyword-style strings.
- heroSubhead: one short paragraph (1–2 sentences), model-anchored and locally relevant. Include at least one concrete local reference (road, commute pattern, weather, parking, or similar) but avoid repeating the city/county name multiple times; it should read like natural editorial copy, not a list of SEO phrases.
- whyBullets: array of exactly 3 strings. Each bullet must be a reason to buy or own THIS VEHICLE (handling, tech, comfort, cargo, electric range, design, driving experience). Name the model (e.g. 3 Series, X5) in at most 1 or 2 bullets. Do NOT use dealer logistics: no "test drives at [dealer]", "service at [dealer]", or "in stock at [dealer]"—any dealer offers test drives; bullets must sell the MODEL. Do NOT use vague taglines like "Premium ownership for the [model] at [dealer]". Good: "Razor-sharp handling with a balanced chassis." "M Sport steering and adaptive suspension for precise turns." "iDrive 9 and a driver-focused cabin you will use every day." Bad: "Test drives at BMW of Demotown." "Premium ownership for the 2026 3 Series at BMW of Demotown, Demotown."
- trims: { "intro": string, "sections": [ { "title": string, "items": [ { "label": string, "note": string } ] }, ... ] }. Exactly 2 sections. Model-anchored, not repeated from other pages.
${localBlocksConstraint}

Use normal ASCII quotes and apostrophes. Use ", " (comma space) instead of em or en dashes. No smart quotes.
${extra}

Output JSON in this exact shape:
${jsonShape}`;

  return prompt;
}

/**
 * Build a short prompt that asks ONLY for 3 model-specific why bullets.
 * Used when regenerating why bullets for existing pages (e.g. BMW).
 */
export function buildWhyBulletsOnlyPrompt(
  store: StoreConfig,
  spec: ModelSpec,
  options: {
    make: string;
    year: number;
    brandSlug: string;
    brandPromptExcerpt?: string;
    configsDir?: string;
  }
): string {
  const city = store.location?.city ?? "Demotown";
  const state = store.location?.state ?? "PA";
  const county = store.location?.county ?? "Demo County";
  const voice = getBrandVoice(options.brandSlug, options.configsDir);
  const comparisonGuardrail = getComparisonGuardrail(options.brandSlug);

  let extra = "";
  if (options.brandPromptExcerpt) {
    extra += `\n\nAdditional brand guidance (follow style and requirements):\n---\n${options.brandPromptExcerpt}\n---`;
  }

  return `You are writing 3 short "why buy" bullets for a single dealer model-year page. Output ONLY valid JSON.

${voice}
${comparisonGuardrail}

Store: ${store.dealerName ?? "Dealer"}, ${city}, ${state}. County: ${county}.

Model: ${options.year} ${options.make} ${spec.displayName}. Category: ${spec.category}.

Requirements:
- Output exactly 3 bullets. Each bullet must be a reason to buy or own THIS VEHICLE (handling, tech, comfort, cargo, electric range, design, driving experience). Name the model (e.g. ${spec.displayName}) in at most 1 or 2 bullets. Do NOT use dealer logistics: no "test drives at [dealer]", "service at [dealer]", or "in stock at [dealer]"—any dealer offers test drives; bullets must sell the MODEL.
- Do NOT use vague taglines like "Premium ownership for the [model] at [dealer]" or generic filler like "configurations that respect what is actually available".
- Good: "Razor-sharp handling with a balanced chassis." "M Sport steering and adaptive suspension for precise turns." "iDrive 9 and a driver-focused cabin you will use every day." Bad: "Test drives at BMW of Demotown." "Premium ownership for the 2026 3 Series at BMW of Demotown, Demotown."
- Keep each bullet concise (under ~80 chars). Use normal ASCII quotes. No smart quotes.
${extra}

Output JSON in this exact shape:
{ "whyBullets": ["...", "...", "..."] }`;
}

/**
 * Build a compact prompt that asks ONLY for FAQs for a model.
 * Requests 4 well-researched, purchase-intent FAQs; the 5th (brand maintenance) is added in code.
 */
export function buildFaqsOnlyPrompt(
  store: StoreConfig,
  spec: ModelSpec,
  options: {
    make: string;
    year: number;
    brandSlug: string;
    brandPromptExcerpt?: string;
    searchQueries?: string[];
    configsDir?: string;
  }
): string {
  const city = store.location?.city ?? "Demotown";
  const state = store.location?.state ?? "PA";
  const county = store.location?.county ?? "Demo County";
  const dealerName = store.dealerName ?? "Dealer";
  const voice = getBrandVoice(options.brandSlug, options.configsDir);
  const comparisonGuardrail = getComparisonGuardrail(options.brandSlug);

  const hasQueries =
    options.searchQueries && options.searchQueries.length > 0;
  const searchBlock = hasQueries
    ? `${formatSearchQueriesBlock(
        options.searchQueries!,
        options.year,
        options.make,
        spec.displayName,
        false
      )}\n\n`
    : "";

  let extra = "";
  if (options.brandPromptExcerpt) {
    extra += `\n\nAdditional brand guidance (follow style and requirements):\n---\n${options.brandPromptExcerpt}\n---`;
  }

  const faqRequirements = hasQueries
    ? `Requirements:
- Output exactly 4 FAQs in an array called "faqs". Base the questions on what users with purchase intent actually search for, using the query list at the start of this prompt as your primary input (availability and ordering, what is new, local fit, trim comparison, incentives, reliability, range/charging, etc.).
- First, mentally group those queries into 3–4 themes that best represent how shoppers research this ${options.year} ${options.make} ${spec.displayName}. Then write one question per theme that paraphrases those queries instead of reusing the same generic question templates across different models.
- At least one FAQ should clearly address availability and ordering at ${dealerName} (allocation, in-stock vs incoming, what "in transit" means, realistic timing), but the remaining FAQs should follow the strongest remaining search themes for this specific model and powertrain.
- FAQ set overall should cover a mix of queries related to availability, what is new or meaningfully different, fit for local drivers, and at least one or two transactional topics (lease and finance offers, test drives, reliability, or similar) that would make good internal links to financing or sales pages.
- Each answer: 3–6 sentences with researchable details. Where it is natural, include a small number of phrases that could be used as internal links, such as "${options.make} ${spec.displayName} lease offers in ${city}", "${options.make} ${spec.displayName} financing near ${city}", or "${options.make} service in ${city}, ${state}". Across all 4 FAQs, 2–3 such transactional/local phrases is enough; do not fabricate pricing or stock, and avoid repeating the same keyword-like phrase multiple times.
- Do NOT include the brand's complimentary maintenance/warranty FAQ (ToyotaCare, LexusCare, or BMW Ultimate Care); that is added as the 5th FAQ in code.
- Use normal ASCII quotes and apostrophes. Use ", " (comma space) instead of em or en dashes. No smart quotes.`
    : `Requirements:
- Output exactly 4 FAQs in an array called "faqs". Base questions on high-intent topics shoppers typically research for this ${options.year} ${options.make} ${spec.displayName} (availability at ${dealerName}, what is new, local fit, trims, incentives, reliability, range/charging for EVs, etc.). There is no external query list for this run—infer themes from the model and category.
- At least one FAQ should clearly address availability and ordering at ${dealerName}.
- FAQ set should include transactional topics where natural (lease, finance, test drives) suitable for internal links.
- Each answer: 3–6 sentences with researchable details; do not fabricate pricing or stock.
- Do NOT include the brand's complimentary maintenance/warranty FAQ; that is added as the 5th FAQ in code.
- Use normal ASCII quotes and apostrophes. Use ", " (comma space) instead of em or en dashes. No smart quotes.`;

  return `${searchBlock}You are writing FAQs for a single dealer model-year page. Output ONLY valid JSON.

${voice}
${comparisonGuardrail}

Store: ${dealerName}, ${city}, ${state}. County: ${county}.

Model: ${options.year} ${options.make} ${spec.displayName}. Category: ${spec.category}.

${faqRequirements}
${extra}

Output JSON in this exact shape:
{ "faqs": [ { "q": "...", "a": "..." }, { "q": "...", "a": "..." }, { "q": "...", "a": "..." }, { "q": "...", "a": "..." } ] }`;
}

/**
 * Build a compact prompt for only local long-form content sections and a local SEO summary.
 * Used to regenerate LOCAL copy without touching SEO title/meta or trims.
 */
export function buildLocalSectionsPrompt(
  store: StoreConfig,
  spec: ModelSpec,
  options: {
    make: string;
    year: number;
    brandSlug: string;
    brandPromptExcerpt?: string;
    searchQueries?: string[];
    configsDir?: string;
  }
): string {
  const city = store.location?.city ?? "Demotown";
  const state = store.location?.state ?? "PA";
  const county = store.location?.county ?? "Demo County";
  const dealerName = store.dealerName ?? "Dealer";
  const voice = getBrandVoice(options.brandSlug, options.configsDir);
  const comparisonGuardrail = getComparisonGuardrail(options.brandSlug);

  const hasQueries =
    options.searchQueries && options.searchQueries.length > 0;
  const searchBlock = hasQueries
    ? `${formatSearchQueriesBlock(
        options.searchQueries!,
        options.year,
        options.make,
        spec.displayName,
        false
      )}\n\n`
    : "";

  let extra = "";
  if (options.brandPromptExcerpt) {
    extra += `\n\nAdditional brand guidance (follow style and requirements):\n---\n${options.brandPromptExcerpt}\n---`;
  }

  const sectionSplit = hasQueries
    ? `- One contentSection should focus on a high-intent theme from the query list at the top (not only local geography). The other should focus on local ownership around ${city}, ${state} / ${county}.`
    : `- Each content section must describe real ownership scenarios for drivers around ${city}, ${state} / ${county}, but keep location mentions light and natural:
  examples: daily commuting, winter driving, weekend drives, family errands, parking and charging (for EVs), highway comfort.`;

  return `${searchBlock}You are writing LOCAL long-form content for a single dealer model-year page. Output ONLY valid JSON.

${voice}
${comparisonGuardrail}

Store: ${dealerName}, ${city}, ${state}. County: ${county}.

Model: ${options.year} ${options.make} ${spec.displayName}. Category: ${spec.category}.

Requirements:
- Output exactly 2 objects in "contentSections", plus one "localSeoSummary" string.
${sectionSplit}
- Each section object must have:
  - id: a short machine slug (no spaces) derived from the title, e.g. "commuter_focus", "weekend_adventures", "winter_confidence".
  - title: heading that could be used as an H2/H3, such as "Why the ${spec.displayName} Fits ${city} Commutes".
  - intent: coarse tag like "local_family_commute", "weekend_adventures", "city_parking", "winter_weather", "road_trips", or "premium_comfort".
  - bodyHtml: 1–3 short paragraphs of HTML describing how this ${spec.displayName} behaves in those scenarios. Include at most 1–2 concrete local references per section (roads, towns, weather, parking, commuting patterns), and prefer narrative descriptions over obvious keyword strings.
- bodyHtml may use only these tags: <p>, <ul>, <ol>, <li>, <strong>, <em>, <br>. Do NOT use any other tags and absolutely no <script>.
- localSeoSummary: 1 plain-text sentence (no HTML) that summarizes why this ${spec.displayName} is a smart choice for drivers around ${city} and ${county}. It must NOT duplicate the meta description from the main page, and should mention the city/county at most once in a natural way.
- Use normal ASCII quotes and apostrophes only. Use commas or periods instead of em/en dashes. No smart quotes.
${extra}

Output JSON in this exact shape:
{
  "contentSections": [
    { "id": "...", "title": "...", "intent": "...", "bodyHtml": "..." },
    { "id": "...", "title": "...", "intent": "...", "bodyHtml": "..." }
  ],
  "localSeoSummary": "..."
}`;
}
