/**
 * Brand-specific warranty FAQ: ToyotaCare, LexusCare, BMW Ultimate Care.
 * Each has 4+ reworded variants (same facts) plus category-based lead-in.
 * Deterministic: variantIndex = modelIndex % variants.length.
 */

import { getToyotaCareFaq } from "./toyotacare";

export type BrandWarranty = "toyota" | "lexus" | "bmw";

export interface WarrantyFaq {
  q: string;
  a: string;
}

/** Questions per brand (for validation). */
export const WARRANTY_QUESTIONS: Record<BrandWarranty, string> = {
  toyota: "Is ToyotaCare included with a new Toyota?",
  lexus: "Is LexusCare included with a new Lexus?",
  bmw: "Is BMW Ultimate Care included with a new BMW?",
};

type CategoryKey =
  | "truck"
  | "hybrid"
  | "gr-performance"
  | "family-suv"
  | "commuter-sedan"
  | "luxury-sedan"
  | "luxury-suv"
  | "performance"
  | "electric"
  | "default";

function toCategory(category: string): CategoryKey {
  const c = category.toLowerCase().replace(/\s+/g, "-");
  if (
    c === "truck" ||
    c === "hybrid" ||
    c === "gr-performance" ||
    c === "family-suv" ||
    c === "commuter-sedan" ||
    c === "luxury-sedan" ||
    c === "luxury-suv" ||
    c === "performance" ||
    c === "electric"
  ) {
    return c as CategoryKey;
  }
  if (c.includes("performance")) return "performance";
  if (c.includes("suv")) return "luxury-suv";
  if (c.includes("sedan")) return "luxury-sedan";
  if (c.includes("electric")) return "electric";
  if (c.includes("hybrid")) return "hybrid";
  if (c.includes("truck")) return "truck";
  return "default";
}

// ----- LexusCare -----
// Facts: 2 complimentary scheduled maintenance services, 4yr/50k basic warranty,
// 10yr/150k hybrid battery, 24/7 roadside (up to 10yr/unlimited with Safety Connect)

const LEXUS_LEAD_INS: Record<CategoryKey, string> = {
  truck: "Whether you use your vehicle for work or weekend trips, LexusCare is included with every new Lexus. ",
  hybrid: "For drivers who prioritize efficiency, LexusCare is included with every new Lexus. ",
  "gr-performance": "For enthusiasts and daily drivers alike, LexusCare is included with every new Lexus. ",
  "family-suv": "For families and everyday driving, LexusCare is included with every new Lexus. ",
  "commuter-sedan": "For commuters and daily drivers, LexusCare is included with every new Lexus. ",
  "luxury-sedan": "For luxury sedan drivers, LexusCare is included with every new Lexus. ",
  "luxury-suv": "For families and everyday driving, LexusCare is included with every new Lexus. ",
  performance: "For enthusiasts and daily drivers alike, LexusCare is included with every new Lexus. ",
  electric: "For electric vehicle drivers, LexusCare is included with every new Lexus. ",
  default: "LexusCare is included with every new Lexus. ",
};

const LEXUS_BODY_VARIANTS: string[] = [
  "It includes 2 complimentary scheduled maintenance services, a 4-year/50,000-mile basic warranty, and up to 10 years of unlimited-mile 24/7 roadside assistance with Safety Connect. Hybrid models also receive a 10-year/150,000-mile hybrid battery warranty. Coverage begins at purchase and can be used at any participating Lexus dealer.",
  "You get 2 complimentary scheduled maintenance services, 4-year/50,000-mile basic warranty coverage, and 24/7 roadside assistance (up to 10 years/unlimited miles with Safety Connect). Hybrid battery warranty is 10 years or 150,000 miles. Benefits start at purchase and are valid at any participating Lexus dealership.",
  "LexusCare provides 2 complimentary scheduled maintenance services, a 4-year/50,000-mile basic warranty, and 24/7 roadside assistance for up to 10 years with unlimited miles. Hybrid models include a 10-year/150,000-mile hybrid battery warranty. Coverage begins at the vehicle's in-service date at any participating Lexus dealer.",
  "It offers 2 complimentary scheduled maintenance services, 4-year/50,000-mile basic warranty, and up to 10 years of unlimited-mile roadside assistance. Hybrid battery coverage is 10 years or 150,000 miles. Benefits begin at purchase and can be used at any participating Lexus dealership.",
  "You receive 2 complimentary scheduled maintenance services, 4-year/50,000-mile basic warranty, and 24/7 roadside assistance (up to 10 years/unlimited miles). Hybrid models get a 10-year/150,000-mile hybrid battery warranty. Coverage starts at the original in-service date at any participating Lexus dealer.",
  "2 complimentary scheduled maintenance services, 4-year/50,000-mile basic warranty, and up to 10 years of unlimited-mile 24/7 roadside assistance (Safety Connect) are included. Hybrid battery warranty: 10 years or 150,000 miles. Begins at purchase; valid at any participating Lexus dealership.",
  "LexusCare includes 2 complimentary scheduled maintenance services, 4-year/50,000-mile basic warranty, and 24/7 roadside assistance for up to 10 years with unlimited miles. Hybrid models: 10-year/150,000-mile hybrid battery warranty. Coverage starts at in-service date at any participating Lexus dealer.",
  "You get 2 complimentary scheduled maintenance services, 4-year/50,000-mile basic warranty, and up to 10 years of unlimited-mile roadside assistance. Hybrid battery coverage is 10 years or 150,000 miles. Benefits begin at purchase at any participating Lexus dealership.",
  "Included: 2 complimentary scheduled maintenance services, 4-year/50,000-mile basic warranty, and 24/7 roadside assistance (up to 10 years/unlimited miles with Safety Connect). Hybrid battery warranty: 10 years or 150,000 miles. Valid at participating Lexus dealers from purchase.",
  "2 complimentary scheduled maintenance services, 4-year/50,000-mile basic warranty, and up to 10 years of unlimited-mile 24/7 roadside assistance. Hybrid models receive a 10-year/150,000-mile hybrid battery warranty. Coverage begins at purchase; use at any participating Lexus dealer.",
];

function getLexusCareFaq(modelIndex: number, category: string): WarrantyFaq {
  const cat = toCategory(category);
  const leadIn = LEXUS_LEAD_INS[cat] ?? LEXUS_LEAD_INS.default;
  const bodyIndex = modelIndex % LEXUS_BODY_VARIANTS.length;
  return {
    q: WARRANTY_QUESTIONS.lexus,
    a: leadIn + LEXUS_BODY_VARIANTS[bodyIndex],
  };
}

// ----- BMW Ultimate Care -----
// Facts: 3yr/36k scheduled maintenance, 4yr/unlimited roadside, standard on all new BMWs

const BMW_QUESTION_VARIANTS: string[] = [
  "Is BMW Ultimate Care included with a new BMW?",
  "Do new BMW models come with BMW Ultimate Care?",
  "What is BMW Ultimate Care and is it included with a new BMW?",
  "Does a new BMW include BMW Ultimate Care coverage?",
  "Is BMW Ultimate Care standard on new BMW vehicles?",
  "What does BMW Ultimate Care include on a new BMW?",
  "Is complimentary BMW Ultimate Care maintenance included on new BMWs?",
  "How does BMW Ultimate Care work on a new BMW?",
  "Does BMW Ultimate Care come standard when you buy a new BMW?",
  "Is BMW Ultimate Care part of the purchase of a new BMW?",
];

const BMW_LEAD_INS: Record<CategoryKey, string> = {
  truck: "Whether you use your BMW for work or weekend trips, BMW Ultimate Care comes standard on every new BMW. ",
  hybrid: "For drivers who prioritize efficiency, BMW Ultimate Care comes standard on every new BMW. ",
  "gr-performance": "For enthusiasts and daily drivers alike, BMW Ultimate Care comes standard on every new BMW. ",
  "family-suv": "For families and everyday driving, BMW Ultimate Care comes standard on every new BMW. ",
  "commuter-sedan": "For commuters and daily drivers, BMW Ultimate Care comes standard on every new BMW. ",
  "luxury-sedan": "For luxury sedan drivers, BMW Ultimate Care comes standard on every new BMW. ",
  "luxury-suv": "For families and everyday driving, BMW Ultimate Care comes standard on every new BMW. ",
  performance: "For performance and daily drivers, BMW Ultimate Care comes standard on every new BMW. ",
  electric: "For electric vehicle drivers, BMW Ultimate Care comes standard on every new BMW. ",
  default: "BMW Ultimate Care comes standard on every new BMW. ",
};

const BMW_BODY_VARIANTS: string[] = [
  "It includes 3 years or 36,000 miles of scheduled maintenance (whichever comes first) and 24/7 roadside assistance for 4 years with unlimited miles. Coverage begins on the vehicle's in-service date. All work is performed at authorized BMW centers using Original BMW Parts.",
  "You get 3 years or 36,000 miles of scheduled maintenance and 4 years of unlimited-mile 24/7 roadside assistance. Benefits start on the original in-service date. Service is performed at authorized BMW centers by BMW-trained technicians.",
  "BMW Ultimate Care provides 3 years or 36,000 miles of scheduled maintenance and 24/7 roadside assistance for 4 years with unlimited miles. Coverage begins at the vehicle's in-service date. All service is completed at authorized BMW centers using Original BMW Parts.",
  "It offers 3 years or 36,000 miles of scheduled maintenance, plus 4 years of unlimited-mile roadside assistance. Coverage starts on the in-service date. Work is performed at authorized BMW centers using Original BMW Parts.",
  "You receive 3 years or 36,000 miles of scheduled maintenance and 24/7 roadside assistance for 4 years with unlimited miles. Benefits begin on the original in-service date. All service is valid at authorized BMW centers.",
  "3 years or 36,000 miles of scheduled maintenance and 4 years of unlimited-mile 24/7 roadside assistance are included. Coverage begins on the in-service date. All service at authorized BMW centers using Original BMW Parts.",
  "BMW Ultimate Care includes 3 years or 36,000 miles of scheduled maintenance and 24/7 roadside assistance for 4 years with unlimited miles. Begins at in-service date. Performed at authorized BMW centers by BMW-trained technicians.",
  "Scheduled maintenance for 3 years or 36,000 miles and 24/7 roadside assistance for 4 years with unlimited miles come standard. Coverage starts on the vehicle's in-service date. Valid at authorized BMW centers; Original BMW Parts used.",
  "You get 3 years or 36,000 miles of scheduled maintenance and 4 years of unlimited-mile roadside assistance. Coverage begins at in-service date. All work at authorized BMW centers using Original BMW Parts.",
  "Included: 3 years or 36,000 miles of scheduled maintenance and 4 years of unlimited-mile 24/7 roadside assistance. Begins on in-service date. Service at authorized BMW centers; Original BMW Parts.",
];

function getBMWUltimateCareFaq(modelIndex: number, category: string): WarrantyFaq {
  const cat = toCategory(category);
  const leadIn = BMW_LEAD_INS[cat] ?? BMW_LEAD_INS.default;
  const questionIndex = modelIndex % BMW_QUESTION_VARIANTS.length;
  const bodyIndex = modelIndex % BMW_BODY_VARIANTS.length;
  return {
    q: BMW_QUESTION_VARIANTS[questionIndex],
    a: leadIn + BMW_BODY_VARIANTS[bodyIndex],
  };
}

/** Normalize store.brand to BrandWarranty. */
export function normalizeBrandWarranty(brand: string | undefined): BrandWarranty {
  const b = (brand ?? "").toLowerCase().trim();
  if (b === "lexus") return "lexus";
  if (b === "bmw") return "bmw";
  return "toyota";
}

export function getWarrantyFaq(
  brand: BrandWarranty,
  modelIndex: number,
  category: string
): WarrantyFaq {
  switch (brand) {
    case "lexus":
      return getLexusCareFaq(modelIndex, category);
    case "bmw":
      return getBMWUltimateCareFaq(modelIndex, category);
    default:
      return getToyotaCareFaq(modelIndex, category);
  }
}
