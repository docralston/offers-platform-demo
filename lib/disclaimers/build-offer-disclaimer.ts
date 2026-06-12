import type { Offer } from '@prisma/client';
import { monthlyPaymentPer1000 } from '@/lib/domain/apr-disclaimer';
import { formatAprPercent } from '@/lib/domain/apr-format';
import { resolveFinanceApr } from '@/lib/domain/finance-rates';
import {
  formatCurrency,
  formatLeaseMiles,
  formatVehicleTitle,
  modelForDisplay,
} from '@/lib/domain/offer-type';
import {
  DISCLAIMER_DOC_FEE_USD,
  getCaptiveLenderAbbrev,
  getSalespersonTitleForStore,
} from '@/lib/disclaimers/config';
import {
  buildTemplateContext,
  CODE_FALLBACK_TEMPLATES,
  resolveTemplateForStore,
  substituteGlobalPlaceholders,
  substituteOfferPlaceholders,
  type DisclaimerTemplatesConfig,
} from '@/lib/disclaimers/template-resolver';

function hasLease(o: Offer): boolean {
  return (
    o.leasePayment != null &&
    o.leaseTerm != null &&
    o.leaseMiles != null &&
    o.dueAtSigning != null
  );
}

function hasFinance(o: Offer): boolean {
  return (
    o.offerType === 'Finance' &&
    ((o.aprRate != null && o.aprTermMonths != null) ||
      (o.financeRates != null &&
        Array.isArray(o.financeRates) &&
        (o.financeRates as unknown[]).length > 0))
  );
}

function numCash(d: unknown): number | null {
  if (d == null) return null;
  const n = Number(d);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function joinOxford(items: string[]): string {
  const filtered = items.map((s) => s.trim()).filter(Boolean);
  if (filtered.length === 0) return '';
  if (filtered.length === 1) return filtered[0];
  if (filtered.length === 2) return `${filtered[0]} and ${filtered[1]}`;
  return `${filtered.slice(0, -1).join(', ')}, and ${filtered[filtered.length - 1]}`;
}

function formatLeaseMileageYear(leaseMiles: number): string {
  return `${formatLeaseMiles(leaseMiles)} mi/year`;
}

function financeModelPhrase(o: Offer): string {
  const y = o.year != null && !Number.isNaN(Number(o.year)) ? String(o.year) : '';
  const m = modelForDisplay(o.make, o.model);
  const trim = o.trim != null && String(o.trim).trim() !== '' ? String(o.trim).trim() : '';
  const core = [y, m, trim].filter(Boolean).join(' ').trim();
  return core;
}

function formatEndDateLatestMmDdYy(offers: Offer[]): string {
  const dates = offers.map((o) => o.endDate).filter((d): d is Date => d instanceof Date);
  if (dates.length === 0) return '';
  const latest = dates.reduce((a, b) => (a > b ? a : b));
  return latest.toLocaleDateString('en-US', {
    timeZone: 'America/New_York',
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
  });
}

function minifyParts(parts: string[]): string {
  return parts
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\n/g, ' ')
    .trim();
}

function buildLeaseParagraph(o: Offer, lender: string): string {
  const vehicle = formatVehicleTitle(o);
  const code = o.modelCode?.trim() || null;
  const open = code ? `${vehicle} (${code}).` : `${vehicle}.`;
  const msrpBit =
    o.msrp != null && o.msrp > 0 ? ` MSRP ${formatCurrency(o.msrp)}.` : '';
  const pay = o.leasePayment != null ? formatCurrency(Number(o.leasePayment)) : '';
  const term = o.leaseTerm != null ? `${o.leaseTerm} months` : '';
  const miles = o.leaseMiles != null ? formatLeaseMileageYear(o.leaseMiles) : '';
  let s = `${open}${msrpBit} Lease for ${pay}/mo. for ${term}. ${miles}.`.trim();

  const capBits: string[] = [];
  const gross = numCash(o.grossCapCost);
  if (gross != null) capBits.push(`gross capitalized cost of ${formatCurrency(gross)}`);
  const net = numCash(o.netCapCost);
  if (net != null) capBits.push(`net capitalized cost of ${formatCurrency(net)}`);
  const capRed = numCash(o.capCostReduction);
  if (capRed != null) capBits.push(`capitalized cost reduction of ${formatCurrency(capRed)}`);
  if (capBits.length > 0) {
    s = `${s} ${capBits.join(', ')}.`.trim();
  }

  const deposit = numCash(o.securityDeposit);
  if (deposit != null) {
    s = `${s} Security deposit ${formatCurrency(deposit)}.`.trim();
  }

  const excess = o.perExcessMile != null ? Number(o.perExcessMile) : null;
  if (excess != null && Number.isFinite(excess) && excess > 0) {
    s = `${s} Excess mileage charge $${excess.toFixed(2)}/mile.`.trim();
  }

  const extra: string[] = [];
  const cust = numCash(o.customerCash);
  if (cust != null) extra.push(`${formatCurrency(cust)} customer cash available from ${lender}.`);
  const aprC = numCash(o.aprCash);
  if (aprC != null) extra.push(`${formatCurrency(aprC)} APR cash available from ${lender}.`);
  const bonus = numCash(o.bonusCash);
  if (bonus != null) extra.push(`${formatCurrency(bonus)} bonus cash available from ${lender}.`);
  const leaseC = numCash(o.leaseCash);
  if (leaseC != null) extra.push(`${formatCurrency(leaseC)} lease cash available from ${lender}.`);

  if (extra.length > 0) {
    s = `${s} ${extra.join(' ')}`.trim();
  }
  return s;
}

function groupKeyForFinance(
  o: Offer,
  apr: number,
  term: number,
  paymentPer1000: number
): string {
  const fuel = o.fuelType ?? 'UNKNOWN';
  return `${fuel}|${apr}|${term}|${paymentPer1000}`;
}

export interface OfferDisclaimerResult {
  textMinified: string;
  textPretty: string;
  html: string;
  alerts: string[];
}

/**
 * Universal marketing disclaimer: intro → lease lines → finance lines → outro.
 * `textMinified` is a single line (no newlines) for copy/paste.
 */
export function buildOfferDisclaimerText(
  offers: Offer[],
  storeCode: string,
  templatesConfig: DisclaimerTemplatesConfig = CODE_FALLBACK_TEMPLATES,
): OfferDisclaimerResult {
  const lender = getCaptiveLenderAbbrev(storeCode);
  const salesperson = getSalespersonTitleForStore(storeCode);
  const endDate = formatEndDateLatestMmDdYy(offers);
  const templateParts = resolveTemplateForStore(templatesConfig, storeCode);
  const tplCtx = buildTemplateContext(storeCode, endDate);

  const alerts: string[] = [];
  const alertSeen = new Set<string>();

  const intro = templateParts.intro
    ? substituteGlobalPlaceholders(templateParts.intro, tplCtx)
    : `Offer available to approved buyers on Tier 1+ credit through ${lender}. Not all customers will qualify.`;

  const leaseParts: string[] = [];
  for (const o of offers) {
    if (!hasLease(o)) continue;
    if (templateParts.leaseParagraph) {
      leaseParts.push(substituteOfferPlaceholders(templateParts.leaseParagraph, o, tplCtx));
    } else {
      leaseParts.push(buildLeaseParagraph(o, lender));
    }
  }

  type FinanceGroup = {
    apr: number;
    term: number;
    paymentPer1000: number;
    models: string[];
  };
  const financeMap = new Map<string, FinanceGroup>();

  for (const o of offers) {
    if (!hasFinance(o)) continue;
    const res = resolveFinanceApr(o);
    for (const a of res.alerts) {
      if (!alertSeen.has(a)) {
        alertSeen.add(a);
        alerts.push(a);
      }
    }
    if (!res.apr) continue;
    const { aprRate, aprTermMonths } = res.apr;
    const paymentPer1000 = monthlyPaymentPer1000(aprRate, aprTermMonths);
    const key = groupKeyForFinance(o, aprRate, aprTermMonths, paymentPer1000);
    const phrase = financeModelPhrase(o);
    const existing = financeMap.get(key);
    if (existing) {
      if (phrase && !existing.models.includes(phrase)) existing.models.push(phrase);
    } else {
      financeMap.set(key, {
        apr: aprRate,
        term: aprTermMonths,
        paymentPer1000,
        models: phrase ? [phrase] : [],
      });
    }
  }

  const financeParts: string[] = [];
  for (const g of financeMap.values()) {
    const payStr = g.paymentPer1000.toFixed(2);
    const modelsJoined = joinOxford(g.models);
    const body = modelsJoined
      ? `${formatAprPercent(g.apr)} financing with ${g.term} monthly payments of $${payStr} for each $1,000 borrowed on ${modelsJoined}.`
      : `${formatAprPercent(g.apr)} financing with ${g.term} monthly payments of $${payStr} for each $1,000 borrowed.`;
    financeParts.push(body);
  }

  const outro = templateParts.outro
    ? substituteGlobalPlaceholders(templateParts.outro, tplCtx)
    : `Security deposit waived. Tax, tags, title, license and $${DISCLAIMER_DOC_FEE_USD} doc fee extra. No down payment required to qualify for finance offers. Not responsible for typographical errors or omissions. See ${salesperson} for full details. Offer ends ${endDate}.`;

  const prettyBlocks = [
    intro,
    ...leaseParts,
    ...financeParts,
    ...(alerts.length
      ? [`Operator notes: ${alerts.join(' ')}`]
      : []),
    outro,
  ].filter(Boolean);

  const textPretty = prettyBlocks.join('\n\n');
  const coreMinified = minifyParts([intro, ...leaseParts, ...financeParts, outro]);
  const alertBlock =
    alerts.length > 0
      ? `Operator notes: ${minifyParts(alerts)}`
      : '';
  const textMinified = alertBlock ? minifyParts([coreMinified, alertBlock]) : coreMinified;

  const html = [
    `<p>${escapeHtml(intro)}</p>`,
    ...leaseParts.map((p) => `<p>${escapeHtml(p)}</p>`),
    ...financeParts.map((p) => `<p>${escapeHtml(p)}</p>`),
    ...(alerts.length
      ? [`<p><strong>Operator notes:</strong> ${escapeHtml(alerts.join(' '))}</p>`]
      : []),
    `<p>${escapeHtml(outro)}</p>`,
  ].join('');

  return { textMinified, textPretty, html, alerts };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
