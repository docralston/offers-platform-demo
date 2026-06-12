/**
 * Brand-specific CTA pools for meta description. Enforce unique CTA per page in batch.
 */

const CTA_POOLS: Record<string, string[]> = {
  toyota: [
    "Schedule a test drive.",
    "Get pricing today.",
    "Check availability.",
    "Visit our showroom.",
    "Contact us for details.",
  ],
  lexus: [
    "Schedule your test drive.",
    "Explore our inventory.",
    "Contact our team.",
    "Visit our showroom.",
    "Experience the difference.",
  ],
  bmw: [
    "Schedule a test drive.",
    "Explore our selection.",
    "Contact us today.",
    "Visit our showroom.",
    "Discover your BMW.",
  ],
};

function getPool(brand: string): string[] {
  const b = brand?.toLowerCase() ?? "";
  return CTA_POOLS[b] ?? CTA_POOLS.toyota;
}

/**
 * Select a CTA not yet used in this batch. If all are used, cycle by index.
 */
export function selectCTA(brand: string, usedCTAs: Set<string>): string {
  const pool = getPool(brand);
  const available = pool.filter((c) => !usedCTAs.has(c));
  const arr = available.length > 0 ? available : pool;
  return arr[usedCTAs.size % arr.length];
}
