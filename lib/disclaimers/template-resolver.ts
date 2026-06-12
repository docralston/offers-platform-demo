import type { Offer } from '@prisma/client';
import { formatCurrency, formatLeaseMiles, formatVehicleTitle } from '@/lib/domain/offer-type';
import { formatAprPercent } from '@/lib/domain/apr-format';
import { DISCLAIMER_DOC_FEE_USD, getCaptiveLenderAbbrev, getSalespersonTitleForStore } from '@/lib/disclaimers/config';

export const DISCLAIMER_TEMPLATES_KEY = 'disclaimer_templates';

export interface DisclaimerTemplateParts {
  intro?: string;
  leaseParagraph?: string;
  financeParagraph?: string;
  outro?: string;
}

export interface DisclaimerTemplatesConfig {
  default: DisclaimerTemplateParts;
  byStore?: Record<string, DisclaimerTemplateParts>;
}

export const CODE_FALLBACK_TEMPLATES: DisclaimerTemplatesConfig = {
  default: {
    intro:
      'Offer available to approved buyers on Tier 1+ credit through {lender}. Not all customers will qualify.',
    outro:
      'Security deposit waived. Tax, tags, title, license and ${docFee} doc fee extra. No down payment required to qualify for finance offers. Not responsible for typographical errors or omissions. See {salesperson} for full details. Offer ends {endDate}.',
  },
};

export function mergeTemplateConfig(stored: Partial<DisclaimerTemplatesConfig> | null): DisclaimerTemplatesConfig {
  const base = CODE_FALLBACK_TEMPLATES.default;
  const storedDefault = stored?.default ?? {};
  return {
    default: { ...base, ...storedDefault },
    byStore: stored?.byStore ?? {},
  };
}

export function resolveTemplateForStore(
  config: DisclaimerTemplatesConfig,
  storeCode: string,
): DisclaimerTemplateParts {
  const storeParts = config.byStore?.[storeCode] ?? {};
  return { ...config.default, ...storeParts };
}

type TemplateContext = {
  lender: string;
  salesperson: string;
  endDate: string;
  docFee: number;
};

export function substituteGlobalPlaceholders(template: string, ctx: TemplateContext): string {
  return template
    .replace(/\{lender\}/g, ctx.lender)
    .replace(/\{salesperson\}/g, ctx.salesperson)
    .replace(/\{endDate\}/g, ctx.endDate)
    .replace(/\$\{docFee\}/g, String(ctx.docFee))
    .replace(/\{docFee\}/g, String(ctx.docFee));
}

function formatOptionalCurrency(value: unknown): string {
  if (value == null) return '';
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return formatCurrency(n);
}

function formatPerExcessMile(value: unknown): string {
  if (value == null) return '';
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `$${n.toFixed(2)}/mile`;
}

export function substituteOfferPlaceholders(template: string, offer: Offer, ctx: TemplateContext): string {
  const vehicle = formatVehicleTitle(offer);
  const code = offer.modelCode?.trim();
  const vehicleWithCode = code ? `${vehicle} (${code})` : vehicle;
  const leaseMiles =
    offer.leaseMiles != null ? `${formatLeaseMiles(offer.leaseMiles)} mi/year` : '';
  const aprRate =
    offer.aprRate != null ? formatAprPercent(Number(offer.aprRate)) : '';
  const replacements: Record<string, string> = {
    '{vehicle}': vehicle,
    '{vehicleWithCode}': vehicleWithCode,
    '{modelCode}': code ?? '',
    '{msrp}': offer.msrp != null && offer.msrp > 0 ? formatCurrency(offer.msrp) : '',
    '{leasePayment}': offer.leasePayment != null ? formatCurrency(Number(offer.leasePayment)) : '',
    '{leaseTerm}': offer.leaseTerm != null ? String(offer.leaseTerm) : '',
    '{leaseMiles}': leaseMiles,
    '{dueAtSigning}': formatOptionalCurrency(offer.dueAtSigning),
    '{capCostReduction}': formatOptionalCurrency(offer.capCostReduction),
    '{grossCapCost}': formatOptionalCurrency(offer.grossCapCost),
    '{netCapCost}': formatOptionalCurrency(offer.netCapCost),
    '{securityDeposit}': formatOptionalCurrency(offer.securityDeposit),
    '{perExcessMile}': formatPerExcessMile(offer.perExcessMile),
    '{acquisitionFee}': formatOptionalCurrency(offer.acquisitionFee),
    '{aprRate}': aprRate,
    '{aprTermMonths}': offer.aprTermMonths != null ? String(offer.aprTermMonths) : '',
    '{lender}': ctx.lender,
    '{salesperson}': ctx.salesperson,
    '{endDate}': ctx.endDate,
    '{docFee}': String(ctx.docFee),
  };
  let out = template;
  for (const [key, val] of Object.entries(replacements)) {
    out = out.split(key).join(val);
  }
  return out.replace(/\$\{docFee\}/g, String(ctx.docFee));
}

export function buildTemplateContext(storeCode: string, endDate: string): TemplateContext {
  return {
    lender: getCaptiveLenderAbbrev(storeCode),
    salesperson: getSalespersonTitleForStore(storeCode),
    endDate,
    docFee: DISCLAIMER_DOC_FEE_USD,
  };
}
