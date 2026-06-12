'use server';

import { requireUserId } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  DEFAULT_DASHBOARD_ORDER,
  type DashboardLayout,
  type DashboardWidgetId,
} from '@/lib/dashboard/layout';
import { Prisma } from '@prisma/client';
import { revalidatePath } from 'next/cache';

function layoutKey(userId: string): string {
  return `dashboard_layout:${userId}`;
}

export async function getDashboardLayout(): Promise<DashboardLayout> {
  const userId = await requireUserId();
  const row = await prisma.appSetting.findUnique({ where: { key: layoutKey(userId) } });
  if (!row?.value || typeof row.value !== 'object') {
    return { order: [...DEFAULT_DASHBOARD_ORDER], hidden: [] };
  }
  const v = row.value as { order?: string[]; hidden?: string[] };
  const order = (v.order ?? DEFAULT_DASHBOARD_ORDER).filter((id): id is DashboardWidgetId =>
    (DEFAULT_DASHBOARD_ORDER as readonly string[]).includes(id),
  );
  const hidden = (v.hidden ?? []).filter((id): id is DashboardWidgetId =>
    (DEFAULT_DASHBOARD_ORDER as readonly string[]).includes(id),
  );
  const missing = DEFAULT_DASHBOARD_ORDER.filter((id) => !order.includes(id));
  return { order: [...order, ...missing], hidden };
}

export async function saveDashboardLayout(
  order: DashboardWidgetId[],
  hidden: DashboardWidgetId[],
): Promise<{ success: boolean }> {
  const userId = await requireUserId();
  const payload = { order, hidden };
  await prisma.appSetting.upsert({
    where: { key: layoutKey(userId) },
    create: {
      key: layoutKey(userId),
      value: payload as unknown as Prisma.InputJsonValue,
      updatedBy: userId,
    },
    update: {
      value: payload as unknown as Prisma.InputJsonValue,
      updatedBy: userId,
    },
  });
  revalidatePath('/admin');
  return { success: true };
}
