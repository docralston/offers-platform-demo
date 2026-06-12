/**
 * Client-safe enum values matching Prisma enums.
 * Use these in client components instead of importing from @prisma/client.
 */

export const OfferStatus = {
  LIVE: 'LIVE',
  INACTIVE: 'INACTIVE',
} as const;

export type OfferStatus = (typeof OfferStatus)[keyof typeof OfferStatus];

export const VehicleCondition = {
  NEW: 'NEW',
  USED: 'USED',
  CERTIFIED: 'CERTIFIED',
} as const;

export type VehicleCondition = (typeof VehicleCondition)[keyof typeof VehicleCondition];
