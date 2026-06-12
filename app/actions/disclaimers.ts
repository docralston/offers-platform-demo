'use server';

import { requireAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { buildOfferDisclaimerText } from '@/lib/disclaimers/build-offer-disclaimer';
import type { OfferInput } from '@/lib/domain/validation';
import { OfferTypeEnum, Prisma, VehicleCondition } from '@prisma/client';
import { revalidatePath } from 'next/cache';
import {
  DISCLAIMER_TEMPLATES_KEY,
  type DisclaimerTemplateParts,
  type DisclaimerTemplatesConfig,
  mergeTemplateConfig,
} from '@/lib/disclaimers/template-resolver';
import { getDisclaimerTemplatesConfig } from '@/lib/disclaimers/template-resolver-db';
import { createEasternDate } from '@/lib/utils/dates';

export async function getDisclaimerTemplates(): Promise<DisclaimerTemplatesConfig> {
  await requireAdmin();
  return getDisclaimerTemplatesConfig();
}

export async function saveDisclaimerTemplates(
  config: DisclaimerTemplatesConfig,
): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await requireAdmin();
    const merged = mergeTemplateConfig(config);
    await prisma.appSetting.upsert({
      where: { key: DISCLAIMER_TEMPLATES_KEY },
      create: {
        key: DISCLAIMER_TEMPLATES_KEY,
        value: merged as unknown as Prisma.InputJsonValue,
        updatedBy: userId,
      },
      update: {
        value: merged as unknown as Prisma.InputJsonValue,
        updatedBy: userId,
      },
    });
    revalidatePath('/admin/disclaimers');
    return { success: true };
  } catch (e) {
    console.error('saveDisclaimerTemplates:', e);
    return { success: false, error: 'Failed to save templates' };
  }
}

function offerInputToPreviewOffer(data: OfferInput): Parameters<typeof buildOfferDisclaimerText>[0][0] {
  const start =
    typeof data.startDate === 'string' ? createEasternDate(data.startDate) : data.startDate;
  const end = typeof data.endDate === 'string' ? createEasternDate(data.endDate) : data.endDate;
  return {
    id: 'preview',
    storeCode: data.storeCode,
    storeCodes: data.storeCodes ?? [],
    externalId: null,
    make: data.make ?? null,
    model: data.model,
    series: data.series ?? null,
    year: data.year ?? null,
    trim: data.trim ?? null,
    modelCode: data.modelCode ?? null,
    fuelType: data.fuelType ?? null,
    condition: (data.condition as VehicleCondition) ?? VehicleCondition.NEW,
    startDate: start,
    endDate: end,
    status: 'LIVE',
    inventoryUrl: data.inventoryUrl ?? null,
    imageUrl: data.imageUrl ?? null,
    leasePayment: data.leasePayment ?? null,
    leaseTerm: data.leaseTerm ?? null,
    leaseMiles: data.leaseMiles ?? null,
    dueAtSigning: data.dueAtSigning ?? null,
    capCostReduction: data.capCostReduction ?? null,
    grossCapCost: data.grossCapCost ?? null,
    netCapCost: data.netCapCost ?? null,
    securityDeposit: data.securityDeposit ?? null,
    perExcessMile: data.perExcessMile != null ? new Prisma.Decimal(data.perExcessMile) : null,
    acquisitionFee: data.acquisitionFee ?? null,
    downPayment: data.downPayment ?? null,
    msrp: data.msrp ?? null,
    discount: data.discount ?? null,
    buyFor: data.buyFor ?? null,
    stockNumber: data.stockNumber ?? null,
    offerType: (data.offerType as OfferTypeEnum) ?? null,
    aprRate: data.aprRate != null ? new Prisma.Decimal(data.aprRate) : null,
    aprTermMonths: data.aprTermMonths ?? null,
    financeRates: data.financeRates ?? null,
    rebateTotal: data.rebateTotal != null ? new Prisma.Decimal(data.rebateTotal) : null,
    customerCash: data.customerCash != null ? new Prisma.Decimal(data.customerCash) : null,
    leaseCash: data.leaseCash != null ? new Prisma.Decimal(data.leaseCash) : null,
    aprCash: data.aprCash != null ? new Prisma.Decimal(data.aprCash) : null,
    bonusCash: data.bonusCash != null ? new Prisma.Decimal(data.bonusCash) : null,
    disclaimer: data.disclaimer ?? null,
    disclaimerSource: 'AUTO',
    additionalNotes: data.additionalNotes ?? null,
    validationIssues: null,
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function previewOfferDisclaimer(
  data: OfferInput,
  storeCode?: string,
): Promise<{ textMinified: string; textPretty: string; html: string; alerts: string[] }> {
  await requireAdmin();
  const sc = storeCode ?? data.storeCode;
  const offer = offerInputToPreviewOffer(data);
  const config = await getDisclaimerTemplatesConfig();
  const result = buildOfferDisclaimerText([offer], sc, config);
  return {
    textMinified: result.textMinified,
    textPretty: result.textPretty,
    html: result.html,
    alerts: result.alerts,
  };
}

export async function previewDisclaimerFromTemplates(
  storeCode: string,
  parts: DisclaimerTemplateParts,
): Promise<{ textMinified: string; textPretty: string }> {
  await requireAdmin();
  const sample: OfferInput = {
    storeCode,
    model: 'Camry',
    year: 2026,
    trim: 'LE',
    modelCode: '2557',
    condition: VehicleCondition.NEW,
    startDate: '2026-06-01',
    endDate: '2026-06-30',
    leasePayment: 299,
    leaseTerm: 36,
    leaseMiles: 12000,
    dueAtSigning: 2999,
    offerType: 'Lease',
    msrp: 32000,
  };
  const config = await getDisclaimerTemplatesConfig();
  const merged: DisclaimerTemplatesConfig = {
    ...config,
    byStore: { ...config.byStore, [storeCode]: parts },
  };
  const offer = offerInputToPreviewOffer(sample);
  const result = buildOfferDisclaimerText([offer], storeCode, merged);
  return { textMinified: result.textMinified, textPretty: result.textPretty };
}
