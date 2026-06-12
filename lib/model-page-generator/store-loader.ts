/**
 * Load modelpager store JSON from configs/stores. No dependency on generator/Prisma.
 */

import * as fs from "fs";
import * as path from "path";
import type { StoreConfig } from "./schema";

function loadJson<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as T;
}

/** Resolve store config path and load store. Used by CLI scripts that must not import generator. */
export function loadStore(
  configRoot: string,
  brand: string,
  storeKey: string | null
): StoreConfig {
  const storesDir = path.join(configRoot, "stores");
  const brandDir = path.join(storesDir, brand.toLowerCase());
  let storePath: string;
  if (storeKey) {
    storePath = path.join(brandDir, `${storeKey}.json`);
    if (!fs.existsSync(storePath)) {
      throw new Error(`Store config not found: ${brandDir}/${storeKey}.json`);
    }
  } else {
    const toyPath = path.join(brandDir, "toy.json");
    if (fs.existsSync(toyPath)) storePath = toyPath;
    else {
      const files = fs.readdirSync(brandDir).filter((f) => f.endsWith(".json"));
      if (files.length === 0) throw new Error(`No store config found in ${brandDir}`);
      storePath = path.join(brandDir, files[0]);
    }
  }
  return loadJson<StoreConfig>(storePath);
}
