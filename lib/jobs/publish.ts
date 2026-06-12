import { Job, JobResult } from './types';
import { selectOffersForPublish } from '@/lib/domain/selection';
import { renderEmailHtml } from '@/lib/renderers/email';
import { renderParcelEmailHtml } from '@/lib/renderers/parcel-email';
import { renderLandingPageHtml } from '@/lib/renderers/landing-page';
import { renderWebJson } from '@/lib/renderers/json';
import { renderAdsCsv } from '@/lib/renderers/csv';
import { renderPdfFlyer } from '@/lib/renderers/pdf';

export interface PublishJobData {
  storeCode: string;
  dateFrom: Date;
  dateTo: Date;
}

/**
 * Publish job - generates all output formats for offers
 * Pure function (no side effects, queue-friendly)
 */
export class PublishJob implements Job {
  id = 'publish';
  name = 'Publish Offers';

  async execute(data: unknown): Promise<JobResult> {
    try {
      const { storeCode, dateFrom, dateTo } = data as PublishJobData;

      // Select offers
      const offers = await selectOffersForPublish(storeCode, dateFrom, dateTo);

      // Generate all outputs
      const artifacts: Record<string, string | Buffer> = {
        emailHtml: renderEmailHtml(offers, storeCode),
        parcelEmailHtml: renderParcelEmailHtml(offers, storeCode),
        landingPageHtml: renderLandingPageHtml(offers, storeCode),
        webJson: renderWebJson(offers, storeCode),
        adsCsv: renderAdsCsv(offers),
      };

      // PDF generation (async, may fail if not implemented)
      try {
        artifacts.pdfFlyer = await renderPdfFlyer(offers, storeCode);
      } catch (error) {
        // PDF not yet implemented, skip for now
        console.warn('PDF generation not available:', error);
      }

      return {
        success: true,
        artifacts,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
