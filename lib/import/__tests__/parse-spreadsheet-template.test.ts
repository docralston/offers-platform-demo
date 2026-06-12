import { describe, it, expect } from 'vitest';
import { OFFERS_TABLE_COLUMN_ORDER } from '@/lib/ingestion/constants';
import { OFFERS_CSV_HEADERS as TOYOTA_HEADERS } from '@/lib/ingestion/toyota/constants';
import { LEXUS_OFFERS_CSV_HEADERS } from '@/lib/ingestion/lexus/constants';
import { parseSpreadsheetToOffers } from '@/lib/import/parse-spreadsheet';

describe('import/export canonical headers', () => {
  it('Toyota and Lexus CSV headers match OFFERS_TABLE_COLUMN_ORDER', () => {
    expect(TOYOTA_HEADERS).toEqual(OFFERS_TABLE_COLUMN_ORDER);
    expect(LEXUS_OFFERS_CSV_HEADERS).toEqual(OFFERS_TABLE_COLUMN_ORDER);
  });

  it('parses a CSV row built from OFFERS_TABLE_COLUMN_ORDER into OfferInput', () => {
    const headers = OFFERS_TABLE_COLUMN_ORDER;

    const row: Record<string, unknown> = {
      status: 'INACTIVE',
      storeCode: 'TOY',
      storeCodes: '',
      stockNumber: 'ST12345',
      condition: 'NEW',
      year: 2025,
      make: '',
      model: 'Camry',
      series: 'Camry',
      modelCode: 1234,
      trim: 'LE',
      msrp: 30000,
      offerType: 'Lease',
      leasePayment: 299,
      leaseTerm: 36,
      leaseMiles: 12000,
      downPayment: 0,
      dueAtSigning: 2500,
      acquisitionFee: 650,
      aprRate: 3.99,
      aprTermMonths: 60,
      discount: 1500,
      buyFor: 28500,
      customerCash: 1000,
      leaseCash: 500,
      aprCash: 0,
      bonusCash: 0,
      rebateTotal: 2000,
      disclaimer: 'See dealer for details',
      inventoryUrl: 'https://example.com/vehicle/1',
      imageUrl: 'https://example.com/images/camry.jpg',
      additionalNotes: 'Special lease promotion',
      startDate: '2025-01-01',
      endDate: '2025-01-31',
    };

    const csvLine =
      headers
        .map((h) => {
          const v = row[h];
          return v == null ? '' : String(v);
        })
        .join(',') + '\n';

    const csv = headers.join(',') + '\n' + csvLine;
    const buffer = Buffer.from(csv, 'utf8');

    const result = parseSpreadsheetToOffers(buffer);

    expect(result.headers.filter((h) => h !== '__EMPTY')).toEqual(headers);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);

    const offer = result.rows[0].offer;
    expect(offer.storeCode).toBe('TOY');
    expect(offer.model).toBe('Camry');
    expect(offer.series).toBe('Camry');
    expect(offer.year).toBe(2025);
    expect(offer.trim).toBe('LE');
    expect(offer.modelCode).toBe('1234');
    expect(offer.msrp).toBe(30000);
    expect(offer.offerType).toBe('Lease');
    expect(offer.leasePayment).toBe(299);
    expect(offer.leaseTerm).toBe(36);
    expect(offer.leaseMiles).toBe(12000);
    expect(offer.dueAtSigning).toBe(2500);
    expect(offer.aprRate).toBe(3.99);
    expect(offer.aprTermMonths).toBe(60);
    expect(offer.discount).toBe(1500);
    expect(offer.buyFor).toBe(28500);
    expect(offer.rebateTotal).toBe(2000);
    expect(offer.disclaimer).toBe('See dealer for details');
    expect(offer.inventoryUrl).toBe('https://example.com/vehicle/1');
    expect(offer.imageUrl).toBe('https://example.com/images/camry.jpg');
    expect(offer.additionalNotes).toBe('Special lease promotion');
  });
});

