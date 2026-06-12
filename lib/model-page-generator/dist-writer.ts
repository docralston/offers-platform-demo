import * as fs from "fs";
import * as path from "path";
import type { ModelYearPage } from "./schema";
import type { StoreConfig } from "./schema";
import { resolveModelYearTemplatePath } from "./template-registry";

function isModelYearPage(page: ModelYearPage): boolean {
  const pageType = (page as ModelYearPage & { pageType?: string }).pageType;
  return !pageType || pageType === "model-year";
}

function domainForStore(store: StoreConfig): string {
  const fromConfig = String(store.domain ?? "").trim();
  if (fromConfig) return fromConfig;
  const siteUrl = String(store.siteUrl ?? "").trim();
  if (!siteUrl) {
    throw new Error("Store is missing both domain and siteUrl");
  }
  try {
    return new URL(siteUrl).host;
  } catch {
    throw new Error(`Invalid store siteUrl: ${siteUrl}`);
  }
}

function normalizePagePath(pagePath: string): string {
  const p = String(pagePath ?? "").trim();
  if (!p) throw new Error("Page is missing pagePath");
  return p.startsWith("/") ? p.slice(1) : p;
}

export function writeModelYearDistHtml(
  configRoot: string,
  brandSlug: string,
  store: StoreConfig,
  page: ModelYearPage
): string {
  if (!isModelYearPage(page)) {
    return "";
  }
  const templatePath = resolveModelYearTemplatePath(brandSlug);
  const templateHtml = fs.readFileSync(templatePath, "utf8");

  // Keep this dynamic require aligned with existing model-page renderer usage.
  const renderModule = require("@/lab/modelpager/scripts/render-model-page") as {
    renderModelYearPage: (template: string, storeCfg: unknown, pageJson: unknown) => string;
  };
  const html = renderModule.renderModelYearPage(templateHtml, store, page);

  const distRoot = path.join(path.dirname(configRoot), "dist");
  const outPath = path.join(
    distRoot,
    domainForStore(store),
    normalizePagePath(page.pagePath ?? "")
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, "utf8");
  return outPath;
}
