import fs from 'fs';
import path from 'path';

import { isDemoMode } from '@/lib/config/demo';
import { demoModelPageAssetBaseUrl, rewriteProdAssetPathForDemo } from '@/lib/demo/model-page-assets';
import { getModelAssetCoverage, type ModelCoverageBrand } from '@/lib/domain/dashboard/summary';

type AssetType = 'hero' | 'vehicle' | 'modelPage';

interface AssetHealthEntry {
  model: string;
  assetType: AssetType;
  url: string;
  status: 'ok' | 'not_found' | 'error';
  httpStatus?: number;
  checkedAt: string;
}

interface AssetHealthFile {
  brand: ModelCoverageBrand;
  year: number;
  baseUrl: string;
  generatedAt: string;
  entries: AssetHealthEntry[];
}

async function head(url: string): Promise<{ status: 'ok' | 'not_found' | 'error'; httpStatus?: number }> {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (res.ok) {
      return { status: 'ok', httpStatus: res.status };
    }
    if (res.status === 404) {
      return { status: 'not_found', httpStatus: res.status };
    }
    return { status: 'error', httpStatus: res.status };
  } catch {
    return { status: 'error' };
  }
}

async function checkPageUrl(
  url: string,
): Promise<{ status: 'ok' | 'not_found' | 'error'; httpStatus?: number }> {
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    if (res.status === 404) {
      return { status: 'not_found', httpStatus: res.status };
    }
    if (res.status >= 200 && res.status < 400) {
      return { status: 'ok', httpStatus: res.status };
    }
    return { status: 'error', httpStatus: res.status };
  } catch {
    return { status: 'error' };
  }
}

export async function runAssetHealthChecks(input: {
  brand: ModelCoverageBrand;
  year: number;
}): Promise<void> {
  const { brand, year } = input;

  const baseUrl = isDemoMode()
    ? process.env.DEMO_ASSET_BASE_URL?.trim() || demoModelPageAssetBaseUrl()
    : process.env.ASSETS_R2_BASE_URL;
  if (!baseUrl) {
    throw new Error(
      isDemoMode()
        ? 'Missing demo asset base URL (set DEMO_ASSET_BASE_URL or use DEMO_MODE with /demo/assets).'
        : 'Missing ASSETS_R2_BASE_URL environment variable.',
    );
  }

  const assetBaseUrl: string = baseUrl;

  function assetUrlFromPath(assetPath: string): string {
    const rel = isDemoMode() ? rewriteProdAssetPathForDemo(assetPath) : assetPath;
    const normalized = rel.startsWith('/') ? rel.slice(1) : rel;
    const base = assetBaseUrl.endsWith('/') ? assetBaseUrl : `${assetBaseUrl}/`;
    return base + normalized;
  }

  const rows = await getModelAssetCoverage({ brand, year });

  const entries: AssetHealthEntry[] = [];
  const nowIso = new Date().toISOString();

  for (const row of rows) {
    if (row.heroImageInfo?.path) {
      const url = assetUrlFromPath(row.heroImageInfo.path);
      const result = await head(url);
      entries.push({
        model: row.model,
        assetType: 'hero',
        url,
        status: result.status,
        httpStatus: result.httpStatus,
        checkedAt: nowIso,
      });
    }

    if (row.vehicleImageInfo?.path) {
      const url = assetUrlFromPath(row.vehicleImageInfo.path);
      const result = await head(url);
      entries.push({
        model: row.model,
        assetType: 'vehicle',
        url,
        status: result.status,
        httpStatus: result.httpStatus,
        checkedAt: nowIso,
      });
    }

    if (row.modelPageInfo?.path) {
      try {
        const raw = fs.readFileSync(row.modelPageInfo.path, 'utf-8');
        const page = JSON.parse(raw) as {
          canonicalUrl?: string;
          pagePath?: string;
        };

        let url: string | undefined;
        if (page.canonicalUrl && /^https?:\/\//i.test(page.canonicalUrl)) {
          url = page.canonicalUrl;
        } else if (page.pagePath) {
          const baseModelPageUrl = process.env.MODEL_PAGES_BASE_URL;
          if (baseModelPageUrl) {
            const base = baseModelPageUrl.endsWith('/') ? baseModelPageUrl : `${baseModelPageUrl}/`;
            const rel = page.pagePath.startsWith('/') ? page.pagePath.slice(1) : page.pagePath;
            url = base + rel;
          }
        }

        if (url) {
          const result = await checkPageUrl(url);
          entries.push({
            model: row.model,
            assetType: 'modelPage',
            url,
            status: result.status,
            httpStatus: result.httpStatus,
            checkedAt: nowIso,
          });
        }
      } catch {
        // Ignore malformed model page configs here; summary will treat them as error via JSON parse.
      }
    }
  }

  const artifactsDir = path.join(process.cwd(), 'artifacts');
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  const file: AssetHealthFile = {
    brand,
    year,
    baseUrl,
    generatedAt: nowIso,
    entries,
  };

  const outPath = path.join(artifactsDir, `asset-health-${brand}-${year}.json`);
  fs.writeFileSync(outPath, JSON.stringify(file, null, 2));
}

