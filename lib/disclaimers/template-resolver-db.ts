import { prisma } from '@/lib/prisma';
import {
  CODE_FALLBACK_TEMPLATES,
  DISCLAIMER_TEMPLATES_KEY,
  mergeTemplateConfig,
  type DisclaimerTemplatesConfig,
} from '@/lib/disclaimers/template-resolver';

export async function getDisclaimerTemplatesConfig(): Promise<DisclaimerTemplatesConfig> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: DISCLAIMER_TEMPLATES_KEY } });
    if (!row?.value || typeof row.value !== 'object') {
      return CODE_FALLBACK_TEMPLATES;
    }
    return mergeTemplateConfig(row.value as Partial<DisclaimerTemplatesConfig>);
  } catch {
    return CODE_FALLBACK_TEMPLATES;
  }
}
