/**
 * Distressed / disallowed language blacklist. Auto-generated base list + brand-specific bans.
 */

const DISTRESSED_PHRASES = [
  "blowout",
  "liquidation",
  "huge markdown",
  "distress sale",
  "fire sale",
  "must-go",
  "insane deal",
  "dirt cheap",
  "bankruptcy",
  "going out of business",
  "final days",
  "everything must go",
  "liquidate",
  "clearance",
  "closeout",
  "rock bottom",
  "slashed",
  "massive discount",
  "last chance",
  "won't last",
];

/** Brand-specific banned phrases (extendable). Lexus/BMW: avoid discount language. */
const BRAND_BANNED: Record<string, string[]> = {
  toyota: [],
  lexus: ["cheap", "discount", "deal", "bargain"],
  bmw: ["cheap", "discount"],
};

/**
 * Check text for blacklisted phrases. Returns list of violations (empty if none).
 * Brand is optional; if provided, brand-specific bans are also checked.
 */
export function checkBlacklist(text: string, brand?: string): string[] {
  const violations: string[] = [];
  const lower = String(text ?? "").toLowerCase();

  for (const phrase of DISTRESSED_PHRASES) {
    if (lower.includes(phrase)) violations.push(phrase);
  }

  const brandKey = brand?.toLowerCase().trim();
  if (brandKey && BRAND_BANNED[brandKey]) {
    for (const phrase of BRAND_BANNED[brandKey]) {
      if (lower.includes(phrase)) violations.push(phrase);
    }
  }

  return violations;
}

/**
 * Check a full page object for blacklist violations across all string content.
 * Returns array of { path, violations }.
 */
export function checkPageBlacklist(
  page: { seo?: { title?: string; metaDescription?: string }; heroSubhead?: string; whyBullets?: string[]; trims?: { intro?: string; sections?: Array<{ title?: string; items?: Array<{ label?: string; note?: string }> }> }; faqs?: Array<{ q?: string; a?: string }> },
  brand?: string
): Array<{ path: string; violations: string[] }> {
  const out: Array<{ path: string; violations: string[] }> = [];
  const push = (path: string, text: string) => {
    const v = checkBlacklist(text, brand);
    if (v.length) out.push({ path, violations: v });
  };
  if (page.seo?.title) push("seo.title", page.seo.title);
  if (page.seo?.metaDescription) push("seo.metaDescription", page.seo.metaDescription);
  if (page.heroSubhead) push("heroSubhead", page.heroSubhead);
  if (Array.isArray(page.whyBullets)) {
    page.whyBullets.forEach((b, i) => push(`whyBullets[${i}]`, b));
  }
  if (page.trims?.intro) push("trims.intro", page.trims.intro);
  page.trims?.sections?.forEach((sec, si) => {
    if (sec.title) push(`trims.sections[${si}].title`, sec.title);
    sec.items?.forEach((it, ii) => {
      if (it.label) push(`trims.sections[${si}].items[${ii}].label`, it.label);
      if (it.note) push(`trims.sections[${si}].items[${ii}].note`, it.note);
    });
  });
  page.faqs?.forEach((f, i) => {
    if (f.q) push(`faqs[${i}].q`, f.q);
    if (f.a) push(`faqs[${i}].a`, f.a);
  });
  return out;
}
