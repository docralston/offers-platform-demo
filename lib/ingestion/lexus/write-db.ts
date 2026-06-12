import { prisma } from '@/lib/prisma';
import { computeRebateTotal } from '@/lib/domain/offer-rebate';
import { createEasternDate } from '@/lib/utils/dates';
import { OfferStatus, VehicleCondition, OfferTypeEnum } from '@prisma/client';
import type { OfferInput } from '@/lib/domain/validation';
import { buildInventoryUrl, buildImageUrl } from '@/lib/domain/offer-assets';
import { computeLexusExternalId } from '@/lib/ingestion/external-id';
import { assertIngestionSchema } from '@/lib/ingestion/assert-schema';

export interface WriteLexusResult {
  inserted: number;
  updated: number;
  inactivated: number;
  error?: string;
}

function toOfferType(v: unknown): OfferTypeEnum | null {
  if (v == null) return null;
  const s = typeof v === 'string' ? v.trim() : String(v);
  if (!s || !['Lease', 'Finance'].includes(s)) return null;
  return s as OfferTypeEnum;
}

const LEXUS_STORE_CODES = ['LEXDT', 'LEXWG'] as const;

/**
 * Upsert Lexus offers (one row per logical offer, storeCodes = [LEXDT, LEXWG]) and mark missing as INACTIVE.
 * updatedBy: userId when called from server action; "ingestion" when from CLI.
 */
export async function writeLexusOffers(
  rows: OfferInput[],
  options: { updatedBy?: string | null }
): Promise<WriteLexusResult> {
  const updatedBy = options.updatedBy ?? 'ingestion';
  const result: WriteLexusResult = { inserted: 0, updated: 0, inactivated: 0 };

  await assertIngestionSchema();

  await prisma.$transaction(
    async (tx) => {
      const currentExternalIds = new Set<string>();

      for (const row of rows) {
        const storeCode = row.storeCode;
        if (!storeCode) continue;

        const externalId = computeLexusExternalId(row);
        currentExternalIds.add(externalId);

        const rebateTotalVal = computeRebateTotal(row) ?? row.rebateTotal ?? null;
        const makeVal = row.make?.trim() || 'Lexus';
        const storeCodesVal = row.storeCodes && row.storeCodes.length > 0 ? row.storeCodes : [storeCode];
        const conditionVal = (row.condition as VehicleCondition) ?? VehicleCondition.NEW;
        const statusVal =
          conditionVal === VehicleCondition.CERTIFIED
            ? OfferStatus.LIVE
            : ((row.status as OfferStatus) ?? OfferStatus.LIVE);

        const data = {
          storeCode,
          storeCodes: storeCodesVal,
          externalId,
          make: makeVal,
          model: row.model,
          year: row.year,
          trim: row.trim || null,
          modelCode: row.modelCode ?? null,
          condition: conditionVal,
          startDate:
            typeof row.startDate === 'string'
              ? createEasternDate(row.startDate)
              : (row.startDate as Date),
          endDate:
            typeof row.endDate === 'string'
              ? createEasternDate(row.endDate)
              : (row.endDate as Date),
          status: statusVal,
          inventoryUrl: row.inventoryUrl || buildInventoryUrl(storeCode, row.model) || null,
          imageUrl: row.imageUrl || buildImageUrl(makeVal, row.model, row.year) || null,
          leasePayment: row.leasePayment ?? null,
          leaseTerm: row.leaseTerm ?? null,
          leaseMiles: row.leaseMiles ?? null,
          dueAtSigning: row.dueAtSigning ?? null,
          capCostReduction: row.capCostReduction ?? null,
          grossCapCost: row.grossCapCost ?? null,
          netCapCost: row.netCapCost ?? null,
          securityDeposit: row.securityDeposit ?? null,
          perExcessMile: row.perExcessMile ?? null,
          acquisitionFee: row.acquisitionFee ?? null,
          downPayment: row.downPayment ?? null,
          msrp: row.msrp ?? null,
          discount: row.discount ?? null,
          buyFor: row.buyFor ?? null,
          stockNumber: row.stockNumber || null,
          offerType: toOfferType(row.offerType),
          aprRate: row.aprRate ?? null,
          aprTermMonths: row.aprTermMonths ?? null,
          financeRates: row.financeRates ?? null,
          rebateTotal: rebateTotalVal,
          customerCash: row.customerCash ?? null,
          leaseCash: row.leaseCash ?? null,
          aprCash: row.aprCash ?? null,
          bonusCash: row.bonusCash ?? null,
          disclaimer: row.disclaimer || null,
          additionalNotes: row.additionalNotes || null,
          updatedBy,
        };

        const existing = await tx.offer.findUnique({
          where: {
            storeCode_externalId: { storeCode, externalId },
          },
        });

        const { externalId: _e, ...updatePayload } = data as typeof data & {
          externalId: string;
        };

        if (existing) {
          await tx.offer.update({
            where: { id: existing.id },
            data: updatePayload as any,
          });
          result.updated++;
        } else {
          const created = await tx.offer.create({
            data: data as any,
          });
          result.inserted++;
          const snapshot = {
            storeCode: created.storeCode,
            storeCodes: created.storeCodes,
            externalId: created.externalId,
            make: created.make,
            model: created.model,
            year: created.year,
            trim: created.trim,
            modelCode: created.modelCode,
            condition: created.condition,
            startDate: created.startDate,
            endDate: created.endDate,
            status: created.status,
            inventoryUrl: created.inventoryUrl,
            imageUrl: created.imageUrl,
            leasePayment: created.leasePayment,
            leaseTerm: created.leaseTerm,
            leaseMiles: created.leaseMiles,
            dueAtSigning: created.dueAtSigning,
            capCostReduction: created.capCostReduction,
            grossCapCost: created.grossCapCost,
            netCapCost: created.netCapCost,
            securityDeposit: created.securityDeposit,
            perExcessMile: created.perExcessMile,
            acquisitionFee: created.acquisitionFee,
            downPayment: created.downPayment,
            msrp: created.msrp,
            discount: created.discount,
            buyFor: created.buyFor,
            stockNumber: created.stockNumber,
            offerType: created.offerType,
            aprRate: created.aprRate,
            aprTermMonths: created.aprTermMonths,
            financeRates: created.financeRates,
            rebateTotal: created.rebateTotal,
            customerCash: created.customerCash,
            leaseCash: created.leaseCash,
            aprCash: created.aprCash,
            bonusCash: created.bonusCash,
            disclaimer: created.disclaimer,
            additionalNotes: created.additionalNotes,
            validationIssues: created.validationIssues,
            updatedBy: created.updatedBy,
          };
          await tx.offerVersion.create({
            data: {
              offerId: created.id,
              versionNumber: 1,
              changedBy: updatedBy,
              changeNote: 'Lexus ingestion',
              snapshot: snapshot as any,
            },
          });
        }
      }

      // Inactivate Lexus offers no longer in the current set
      const toInactivate = await tx.offer.findMany({
        where: {
          storeCode: { in: [...LEXUS_STORE_CODES] },
          externalId: { not: null },
          status: { not: OfferStatus.INACTIVE },
        },
        select: { id: true, externalId: true },
      });

      for (const o of toInactivate) {
        if (o.externalId && !currentExternalIds.has(o.externalId)) {
          await tx.offer.update({
            where: { id: o.id },
            data: { status: OfferStatus.INACTIVE, updatedBy },
          });
          result.inactivated++;
        }
      }
    },
    {
      timeout: 120000, // 2 minutes for large Lexus batches
      maxWait: 10000,
    }
  );

  return result;
}


