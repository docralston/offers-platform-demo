import type { ModelSpec, ModelYearPage, StoreConfig } from "./schema";
import { callInternalLinksLlm, extractJsonFromResponse } from "./llm-client";

export type InternalLinkType =
  | "newInventory"
  | "usedInventory"
  | "trade"
  | "scheduleService"
  | "finance"
  | "tires"
  | "specials"
  | "performance";

export interface InternalLinkTarget {
  type: InternalLinkType;
  href: string; // absolute URL
  suggestedAnchors: string[]; // 2-3 locally-focused anchor phrase templates
  description: string; // short human description used by the prompt
}

function joinUrl(base: string, p: string): string {
  const b = String(base || "").replace(/\/+$/, "");
  const pp = String(p || "").replace(/^\/+/, "/");
  if (!b) return pp;
  return b + pp;
}

function toAbsoluteHref(store: StoreConfig, href: string): string {
  const h = String(href || "").trim();
  if (!h) return "";
  if (/^https?:\/\//i.test(h)) return h;
  return joinUrl(store.siteUrl || "", h);
}

function getLocation(store: StoreConfig): {
  city: string;
  state: string;
  county: string;
} {
  return {
    city: store.location?.city ?? "Demotown",
    state: store.location?.state ?? "PA",
    county: store.location?.county ?? "Demo County",
  };
}

function buildSuggestedAnchors(type: InternalLinkType): string[] {
  // These are templates; the prompt also includes real page context
  // and the model should fill in {model}/{city}/{county}.
  switch (type) {
    case "newInventory":
      return [
        "browse new {model} inventory near {city}",
        "shop new {model} in {county}",
        "see new {model} models available in {city}",
      ];
    case "usedInventory":
      return [
        "find used {model} inventory near {city}",
        "explore certified pre-owned {model} in {county}",
        "browse pre-owned {model} near {city}",
      ];
    case "trade":
      return [
        "get your trade-in value near {city}",
        "value your vehicle trade in {county}",
        "sell your {model} trade-in for instant cash",
      ];
    case "scheduleService":
      return [
        "schedule a {brand} service appointment in {city}",
        "book {brand} service near {county}",
        "arrange {brand} maintenance in {city}",
      ];
    case "finance":
      return [
        "apply for {brand} financing near {city}",
        "see lease and financing options in {county}",
        "check {brand} monthly payments near {city}",
      ];
    case "tires":
      return [
        "visit the tire center in {city}",
        "get tire service near {county}",
        "upgrade to new tires in {city}",
      ];
    case "specials":
      return [
        "view current {brand} specials in {city}",
        "check {brand} lease and finance offers near {county}",
        "see new {brand} deals in {city}",
      ];
    case "performance":
      return [
        "enhance your {model} with performance upgrades",
        "explore {brand} performance options in {city}",
        "learn about performance tuning near {county}",
      ];
    default:
      return ["{brand} {model} offers near {city}"];
  }
}

export function buildLinkMap(
  store: StoreConfig,
  _brandSlug: string,
  _locationOverride?: { city?: string; state?: string; county?: string }
): InternalLinkTarget[] {
  const rawLoc = _locationOverride ?? getLocation(store);
  const city = rawLoc.city ?? "Demotown";
  const state = rawLoc.state ?? "PA";
  const county = rawLoc.county ?? "Demo County";

  // Keep types stable; drop targets that aren't configured for the store.
  const rawTargets: Array<{
    type: InternalLinkType;
    href?: string;
    description: string;
  }> = [
    { type: "newInventory", href: store.links?.newInventory, description: "Browse new inventory" },
    { type: "usedInventory", href: store.links?.usedInventory, description: "Browse used/certified inventory" },
    { type: "trade", href: store.links?.trade, description: "Trade-in value / offer" },
    {
      type: "scheduleService",
      href: store.links?.scheduleService ?? store.links?.service,
      description: "Schedule service appointment",
    },
    { type: "finance", href: store.links?.finance, description: "Apply for financing / see payments" },
    { type: "tires", href: store.links?.tires, description: "Tire center / tire service" },
    { type: "specials", href: store.links?.specials, description: "Current specials / offers" },
    { type: "performance", href: store.links?.performance, description: "Performance upgrades (BMW only)" },
  ];

  return rawTargets
    .filter((t) => !!t.href)
    .map((t) => ({
      type: t.type,
      href: toAbsoluteHref(store, t.href as string),
      description: t.description,
      suggestedAnchors: buildSuggestedAnchors(t.type).map((s) =>
        s
          .replace("{city}", city)
          .replace("{county}", county)
          .replace("{state}", state)
      ),
    }))
    .filter((t) => !!t.href);
}

export function buildInternalLinksPrompt(
  heroSubhead: string,
  trimsIntro: string,
  contentSections: NonNullable<ModelYearPage["contentSections"]>,
  faqs: NonNullable<ModelYearPage["faqs"]>,
  linkMap: InternalLinkTarget[],
  context: {
    year: number;
    brand: string;
    make: string;
    model: string;
    city: string;
    state: string;
    county: string;
  }
): string {
  const linkMapJson = JSON.stringify(linkMap, null, 2);
  const pageJson = JSON.stringify(
    {
      heroSubhead,
      trimsIntro,
      contentSections,
      faqs,
    },
    null,
    2
  );

  return `You are editing the HTML content of an auto dealer model-year page.
Your task: insert INTERNAL LINKS into existing HTML by wrapping existing phrases with <a href="...">...</a>.

RULES (follow strictly):
- Only use the provided link targets' href values; do not invent URLs.
- Insert <a> tags only (do not add new elements, do not restructure paragraphs, do not add headings).
- Do NOT nest <a> inside an existing <a>.
- Preserve the meaning and keep the surrounding text intact.
- Total link budget: 6-10 <a> tags across heroSubhead, trimsIntro, contentSections.bodyHtml, and faqs.a. Max 2 per field/section/answer.
- Use at least 4 different href values from the link targets when there are at least 4 targets; spread them across sections and FAQ answers (not all in one paragraph).
- Place at least 1 link in heroSubhead or trimsIntro.
- Positional spread requirement for contentSections.bodyHtml:
  - Place at least 1 link in an early sentence (first 35% of the section text) across the content sections.
  - Place at least 1 link in a mid-body sentence (35% to 75% of the section text) across the content sections.
  - Do not place all links at paragraph endings or in final CTA-only sentences.
- Anchor text must be transactional and locally focused (include {city} or {county} naturally when it fits).
- For safety, do not include any <script> tags.

Context:
- brand: ${context.brand}
- make: ${context.make}
- model: ${context.model}
- year: ${context.year}
- city: ${context.city}
- state: ${context.state}
- county: ${context.county}

Available link targets (absolute hrefs):
${linkMapJson}

Page content to edit (HTML strings are already valid):
${pageJson}

Output ONLY valid JSON with this exact shape:
{
  "heroSubhead": "...",
  "trimsIntro": "...",
  "contentSections": [
    { "id": "...", "title": "...", "intent": "...", "bodyHtml": "..." }
  ],
  "faqs": [
    { "q": "...", "a": "..." }
  ]
}
Return the arrays with the same length and ordering as the input.`;
}

function escapeHtmlText(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function countAnchorsInLinked(
  heroSubhead: string | undefined,
  trimsIntro: string | undefined,
  contentSections: ModelYearPage["contentSections"],
  faqs: ModelYearPage["faqs"]
): number {
  let n = 0;
  n += (String(heroSubhead ?? "").match(/<a\s+[^>]*\bhref\s*=/gi) ?? []).length;
  n += (String(trimsIntro ?? "").match(/<a\s+[^>]*\bhref\s*=/gi) ?? []).length;
  for (const sec of contentSections ?? []) {
    n += (String(sec?.bodyHtml ?? "").match(/<a\s+[^>]*\bhref\s*=/gi) ?? []).length;
  }
  for (const f of faqs ?? []) {
    n += (String(f?.q ?? "").match(/<a\s+[^>]*\bhref\s*=/gi) ?? []).length;
    n += (String(f?.a ?? "").match(/<a\s+[^>]*\bhref\s*=/gi) ?? []).length;
  }
  return n;
}

function normalizeLinkedResult(
  originalHeroSubhead: string,
  originalTrimsIntro: string,
  originalCs: NonNullable<ModelYearPage["contentSections"]>,
  originalFaqs: NonNullable<ModelYearPage["faqs"]>,
  parsed: unknown
): Pick<ModelYearPage, "heroSubhead" | "trims" | "contentSections" | "faqs"> | null {
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as {
    heroSubhead?: unknown;
    trimsIntro?: unknown;
    contentSections?: unknown;
    faqs?: unknown;
  };
  if (!Array.isArray(obj.contentSections) || !Array.isArray(obj.faqs)) return null;
  if (
    obj.contentSections.length !== originalCs.length ||
    obj.faqs.length !== originalFaqs.length
  ) {
    return null;
  }
  const contentSections = obj.contentSections.map((sec: Record<string, unknown>, i: number) => {
    const o = originalCs[i]!;
    const bodyHtml = typeof sec.bodyHtml === "string" ? sec.bodyHtml : o.bodyHtml;
    return {
      ...o,
      id: o.id,
      title: typeof sec.title === "string" ? sec.title : o.title,
      intent: typeof sec.intent === "string" ? sec.intent : o.intent,
      bodyHtml,
    };
  }) as NonNullable<ModelYearPage["contentSections"]>;

  const faqs = obj.faqs.map((f: Record<string, unknown>, i: number) => {
    const o = originalFaqs[i]!;
    return {
      q: typeof f.q === "string" ? f.q : o.q,
      a: typeof f.a === "string" ? f.a : o.a,
    };
  }) as NonNullable<ModelYearPage["faqs"]>;

  const heroSubhead =
    typeof obj.heroSubhead === "string" ? obj.heroSubhead : originalHeroSubhead;
  const trimsIntro =
    typeof obj.trimsIntro === "string" ? obj.trimsIntro : originalTrimsIntro;

  return {
    heroSubhead,
    trims: { intro: trimsIntro, sections: [] },
    contentSections,
    faqs,
  };
}

/** Last resort if the LLM returns no usable anchors (still only store-approved hrefs). */
function applyProgrammaticFallback(
  heroSubhead: string,
  trimsIntro: string,
  originalContentSections: ModelYearPage["contentSections"],
  faqs: NonNullable<ModelYearPage["faqs"]>,
  linkMap: InternalLinkTarget[],
  city: string,
  county: string
): Pick<ModelYearPage, "heroSubhead" | "trims" | "contentSections" | "faqs"> {
  const hrefOf = (type: InternalLinkType) =>
    linkMap.find((t) => t.type === type)?.href;
  const inv = hrefOf("newInventory");
  const fin = hrefOf("finance");
  const sp = hrefOf("specials");
  const used = hrefOf("usedInventory");
  const svc = hrefOf("scheduleService");

  const ec = escapeHtmlText(city);
  const ey = escapeHtmlText(county);
  const chunks: string[] = [];
  if (inv)
    chunks.push(`<a href="${inv}">shop new inventory near ${ec}</a>`);
  if (fin)
    chunks.push(`<a href="${fin}">apply for financing in ${ey}</a>`);
  if (sp) chunks.push(`<a href="${sp}">view current lease and finance offers</a>`);
  if (used)
    chunks.push(`<a href="${used}">browse used inventory near ${ec}</a>`);
  if (chunks.length < 3 && svc)
    chunks.push(`<a href="${svc}">schedule a service visit</a>`);

  const tail =
    chunks.length > 0
      ? `<p class="tto-body">If you are ready for the next step: ${chunks.slice(0, 4).join(", ")}.</p>`
      : "";

  const sections = originalContentSections ?? [];

  if (!tail) {
    return {
      heroSubhead,
      trims: { intro: trimsIntro, sections: [] },
      contentSections: originalContentSections,
      faqs: [...faqs],
    };
  }

  if (sections.length > 0) {
    const next = sections.map((s, i) =>
      i === 0
        ? { ...s, bodyHtml: String(s.bodyHtml ?? "") + tail }
        : { ...s }
    );
    return {
      heroSubhead,
      trims: { intro: trimsIntro, sections: [] },
      contentSections: next,
      faqs: [...faqs],
    };
  }

  if (faqs.length > 0) {
    const next = faqs.map((f, i) =>
      i === 0 ? { ...f, a: String(f.a ?? "") + tail } : { ...f }
    );
    return {
      heroSubhead,
      trims: { intro: trimsIntro, sections: [] },
      contentSections: originalContentSections,
      faqs: next,
    };
  }

  return {
    heroSubhead,
    trims: { intro: trimsIntro, sections: [] },
    contentSections: originalContentSections,
    faqs: [...faqs],
  };
}

export async function injectInternalLinks(
  page: ModelYearPage,
  store: StoreConfig,
  spec: ModelSpec,
  options: {
    brandSlug: string;
  }
): Promise<Pick<ModelYearPage, "heroSubhead" | "trims" | "contentSections" | "faqs">> {
  const contentSections = page.contentSections ?? [];
  const faqs = page.faqs ?? [];
  const heroSubhead = page.heroSubhead ?? "";
  const trimsIntro = page.trims?.intro ?? "";
  const loc = getLocation(store);

  const linkMap = buildLinkMap(store, options.brandSlug);
  if (linkMap.length < 2) {
    return {
      heroSubhead: page.heroSubhead,
      trims: page.trims,
      contentSections: page.contentSections,
      faqs: page.faqs,
    };
  }

  try {
    const basePrompt = buildInternalLinksPrompt(
      heroSubhead,
      trimsIntro,
      contentSections,
      faqs,
      linkMap,
      {
        year: page.year,
        brand: store.brand ?? store.storeKey ?? spec.category,
        make: store.brand ?? page.make,
        model: page.model ?? spec.displayName,
        city: loc.city,
        state: loc.state,
        county: loc.county,
      }
    );

    const minAnchors = Math.min(4, linkMap.length);
    let promptText = basePrompt;
    let lastMerged: Pick<
      ModelYearPage,
      "heroSubhead" | "trims" | "contentSections" | "faqs"
    > | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      let raw: string;
      try {
        raw = await callInternalLinksLlm(promptText, {
          tags: {
            brandSlug: options.brandSlug,
            make: store.brand ?? page.make,
            year: page.year,
            model: page.model ?? spec.displayName,
          },
        });
      } catch (llmErr) {
        console.warn("injectInternalLinks: LLM request failed:", llmErr);
        promptText =
          basePrompt +
          "\n\nCRITICAL: Previous API request failed. Output valid JSON only, same array lengths as input.";
        continue;
      }
      const jsonText = extractJsonFromResponse(raw);
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonText) as unknown;
      } catch {
        promptText =
          basePrompt +
          "\n\nCRITICAL: Your previous reply was not valid JSON. Return one JSON object only, no markdown fences, no commentary.";
        continue;
      }

      const merged = normalizeLinkedResult(
        heroSubhead,
        trimsIntro,
        contentSections,
        faqs,
        parsed
      );
      if (!merged) {
        promptText =
          basePrompt +
          "\n\nCRITICAL: You must return contentSections and faqs arrays with the SAME lengths as the input. Same order and count of items.";
        continue;
      }

      lastMerged = merged;
      const ac = countAnchorsInLinked(
        merged.heroSubhead,
        merged.trims?.intro,
        merged.contentSections,
        merged.faqs
      );
      if (ac >= minAnchors) {
        return merged;
      }

      promptText =
        basePrompt +
        `\n\nCRITICAL: Your answer had insufficient <a href> tags (found ${ac}, need at least ${minAnchors}). Wrap natural phrases in the existing copy using ONLY hrefs from the link map.`;
    }

    if (lastMerged) {
      const ac = countAnchorsInLinked(
        lastMerged.heroSubhead,
        lastMerged.trims?.intro,
        lastMerged.contentSections,
        lastMerged.faqs
      );
      if (ac > 0) {
        return lastMerged;
      }
    }

    return applyProgrammaticFallback(
      heroSubhead,
      trimsIntro,
      page.contentSections,
      faqs,
      linkMap,
      loc.city,
      loc.county
    );
  } catch (e) {
    console.error("injectInternalLinks: unexpected error, using link fallback:", e);
    return applyProgrammaticFallback(
      heroSubhead,
      trimsIntro,
      page.contentSections,
      faqs,
      linkMap,
      loc.city,
      loc.county
    );
  }
}

export function applyLinkedSectionsToPage(
  page: ModelYearPage,
  linkedSections: Pick<ModelYearPage, "heroSubhead" | "trims" | "contentSections" | "faqs">
): ModelYearPage {
  return {
    ...page,
    heroSubhead: linkedSections.heroSubhead ?? page.heroSubhead,
    trims: {
      ...(page.trims ?? { intro: "", sections: [] }),
      intro: linkedSections.trims?.intro ?? page.trims?.intro ?? "",
    },
    contentSections:
      linkedSections.contentSections ?? (page.contentSections as any),
    faqs: linkedSections.faqs ?? page.faqs,
  };
}

/** Records which store navigation URLs are in play for internal links (does not add <a> tags by itself). */
export function withInternalLinkTargetSnapshot(
  page: ModelYearPage,
  store: StoreConfig,
  brandSlug: string
): ModelYearPage {
  const targets = buildLinkMap(store, brandSlug);
  if (!targets.length) {
    const { internalLinkTargetHrefs: _drop, ...rest } = page;
    return rest as ModelYearPage;
  }
  return {
    ...page,
    internalLinkTargetHrefs: targets.map((t) => ({ type: t.type, href: t.href })),
  };
}

