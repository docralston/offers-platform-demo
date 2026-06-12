/**
 * Model-specific signature phrase pools per category for uniqueness hooks.
 */

const SIGNATURE_POOLS: Record<string, string[]> = {
  truck: [
    "work-ready capability",
    "towing and payload",
    "rugged utility",
    "built for work and weekend",
    "capability when you need it",
    "payload and towing",
  ],
  hybrid: [
    "efficient powertrain",
    "fuel savings",
    "lower emissions",
    "efficient miles",
    "hybrid peace of mind",
    "efficiency and versatility",
  ],
  "gr-performance": [
    "driver-focused",
    "engaging dynamics",
    "precision handling",
    "performance-first",
    "driver's choice",
    "engaging drive",
  ],
  "family-suv": [
    "three-row versatility",
    "cargo space",
    "family-friendly",
    "room for everyone",
    "versatile cargo",
    "family-friendly space",
  ],
  "commuter-sedan": [
    "daily-driver comfort",
    "efficient commuting",
    "practical value",
    "sensible daily driver",
    "quiet cabin",
    "everyday reliability",
  ],
  "luxury-sedan": [
    "refined cabin",
    "premium materials",
    "quiet confidence",
    "sophisticated ride",
    "premium comfort",
    "elegant design",
  ],
  "luxury-suv": [
    "sophisticated space",
    "premium versatility",
    "elevated comfort",
    "refined space",
    "premium feel",
    "quiet and capable",
  ],
  electric: [
    "zero emissions",
    "EV range",
    "quiet electric drive",
    "electric power",
    "clean miles",
    "EV efficiency",
  ],
  coupe: [
    "focused design",
    "driver-oriented",
    "sporting character",
    "compact and engaging",
    "style and engagement",
  ],
  convertible: [
    "open-air driving",
    "wind-in-your-hair",
    "refined dynamics",
    "open-air freedom",
    "precision handling",
  ],
  "grand-tourer": [
    "long-legged luxury",
    "sporting character",
    "grand touring",
    "elegant and capable",
    "refined power",
  ],
  default: [
    "versatile choice",
    "everyday usability",
    "comfort and value",
    "practical fit",
    "well-equipped",
  ],
};

function categoryKey(category: string): string {
  const c = category.toLowerCase();
  if (c.includes("truck")) return "truck";
  if (c.includes("hybrid")) return "hybrid";
  if (c.includes("grand-tourer")) return "grand-tourer";
  if (c.includes("convertible")) return "convertible";
  if (c.includes("gr") || c.includes("m-performance")) return "gr-performance";
  if (c.includes("performance")) return "gr-performance";
  if (c.includes("electric")) return "electric";
  if (c.includes("coupe")) return "coupe";
  if (c.includes("luxury-suv") || (c.includes("luxury") && c.includes("suv"))) return "luxury-suv";
  if (c.includes("luxury-sedan") || (c.includes("luxury") && c.includes("sedan"))) return "luxury-sedan";
  if (c.includes("suv") || c.includes("highlander") || c.includes("cross")) return "family-suv";
  if (c.includes("sedan") || c.includes("camry") || c.includes("corolla")) return "commuter-sedan";
  return "default";
}

export function getSignaturePhrases(category: string): string[] {
  const key = categoryKey(category);
  return SIGNATURE_POOLS[key] ?? SIGNATURE_POOLS.default;
}

/**
 * Select one signature phrase for this model, avoiding already-used phrases when possible.
 */
export function selectSignaturePhrase(
  category: string,
  modelIndex: number,
  usedPhrases: Set<string> = new Set()
): string {
  const pool = getSignaturePhrases(category);
  const available = pool.filter((p) => !usedPhrases.has(p.toLowerCase()));
  const arr = available.length > 0 ? available : pool;
  return arr[modelIndex % arr.length];
}
