import { OfferStatus, VehicleCondition } from '@prisma/client';
import { parseLexusLeaseExamplesText } from '@/lib/ingestion/lexus/lease-examples-pdf';
import { buildPdfOnlyRowsAndCrosscheck, crosscheckApiWithPdf } from '@/lib/ingestion/lexus/pdf-crosscheck';
import type { LexusPreviewRow } from '@/lib/ingestion/lexus/run';

function makeLeaseRow(overrides: Partial<LexusPreviewRow> = {}): LexusPreviewRow {
  return {
    storeCode: 'LEXDT',
    storeCodes: ['LEXDT', 'LEXWG'],
    make: 'Lexus',
    model: 'UX',
    year: 2026,
    trim: 'Hybrid',
    condition: VehicleCondition.NEW,
    startDate: '2026-04-01',
    endDate: '2026-04-30',
    status: OfferStatus.LIVE,
    offerType: 'Lease',
    leasePayment: 399,
    leaseTerm: 36,
    leaseMiles: 10000,
    dueAtSigning: 3999,
    msrp: 34995,
    ...overrides,
  };
}

describe('Lexus PDF parser and crosscheck', () => {
  test('parses PA-only rows from tabular text', () => {
    const text = [
      '2026 UXH\t2026 NX',
      'States\tPA, NJ\tNJ',
      'Term\t36\t36',
      'Mileage\t10,000\t10,000',
      'Special Payment\t$399\t$499',
      'Base MSRP\t$34,995\t$45,000',
      'MSRP + DPH\t$36,090\t$46,095',
      'Cap Cost Reduction\t$1,500\t$2,000',
      'Due at Lease Inception (Drive-Off)*\t$3,999\t$4,999',
      'Date\t04/02/2026 - 04/30/2026\t04/02/2026 - 04/30/2026',
    ].join('\n');

    const result = parseLexusLeaseExamplesText(text);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.model).toBe('UX');
    expect(result.rows[0]?.trim).toBe('Hybrid');
    expect(result.rows[0]?.capCostReduction).toBe(1500);
    expect(result.rows[0]?.dateFrom).toBe('2026-04-02');
  });

  test('api+pdf crosscheck enriches and warns on mismatch', () => {
    const parsed = parseLexusLeaseExamplesText(
      [
        '2026 UXH',
        'States\tPA',
        'Term\t36',
        'Mileage\t10,000',
        'Special Payment\t$399',
        'Base MSRP\t$34,995',
        'MSRP + DPH\t$36,090',
        'Cap Cost Reduction\t$1,500',
        'Due at Lease Inception (Drive-Off)*\t$3,799',
      ].join('\n')
    );
    const apiRows = [makeLeaseRow({ dueAtSigning: 3999, additionalNotes: null })];

    const cross = crosscheckApiWithPdf(apiRows, parsed.rows);
    expect(cross.summary.matchedCount).toBe(1);
    expect(cross.summary.enrichedFields).toBe(1);
    expect(cross.summary.conflicts).toBe(1);
    expect(cross.rows[0]?.capCostReduction).toBe(1500);
    expect(cross.rows[0]?.additionalNotes ?? null).toBeNull();
  });

  test('keeps API MSRP by default and only backfills when missing', () => {
    const parsed = parseLexusLeaseExamplesText(
      [
        '2026 UXH',
        'States\tPA',
        'Term\t36',
        'Mileage\t10,000',
        'Special Payment\t$399',
        'Base MSRP\t$34,995',
        'Due at Lease Inception (Drive-Off)*\t$3,999',
      ].join('\n')
    );
    const keepApi = crosscheckApiWithPdf([makeLeaseRow({ msrp: 31000 })], parsed.rows);
    expect(keepApi.rows[0]?.msrp).toBe(31000);

    const backfill = crosscheckApiWithPdf([makeLeaseRow({ msrp: null })], parsed.rows);
    expect(backfill.rows[0]?.msrp).toBe(34995);
  });

  test('enriches cap cost reduction by model family + powertrain variant mapping', () => {
    const parsed = parseLexusLeaseExamplesText(
      [
        '2026 RX',
        'States\tPA',
        'Term\t39',
        'Special Payment\t$559',
        'Cap Cost Reduction\t$2,545',
        'Due at Lease Inception (Drive-Off)*\t$3,999',
        '2026 RXH',
        'States\tPA',
        'Term\t39',
        'Special Payment\t$519',
        'Cap Cost Reduction\t$4,585',
        'Due at Lease Inception (Drive-Off)*\t$5,999',
        '2026 RX PHV',
        'States\tPA',
        'Term\t39',
        'Special Payment\t$989',
        'Cap Cost Reduction\t$6,115',
        'Due at Lease Inception (Drive-Off)*\t$7,999',
      ].join('\n')
    );
    const apiRows = [
      makeLeaseRow({ model: 'RX 350', trim: 'PREMIUM AWD', leasePayment: 600, leaseTerm: 39, capCostReduction: null }),
      makeLeaseRow({ model: 'RX 350h', trim: 'PREMIUM AWD', leasePayment: 600, leaseTerm: 39, capCostReduction: null }),
      makeLeaseRow({ model: 'RX 450h+', trim: 'PREMIUM AWD', leasePayment: 600, leaseTerm: 39, capCostReduction: null }),
    ];
    const cross = crosscheckApiWithPdf(apiRows, parsed.rows);
    expect(cross.rows[0]?.capCostReduction).toBe(2545);
    expect(cross.rows[1]?.capCostReduction).toBe(4585);
    expect(cross.rows[2]?.capCostReduction).toBe(6115);
  });

  test('pdf-only mode creates rows and crosschecks against DB rows', () => {
    const parsed = parseLexusLeaseExamplesText(
      [
        '2026 UXH',
        'States\tPA',
        'Term\t36',
        'Mileage\t10,000',
        'Special Payment\t$399',
        'Base MSRP\t$34,995',
        'Cap Cost Reduction\t$1,500',
        'Due at Lease Inception (Drive-Off)*\t$3,999',
      ].join('\n')
    );
    const dbRows = [makeLeaseRow()];
    const cross = buildPdfOnlyRowsAndCrosscheck(parsed.rows, dbRows);
    expect(cross.rows).toHaveLength(1);
    expect(cross.summary.matchedCount).toBe(1);
    expect(cross.summary.unmatchedDbCount).toBe(0);
  });

  test('no-pdf fallback keeps API rows unchanged', () => {
    const apiRows = [makeLeaseRow()];
    const cross = crosscheckApiWithPdf(apiRows, []);
    expect(cross.rows).toHaveLength(1);
    expect(cross.summary.matchedCount).toBe(0);
    expect(cross.warnings).toHaveLength(0);
  });

  test('matches model/trim naming variants between API and PDF', () => {
    const parsed = parseLexusLeaseExamplesText(
      [
        '2026 Lexus UX250h',
        'States\tPA',
        'Term\t36',
        'Special Payment\t$399',
        'Due at Lease Inception (Drive-Off)*\t$3,999',
      ].join('\n')
    );
    const apiRows = [makeLeaseRow({ model: 'UXH', trim: 'H' })];
    const cross = crosscheckApiWithPdf(apiRows, parsed.rows);
    expect(cross.summary.matchedCount).toBe(1);
  });

  test('matches common trim aliases between API and PDF', () => {
    const parsed = parseLexusLeaseExamplesText(
      [
        '2026 RX350h',
        'States\tPA',
        'Term\t36',
        'Special Payment\t$699',
        'Due at Lease Inception (Drive-Off)*\t$4,999',
      ].join('\n')
    );
    const apiRows = [
      makeLeaseRow({
        model: 'RXH',
        trim: 'F SPORT Handling',
        leasePayment: 699,
        dueAtSigning: 4999,
      }),
    ];
    const pdfRows = parsed.rows.map((r) => ({ ...r, trim: 'f-sport handling' }));
    const cross = crosscheckApiWithPdf(apiRows, pdfRows);
    expect(cross.summary.matchedCount).toBe(1);
  });

  test('parses PA rows from space-delimited text layout', () => {
    const text = [
      'Model  2026 UX250h  2026 NX350h',
      'States  PA, NJ  NJ',
      'Term  36  36',
      'Special Payment  $399  $499',
      'Due at Lease Inception (Drive-Off)*  $3,999  $4,999',
    ].join('\n');
    const result = parseLexusLeaseExamplesText(text);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.model).toBe('UX250');
    expect(result.rows[0]?.trim).toBe('Hybrid');
  });

  test('parses label-only line followed by value line', () => {
    const text = [
      '2026 UX250h',
      'State',
      'PA',
      'Term',
      '36',
      'Special Payment',
      '$399',
      'Due at Lease Inception (Drive-Off)*',
      '$3,999',
    ].join('\n');
    const result = parseLexusLeaseExamplesText(text);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.states).toContain('PA');
    expect(result.rows[0]?.leaseTerm).toBe(36);
  });

  test('infers PA scope when document contains PA but row state is missing', () => {
    const text = [
      'Dealer support for PA region',
      '2026 UX250h',
      'Term\t36',
      'Special Payment\t$399',
      'Due at Lease Inception (Drive-Off)*\t$3,999',
    ].join('\n');
    const result = parseLexusLeaseExamplesText(text);
    expect(result.rows).toHaveLength(1);
    expect(String(result.rows[0]?.states)).toContain('PA');
  });

  test('does not match when strict key misses (no relaxed fallback)', () => {
    const parsed = parseLexusLeaseExamplesText(
      [
        '2026 UX250h',
        'States\tPA',
        'Term\t39',
        'Special Payment\t$404',
        'Due at Lease Inception (Drive-Off)*\t$3,999',
      ].join('\n')
    );
    const apiRows = [makeLeaseRow({ model: 'UXH', leaseTerm: 39, leasePayment: 399 })];
    const cross = crosscheckApiWithPdf(apiRows, parsed.rows);
    expect(cross.summary.matchedCount).toBe(0);
    expect(cross.warnings.some((w) => w.code === 'LEXUS_PDF_RELAXED_MATCH_USED')).toBe(false);
  });

  test('relaxed fallback does not match far-apart payment variants', () => {
    const parsed = parseLexusLeaseExamplesText(
      [
        '2026 TXH',
        'States\tPA',
        'Term\t39',
        'Special Payment\t$799',
        'Due at Lease Inception (Drive-Off)*\t$6,999',
      ].join('\n')
    );
    const apiRows = [makeLeaseRow({ model: 'TX', trim: '350 PREMIUM AWD', leaseTerm: 39, leasePayment: 619 })];
    const cross = crosscheckApiWithPdf(apiRows, parsed.rows);
    expect(cross.summary.matchedCount).toBe(0);
  });

  test('relaxed fallback blocks non-hybrid to hybrid matching', () => {
    const parsed = parseLexusLeaseExamplesText(
      [
        '2026 TXH',
        'States\tPA',
        'Term\t39',
        'Special Payment\t$619',
        'Due at Lease Inception (Drive-Off)*\t$6,999',
      ].join('\n')
    );
    const apiRows = [makeLeaseRow({ model: 'TX', trim: '350 PREMIUM AWD', leaseTerm: 39, leasePayment: 619 })];
    const cross = crosscheckApiWithPdf(apiRows, parsed.rows);
    expect(cross.summary.matchedCount).toBe(0);
  });

  test('splits repeated-year model header line into separate rows', () => {
    const text = [
      '2026 TXH  2026 TX  2026 TX PHV',
      'States\tPA\tPA\tPA',
      'Term\t36\t36\t36',
      'Special Payment\t$599\t$579\t$619',
      'Due at Lease Inception (Drive-Off)*\t$4,999\t$4,799\t$5,299',
    ].join('\n');
    const result = parseLexusLeaseExamplesText(text);
    expect(result.rows.length).toBeGreaterThanOrEqual(3);
    expect(result.rows.some((r) => r.model === 'TX')).toBe(true);
  });

  test('splits concatenated repeated-year model tokens without separator', () => {
    const text = [
      '2026 TXH2026 TX2026 TX PHV',
      'States\tPA\tPA\tPA',
      'Term\t36\t36\t36',
      'Special Payment\t$599\t$579\t$619',
      'Due at Lease Inception (Drive-Off)*\t$4,999\t$4,799\t$5,299',
    ].join('\n');
    const result = parseLexusLeaseExamplesText(text);
    expect(result.rows.length).toBeGreaterThanOrEqual(3);
  });

  test('infers term/payment from inline sentence near model', () => {
    const text = [
      '2026 TX PHV',
      'Eligible in PA',
      'Lease offer: $619 per month for 36 months',
      'Due at Lease Inception (Drive-Off)* $5,299',
      'State\tPA',
    ].join('\n');
    const result = parseLexusLeaseExamplesText(text);
    const row = result.rows.find((r) => r.model.includes('TX'));
    expect(row?.leasePayment).toBe(619);
    expect(row?.leaseTerm).toBe(36);
  });

  test('parses unlabeled continuation table rows by positional mapping', () => {
    const text = [
      '2026 TXH\t2026 TXH\t2026 TX PHV\t2026 TX PHV',
      '04/1/2026 - 05/4/2026\t04/1/2026 - 05/4/2026\t04/1/2026 - 05/4/2026\t04/1/2026 - 05/4/2026',
      'MA\tCT, DE, MD, ME, NH, NJ, NY, PA, RI, VA, VT, WV\tCT, DE, MD, ME, NH, NJ, NY, PA, RI, VA, VT, WV\tMA',
      'PR\tPR',
      '39\t39\t39\t39',
      '10,000\t10,000\t10,000\t10,000',
      '5TDABAB61TS021737\t5TDABAB61TS021737\t5TDACAC65TS001826\t5TDACAC65TS001826',
      '9360\t9360\t9365\t9365',
      'CP TP Z1\tCP TP Z1\t63 BI CP TP\t63 BI CP TP',
      '$73,939\t$73,939\t$85,294\t$85,294',
      '$73,939\t$69,960\t$80,310\t$85,294',
      '60%\t60%\t65%\t65%',
      '$44,363\t$44,363\t$55,441\t$55,441',
      '$799\t$799\t$989\t$989',
      '$7,799\t$6,999\t$7,999\t$7,999',
    ].join('\n');
    const result = parseLexusLeaseExamplesText(text);
    expect(result.rows.length).toBeGreaterThanOrEqual(2);
    expect(result.rows.some((r) => r.leaseTerm === 39)).toBe(true);
    expect(result.rows.some((r) => r.leasePayment === 799 || r.leasePayment === 989)).toBe(true);
  });

  test('parses cap cost reduction from concatenated row values', () => {
    const text = [
      '2026 TXH2026 TXH2026 TX PHV2026 TX PHV',
      '04/1/2026 - 05/4/202604/1/2026 - 05/4/202604/1/2026 - 05/4/202604/1/2026 - 05/4/2026',
      'MACT, DE, MD, ME, NH, NJ, NY, PA, RI, VA, VT, WVCT, DE, MD, ME, NH, NJ, NY, PA, RI, VA, VT, WVMA',
      'PRPR',
      '39393939',
      '10,00010,00010,00010,000',
      '5TDABAB61TS0217375TDABAB61TS0217375TDACAC65TS0018265TDACAC65TS001826',
      '9360936093659365',
      'CP TP Z1CP TP Z163 BI CP TP63 BI CP TP',
      '$73,939$73,939$85,294$85,294',
      '$73,939$69,960$80,310$85,294',
      '60%60%65%65%',
      '$44,363$44,363$55,441$55,441',
      '$799$799$989$989',
      '$71,515$71,514$86,368$85,569',
      '$66,209$66,209$80,253$80,253',
      '$5,306$5,305$6,115$5,316',
      '$1,025$1,024$4,843$4,044',
      '0.002160.002160.002600.00260',
      '$895$895$895$895',
      '$799N/AN/A$799',
      '$0$0$0$0',
      '$0$0$0$0',
      '$7,799$6,999$7,999$7,999',
    ].join('\n');
    const result = parseLexusLeaseExamplesText(text);
    expect(result.rows.some((r) => r.capCostReduction === 5305 || r.capCostReduction === 6115)).toBe(true);
  });

  test('flushes prior unlabeled model group before next header', () => {
    const text = [
      '2026 NXH2026 NX PHV',
      '04/1/2026 - 05/4/202604/1/2026 - 05/4/2026',
      'CT, DE, MD, ME, NH, NJ, NY, PA, RI, VA, VT, WVCT, DE, MD, ME, NH, NJ, NY, PA, RI, VA, VT, WV',
      '3939',
      '$559$519',
      '$3,999$5,999',
      '2026 TXH2026 TX PHV',
      '04/1/2026 - 05/4/202604/1/2026 - 05/4/2026',
      'CT, DE, MD, ME, NH, NJ, NY, PA, RI, VA, VT, WVCT, DE, MD, ME, NH, NJ, NY, PA, RI, VA, VT, WV',
      '3939',
      '$799$989',
      '$6,999$7,999',
    ].join('\n');
    const result = parseLexusLeaseExamplesText(text);
    expect(result.rows.length).toBeGreaterThanOrEqual(4);
    expect(result.rows.some((r) => r.model.includes('NX'))).toBe(true);
    expect(result.rows.some((r) => r.model.includes('TX'))).toBe(true);
  });
});

