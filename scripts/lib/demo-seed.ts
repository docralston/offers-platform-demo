import { OfferStatus, OfferTypeEnum, Prisma, VehicleCondition } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import {
  demoAssetBaseUrl,
  demoEndDateEastern,
  demoStartDateEastern,
  demoVehicleAssetPath,
} from '@/lib/config/demo';
import { demoJellybeanFilename } from '@/lib/demo/model-page-assets';

type DemoSeedRow = {
  externalId: string;
  storeCode: string;
  make: string;
  model: string;
  year: number;
  trim?: string;
  offerType: OfferTypeEnum;
  condition?: VehicleCondition;
  leasePayment?: number;
  leaseTerm?: number;
  leaseMiles?: number;
  dueAtSigning?: number;
  aprRate?: number;
  aprTermMonths?: number;
  buyFor?: number;
  msrp?: number;
  discount?: number;
  /** Filename only — resolved to `{make}/{year}/{imageFile}` under demo assets. */
  imageFile: string;
  validationIssues?: unknown;
  status?: OfferStatus;
};

const DEMO_SEED_ROWS: DemoSeedRow[] = [
  {
    externalId: 'demo-toy-camry-lease',
    storeCode: 'TOY',
    make: 'Toyota',
    model: 'Camry',
    year: 2026,
    trim: 'LE',
    offerType: OfferTypeEnum.Lease,
    leasePayment: 299,
    leaseTerm: 36,
    leaseMiles: 12000,
    dueAtSigning: 2999,
    msrp: 31800,
    imageFile: demoJellybeanFilename('Toyota', 'Camry', 2026),
  },
  {
    externalId: 'demo-toy-camry-finance',
    storeCode: 'TOY',
    make: 'Toyota',
    model: 'Camry',
    year: 2026,
    trim: 'LE',
    offerType: OfferTypeEnum.Finance,
    aprRate: 1.9,
    aprTermMonths: 60,
    msrp: 31800,
    imageFile: demoJellybeanFilename('Toyota', 'Camry', 2026),
  },
  {
    externalId: 'demo-toy-rav4-lease',
    storeCode: 'TOY',
    make: 'Toyota',
    model: 'RAV4',
    year: 2026,
    trim: 'XLE',
    offerType: OfferTypeEnum.Lease,
    leasePayment: 349,
    leaseTerm: 36,
    leaseMiles: 12000,
    dueAtSigning: 3499,
    msrp: 38900,
    imageFile: '2026-toyota-rav4-jellybean.png',
  },
  {
    externalId: 'demo-toy-rav4-finance',
    storeCode: 'TOY',
    make: 'Toyota',
    model: 'RAV4',
    year: 2026,
    trim: 'XLE',
    offerType: OfferTypeEnum.Finance,
    aprRate: 2.9,
    aprTermMonths: 60,
    msrp: 38900,
    imageFile: '2026-toyota-rav4-jellybean.png',
  },
  {
    externalId: 'demo-toy-tacoma-cash',
    storeCode: 'TOY',
    make: 'Toyota',
    model: 'Tacoma',
    year: 2026,
    offerType: OfferTypeEnum.Cash,
    msrp: 42000,
    discount: 2500,
    buyFor: 39500,
    imageFile: demoJellybeanFilename('Toyota', 'Tacoma', 2026),
  },
  {
    externalId: 'demo-bmw-x3-lease',
    storeCode: 'BMW',
    make: 'BMW',
    model: 'X3',
    year: 2026,
    trim: 'xDrive30i',
    offerType: OfferTypeEnum.Lease,
    leasePayment: 549,
    leaseTerm: 39,
    leaseMiles: 10000,
    dueAtSigning: 5499,
    msrp: 52300,
    imageFile: demoJellybeanFilename('BMW', 'X3', 2026),
  },
  {
    externalId: 'demo-bmw-x3-finance',
    storeCode: 'BMW',
    make: 'BMW',
    model: 'X3',
    year: 2026,
    trim: 'xDrive30i',
    offerType: OfferTypeEnum.Finance,
    aprRate: 3.49,
    aprTermMonths: 48,
    msrp: 52300,
    imageFile: demoJellybeanFilename('BMW', 'X3', 2026),
  },
  {
    externalId: 'demo-bmw-3-lease',
    storeCode: 'BMW',
    make: 'BMW',
    model: '3 Series',
    year: 2026,
    trim: '330i',
    offerType: OfferTypeEnum.Lease,
    leasePayment: 489,
    leaseTerm: 36,
    leaseMiles: 10000,
    dueAtSigning: 4899,
    msrp: 47800,
    imageFile: demoJellybeanFilename('BMW', '3 Series', 2026),
  },
  {
    externalId: 'demo-bmw-3-finance',
    storeCode: 'BMW',
    make: 'BMW',
    model: '3 Series',
    year: 2026,
    trim: '330i',
    offerType: OfferTypeEnum.Finance,
    aprRate: 3.99,
    aprTermMonths: 48,
    msrp: 47800,
    imageFile: demoJellybeanFilename('BMW', '3 Series', 2026),
  },
  {
    externalId: 'demo-bmw-x5-cash',
    storeCode: 'BMW',
    make: 'BMW',
    model: 'X5',
    year: 2026,
    offerType: OfferTypeEnum.Cash,
    msrp: 72000,
    discount: 4000,
    buyFor: 68000,
    imageFile: demoJellybeanFilename('BMW', 'X5', 2026),
  },
  {
    externalId: 'demo-lexdt-rx-lease',
    storeCode: 'LEXDT',
    make: 'Lexus',
    model: 'RX',
    year: 2026,
    trim: '350',
    offerType: OfferTypeEnum.Lease,
    leasePayment: 499,
    leaseTerm: 36,
    leaseMiles: 10000,
    dueAtSigning: 4999,
    msrp: 56250,
    imageFile: demoJellybeanFilename('Lexus', 'RX', 2026),
  },
  {
    externalId: 'demo-lexdt-rx-finance',
    storeCode: 'LEXDT',
    make: 'Lexus',
    model: 'RX',
    year: 2026,
    trim: '350',
    offerType: OfferTypeEnum.Finance,
    aprRate: 2.99,
    aprTermMonths: 60,
    msrp: 56250,
    imageFile: demoJellybeanFilename('Lexus', 'RX', 2026),
  },
  {
    externalId: 'demo-lexdt-es-lease',
    storeCode: 'LEXDT',
    make: 'Lexus',
    model: 'ES',
    year: 2026,
    trim: '350',
    offerType: OfferTypeEnum.Lease,
    leasePayment: 459,
    leaseTerm: 36,
    leaseMiles: 10000,
    dueAtSigning: 4599,
    msrp: 44800,
    imageFile: demoJellybeanFilename('Lexus', 'ES', 2026),
  },
  {
    externalId: 'demo-lexdt-es-finance',
    storeCode: 'LEXDT',
    make: 'Lexus',
    model: 'ES',
    year: 2026,
    trim: '350',
    offerType: OfferTypeEnum.Finance,
    aprRate: 2.49,
    aprTermMonths: 60,
    msrp: 44800,
    imageFile: demoJellybeanFilename('Lexus', 'ES', 2026),
  },
  {
    externalId: 'demo-lexwg-nx-lease',
    storeCode: 'LEXWG',
    make: 'Lexus',
    model: 'NX',
    year: 2026,
    trim: '350',
    offerType: OfferTypeEnum.Lease,
    leasePayment: 429,
    leaseTerm: 36,
    leaseMiles: 10000,
    dueAtSigning: 4299,
    imageFile: demoJellybeanFilename('Lexus', 'NX', 2026),
  },
  {
    externalId: 'demo-lexwg-is-finance',
    storeCode: 'LEXWG',
    make: 'Lexus',
    model: 'IS',
    year: 2026,
    trim: '300',
    offerType: OfferTypeEnum.Finance,
    aprRate: 3.49,
    aprTermMonths: 48,
    imageFile: demoJellybeanFilename('Lexus', 'IS', 2026),
  },
  {
    externalId: 'demo-toy-validation-example',
    storeCode: 'TOY',
    make: 'Toyota',
    model: 'Corolla',
    year: 2026,
    offerType: OfferTypeEnum.Lease,
    leasePayment: 199,
    leaseTerm: 36,
    imageFile: demoJellybeanFilename('Toyota', 'Corolla', 2026),
    status: OfferStatus.INACTIVE,
    validationIssues: [
      {
        code: 'LEASE_INCOMPLETE',
        severity: 'error',
        message: 'Missing lease miles and due at signing (soft-block demo)',
      },
    ],
  },
];

export async function seedDemoOffers(prisma: PrismaClient): Promise<number> {
  const startDate = demoStartDateEastern();
  const endDate = demoEndDateEastern();
  const assetBase = demoAssetBaseUrl();

  let upserted = 0;
  for (const row of DEMO_SEED_ROWS) {
    const {
      externalId,
      imageFile,
      validationIssues,
      status: statusOverride,
      ...fields
    } = row;

    const imagePath = demoVehicleAssetPath(fields.make, fields.year, imageFile);

    await prisma.offer.upsert({
      where: {
        storeCode_externalId: {
          storeCode: fields.storeCode,
          externalId,
        },
      },
      create: {
        ...fields,
        externalId,
        storeCodes: [fields.storeCode],
        condition: fields.condition ?? VehicleCondition.NEW,
        startDate,
        endDate,
        status: statusOverride ?? OfferStatus.LIVE,
        imageUrl: `${assetBase}/${imagePath}`,
        inventoryUrl: null,
        validationIssues: validationIssues
          ? (validationIssues as Prisma.InputJsonValue)
          : undefined,
        updatedBy: 'seed-demo',
      },
      update: {
        ...fields,
        startDate,
        endDate,
        status: statusOverride ?? OfferStatus.LIVE,
        imageUrl: `${assetBase}/${imagePath}`,
        validationIssues: validationIssues
          ? (validationIssues as Prisma.InputJsonValue)
          : undefined,
        updatedBy: 'seed-demo',
      },
    });
    upserted += 1;
  }

  return upserted;
}

export async function resetDemoOffers(prisma: PrismaClient): Promise<{ cleared: number; seeded: number }> {
  // Database-only: clears Offer rows (OfferVersion cascades). Does not touch AppSetting,
  // model-page files, deploy config, or any other demo functionality.
  const cleared = await prisma.offer.deleteMany();
  const seeded = await seedDemoOffers(prisma);
  return { cleared: cleared.count, seeded };
}
