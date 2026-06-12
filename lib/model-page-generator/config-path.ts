/**
 * Resolve the model-page config root (stores, pages, approved-examples).
 * Used by server actions, CLI, run.ts, and list.ts.
 */

import * as fs from "fs";
import * as path from "path";

const DEMO_CONFIG_REL = path.join("demo", "modelpager-configs");
const LAB_CONFIG_REL = path.join("lab", "modelpager", "configs");

/**
 * Returns the absolute path to the model-page config directory.
 * - `MODELPAGER_CONFIGS` when set
 * - `demo/modelpager-configs` when `DEMO_MODE=true` and that tree exists
 * - otherwise `lab/modelpager/configs`
 */
export function getModelPageConfigRoot(): string {
  const env = process.env.MODELPAGER_CONFIGS;
  if (env && env.trim() !== "") {
    return path.isAbsolute(env) ? env : path.join(process.cwd(), env);
  }
  if (process.env.DEMO_MODE === "true") {
    const demoRoot = path.join(process.cwd(), DEMO_CONFIG_REL);
    if (fs.existsSync(demoRoot)) {
      return demoRoot;
    }
  }
  return path.join(process.cwd(), LAB_CONFIG_REL);
}
