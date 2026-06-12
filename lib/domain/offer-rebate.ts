/** Input shape for rebate computation (subset of OfferInput). */
export interface RebateInput {
  rebateTotal?: number | null;
  customerCash?: number | null;
  leaseCash?: number | null;
  aprCash?: number | null;
  bonusCash?: number | null;
}

/**
 * If rebateTotal is empty and any cash field is present, return the sum;
 * otherwise return null (caller uses data.rebateTotal as-is).
 */
export function computeRebateTotal(data: RebateInput): number | null {
  if (data.rebateTotal != null) return null; // explicit: do not overwrite
  const c = [data.customerCash, data.leaseCash, data.aprCash, data.bonusCash].filter(
    (v): v is number => typeof v === 'number' && !isNaN(v)
  );
  if (c.length === 0) return null;
  return c.reduce((a, b) => a + b, 0);
}
