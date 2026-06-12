import { Offer } from '@prisma/client';
import { getStoreConfig } from '@/lib/config/stores.server';
import { getInventoryUrlForStore, getImageUrlForOffer } from '@/lib/domain/offer-assets';

/**
 * Renders offers as Schema.org-compliant JSON-LD (Product + Car types)
 * This format is optimized for Google Search and structured data recognition.
 * 
 * Follows Schema.org Product and Car schema specifications:
 * - https://schema.org/Product
 * - https://schema.org/Car
 * 
 * Date fields are automatically serialized to ISO 8601 / RFC 3339 format
 * (e.g., "2026-01-21T20:20:15.869Z") which is the standard JSON date format.
 */
export function renderWebJson(offers: Offer[], storeCode: string): string {
  const storeConfig = getStoreConfig(storeCode as any);
  
  const structuredData = offers.map(offer => {
    // Build vehicle name
    const vehicleNameParts = [
      offer.year?.toString(),
      offer.make,
      offer.model,
      offer.trim,
    ].filter(Boolean);
    const name = vehicleNameParts.join(' ');

    // Build brand
    const brandName = offer.make || storeConfig?.brand || 'Unknown';
    
    // Determine condition
    const itemCondition = offer.condition === 'USED' 
      ? 'https://schema.org/UsedCondition'
      : offer.condition === 'CERTIFIED'
      ? 'https://schema.org/RefurbishedCondition'
      : 'https://schema.org/NewCondition';

    // Build offers array (can have multiple: lease, buy, finance)
    const offersArray: any[] = [];

    // Buy offer
    if (offer.buyFor !== null && offer.buyFor !== undefined) {
      const buyOffer: any = {
        '@type': 'Offer',
        'price': offer.buyFor,
        'priceCurrency': 'USD',
        'availability': 'https://schema.org/InStock',
        'itemCondition': itemCondition,
        'priceValidUntil': offer.endDate.toISOString().split('T')[0],
      };

      if (offer.msrp && offer.discount) {
        buyOffer.priceSpecification = {
          '@type': 'UnitPriceSpecification',
          'price': offer.buyFor,
          'priceCurrency': 'USD',
          'referenceQuantity': {
            '@type': 'QuantitativeValue',
            'value': 1,
            'unitCode': 'C62', // unit code for "one"
          },
        };
      }

      offersArray.push(buyOffer);
    }

    // Lease offer
    if (offer.leasePayment !== null && offer.leaseTerm !== null) {
      offersArray.push({
        '@type': 'Offer',
        'price': offer.leasePayment,
        'priceCurrency': 'USD',
        'availability': 'https://schema.org/InStock',
        'itemCondition': itemCondition,
        'priceValidUntil': offer.endDate.toISOString().split('T')[0],
        'leaseLength': {
          '@type': 'QuantitativeValue',
          'value': offer.leaseTerm,
          'unitCode': 'MON', // months
        },
        'description': `Lease: $${offer.leasePayment}/mo. for ${offer.leaseTerm} mo.${offer.leaseMiles ? `, ${offer.leaseMiles} mi/yr` : ''}${offer.dueAtSigning ? `, $${offer.dueAtSigning} due at signing` : ''}`,
      });
    }

    // Build the Schema.org structure
    const carSchema: any = {
      '@context': 'https://schema.org',
      '@type': ['Product', 'Car'],
      'name': name,
      'brand': {
        '@type': 'Brand',
        'name': brandName,
      },
      'model': offer.model,
      'vehicleModelDate': offer.year?.toString() ?? '',
      'itemCondition': itemCondition,
    };

    // Add trim if available
    if (offer.trim) {
      carSchema.model = `${offer.model} ${offer.trim}`;
    }

    // Add image (use computed when stored is null, same as Offer Details page)
    const imageUrl = getImageUrlForOffer(offer);
    if (imageUrl) {
      carSchema.image = imageUrl;
    }

    // Add URL (use store-specific URL for Lexus multi-store)
    const inventoryUrl = getInventoryUrlForStore(offer, storeCode);
    if (inventoryUrl) {
      carSchema.url = inventoryUrl;
    }

    // Add offers
    if (offersArray.length > 0) {
      carSchema.offers = offersArray.length === 1 ? offersArray[0] : offersArray;
    }

    // Add description if available
    if (offer.additionalNotes) {
      carSchema.description = offer.additionalNotes;
    }

    // Add stock number as identifier
    if (offer.stockNumber) {
      carSchema.sku = offer.stockNumber;
    }

    return carSchema;
  });

  return JSON.stringify(structuredData, null, 2);
}
