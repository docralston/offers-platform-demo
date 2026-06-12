/**
 * ToyotaCare FAQ: Q is fixed; A has 4+ reworded variants (same facts) plus
 * category-based lead-in. Deterministic: variantIndex = modelIndex % variants.length.
 */

export const TOYOTACARE_QUESTION =
  "Is ToyotaCare included with a new Toyota?";

/** Category key for lead-in clause only (no factual change). */
export type ToyotaCareCategory =
  | "truck"
  | "hybrid"
  | "gr-performance"
  | "family-suv"
  | "commuter-sedan"
  | "default";

const LEAD_INS: Record<ToyotaCareCategory, string> = {
  truck:
    "Whether you use your truck for work or weekend trips, ToyotaCare is complimentary and included with every new Toyota. ",
  hybrid:
    "For drivers who prioritize efficiency, ToyotaCare is complimentary and included with every new Toyota. ",
  "gr-performance":
    "For enthusiasts and daily drivers alike, ToyotaCare is complimentary and included with every new Toyota. ",
  "family-suv":
    "For families and everyday driving, ToyotaCare is complimentary and included with every new Toyota. ",
  "commuter-sedan":
    "For commuters and daily drivers, ToyotaCare is complimentary and included with every new Toyota. ",
  default:
    "ToyotaCare is complimentary and included with every new Toyota. ",
};

/** Factual body variants (same meaning: maintenance 2yr/25k, roadside 2yr unlimited, in-service date, any dealer, Plus/Premium). */
const BODY_VARIANTS: string[] = [
  "It covers factory-recommended maintenance like oil changes and tire rotations for 2 years or 25,000 miles, and includes 24/7 roadside assistance for 2 years with unlimited miles. Coverage begins on the vehicle's original in-service date and can be used at any participating Toyota dealership. Extended coverage is available through ToyotaCare Plus and ToyotaCare Premium.",
  "You get factory-recommended maintenance such as oil changes and tire rotations for 2 years or 25,000 miles, plus 24/7 roadside assistance for 2 years with unlimited miles. Benefits start on the original in-service date and are valid at any participating Toyota dealership. ToyotaCare Plus and ToyotaCare Premium offer extended options.",
  "Factory-recommended maintenance (oil changes, tire rotations) is included for 2 years or 25,000 miles, and 24/7 roadside assistance is included for 2 years with unlimited miles. Coverage begins on the vehicle's original in-service date. You can use it at any participating Toyota dealership. For longer coverage, ToyotaCare Plus and ToyotaCare Premium are available.",
  "It includes factory-recommended maintenance like oil changes and tire rotations for 2 years or 25,000 miles, and 24/7 roadside assistance for 2 years with unlimited miles. Coverage starts on the vehicle's original in-service date and is honored at any participating Toyota dealership. Extended options include ToyotaCare Plus and ToyotaCare Premium.",
  "You receive factory-recommended maintenance (e.g. oil changes and tire rotations) for 2 years or 25,000 miles, and 24/7 roadside assistance for 2 years with unlimited miles. Benefits begin on the original in-service date and can be used at any participating Toyota dealership. ToyotaCare Plus and ToyotaCare Premium provide extended coverage.",
  "Every new Toyota includes ToyotaCare at no extra cost: factory-recommended maintenance for 2 years or 25,000 miles and 24/7 roadside assistance for 2 years with unlimited miles. Coverage starts on the in-service date at any participating Toyota dealer. ToyotaCare Plus and ToyotaCare Premium extend coverage.",
  "ToyotaCare comes standard: 2 years or 25,000 miles of factory-recommended maintenance and 2 years of unlimited-mile 24/7 roadside assistance. It begins at the vehicle's in-service date and is valid at participating Toyota dealerships. Extended plans: ToyotaCare Plus and ToyotaCare Premium.",
  "Included with every new Toyota: 2 years or 25,000 miles of factory-recommended maintenance and 2 years of 24/7 roadside assistance with unlimited miles. Coverage begins on the original in-service date. Use at any participating Toyota dealer. ToyotaCare Plus and ToyotaCare Premium available for extension.",
  "2 years or 25,000 miles of factory-recommended maintenance and 2 years of unlimited-mile 24/7 roadside assistance are included. Coverage starts on the vehicle's in-service date at participating Toyota dealerships. ToyotaCare Plus and ToyotaCare Premium offer extended coverage.",
  "Factory-recommended maintenance (2 years or 25,000 miles) and 24/7 roadside assistance (2 years, unlimited miles) come with every new Toyota. Begins at in-service date; valid at participating Toyota dealers. ToyotaCare Plus and ToyotaCare Premium extend benefits.",
];

function toCategory(category: string): ToyotaCareCategory {
  const c = category.toLowerCase().replace(/\s+/g, "-");
  if (
    c === "truck" ||
    c === "hybrid" ||
    c === "gr-performance" ||
    c === "family-suv" ||
    c === "commuter-sedan"
  ) {
    return c as ToyotaCareCategory;
  }
  if (c.includes("gr") || c.includes("performance")) return "gr-performance";
  if (c.includes("suv") || c.includes("highlander") || c.includes("cross"))
    return "family-suv";
  if (c.includes("sedan") || c.includes("camry") || c.includes("corolla"))
    return "commuter-sedan";
  if (c.includes("truck") || c.includes("tacoma") || c.includes("tundra"))
    return "truck";
  if (c.includes("hybrid")) return "hybrid";
  return "default";
}

export function getToyotaCareFaq(
  modelIndex: number,
  category: string
): { q: string; a: string } {
  const cat = toCategory(category);
  const leadIn = LEAD_INS[cat];
  const bodyIndex = modelIndex % BODY_VARIANTS.length;
  const body = BODY_VARIANTS[bodyIndex];
  return {
    q: TOYOTACARE_QUESTION,
    a: leadIn + body,
  };
}
