import * as fs from 'fs';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('getModelPageConfigRoot', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses demo/modelpager-configs when DEMO_MODE and tree exists', async () => {
    process.env.DEMO_MODE = 'true';
    delete process.env.MODELPAGER_CONFIGS;
    const demoRoot = path.join(process.cwd(), 'demo', 'modelpager-configs');
    expect(fs.existsSync(demoRoot)).toBe(true);
    const { getModelPageConfigRoot } = await import('../config-path');
    expect(getModelPageConfigRoot()).toBe(demoRoot);
  });

  it('prefers MODELPAGER_CONFIGS over demo default', async () => {
    process.env.DEMO_MODE = 'true';
    process.env.MODELPAGER_CONFIGS = 'lab/modelpager/configs';
    const { getModelPageConfigRoot } = await import('../config-path');
    expect(getModelPageConfigRoot()).toBe(
      path.join(process.cwd(), 'lab', 'modelpager', 'configs'),
    );
  });
});
