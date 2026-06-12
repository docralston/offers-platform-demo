'use server';

import { revalidatePath } from 'next/cache';
import { resolveAiUsageProviderForDisplay } from '@/lib/ai-usage-display';
import { countUnpricedSuccessRequests } from '@/lib/ai-usage/unpriced-models';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/auth';

export interface AiUsageFilters {
  from?: Date;
  to?: Date;
  model?: string;
  status?: 'success' | 'error';
  tag?: string;
  page?: number;
  pageSize?: number;
}

export interface WeeklyCostPoint {
  weekStart: Date;
  totalCost: number;
}

function roundUsdToCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  // Nearest cent rounding: 12.345 -> 12.35
  return Math.round(value * 100) / 100;
}

export interface AiUsageProviderBreakdownRow {
  provider: string;
  apiPath: string;
  requests: number;
  success: number;
  errors: number;
  totalCostUsd: number;
  avgDurationMs: number;
}

function tagRecordMatchesQuery(
  tags: unknown,
  rawQuery: string | undefined
): boolean {
  const query = (rawQuery ?? '').trim().toLowerCase();
  if (!query) return true;
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) return false;
  const record = tags as Record<string, unknown>;
  return Object.entries(record).some(([key, value]) => {
    const keyMatch = key.toLowerCase().includes(query);
    if (keyMatch) return true;
    if (value == null) return false;
    const valueText =
      typeof value === 'string'
        ? value.toLowerCase()
        : typeof value === 'number' || typeof value === 'boolean'
          ? String(value).toLowerCase()
          : '';
    return valueText.includes(query);
  });
}

export async function getAiUsageSummary() {
  await requireAdmin();

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [today, month] = await Promise.all([
    prisma.openAIRequestLog.aggregate({
      _sum: { estimatedCostUsd: true },
      _count: { _all: true },
      where: { createdAt: { gte: startOfToday } },
    }),
    prisma.openAIRequestLog.aggregate({
      _sum: { estimatedCostUsd: true },
      _count: { _all: true },
      where: { createdAt: { gte: startOfMonth } },
    }),
  ]);

  return { today, month };
}

export async function getProviderBreakdownThisMonth(): Promise<AiUsageProviderBreakdownRow[]> {
  await requireAdmin();

  const asOf = new Date();
  const startOfMonth = new Date(asOf.getFullYear(), asOf.getMonth(), 1);

  const rows = await prisma.openAIRequestLog.findMany({
    where: { createdAt: { gte: startOfMonth } },
    select: {
      createdAt: true,
      status: true,
      estimatedCostUsd: true,
      durationMs: true,
      tags: true,
    },
  });

  const map = new Map<string, AiUsageProviderBreakdownRow>();
  for (const row of rows) {
    const tags = row.tags as Record<string, unknown> | null;
    const { provider: providerRaw, apiPath: apiPathRaw } = resolveAiUsageProviderForDisplay(
      row.createdAt,
      tags,
      asOf
    );
    const key = `${providerRaw}::${apiPathRaw}`;
    const existing = map.get(key) ?? {
      provider: providerRaw,
      apiPath: apiPathRaw,
      requests: 0,
      success: 0,
      errors: 0,
      totalCostUsd: 0,
      avgDurationMs: 0,
    };
    existing.requests += 1;
    if (row.status === 'success') {
      existing.success += 1;
    } else {
      existing.errors += 1;
    }
    existing.totalCostUsd += Number(row.estimatedCostUsd ?? 0);
    existing.avgDurationMs += Number(row.durationMs ?? 0);
    map.set(key, existing);
  }

  return Array.from(map.values())
    .map((row) => ({
      ...row,
      avgDurationMs: row.requests > 0 ? Math.round(row.avgDurationMs / row.requests) : 0,
    }))
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd);
}

export async function getWeeklyCostSeries(weeks: number = 52): Promise<WeeklyCostPoint[]> {
  await requireAdmin();

  const now = new Date();

  // Start of current week (local time, Sunday-based).
  const startOfThisWeek = new Date(now);
  startOfThisWeek.setHours(0, 0, 0, 0);
  startOfThisWeek.setDate(startOfThisWeek.getDate() - startOfThisWeek.getDay());

  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

  const weekStarts: Date[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(startOfThisWeek.getTime() - i * MS_PER_WEEK);
    weekStarts.push(d);
  }

  const firstWeekStart = weekStarts[0];

  const rows = await prisma.openAIRequestLog.findMany({
    where: {
      createdAt: {
        gte: firstWeekStart,
      },
    },
    select: {
      createdAt: true,
      estimatedCostUsd: true,
    },
  });

  const totals = new Array(weeks).fill(0) as number[];

  for (const row of rows) {
    const createdAt = row.createdAt;
    const diffMs = createdAt.getTime() - firstWeekStart.getTime();
    if (diffMs < 0) continue;
    const index = Math.floor(diffMs / MS_PER_WEEK);
    if (index < 0 || index >= weeks) continue;
    totals[index] += Number(row.estimatedCostUsd ?? 0);
  }

  return weekStarts.map((weekStart, idx) => ({
    weekStart,
    totalCost: roundUsdToCents(totals[idx]),
  }));
}

export async function getAiUsageTable(filters: AiUsageFilters) {
  await requireAdmin();

  const {
    from,
    to,
    model,
    status,
    tag,
    page = 1,
    pageSize = 200,
  } = filters;

  const where: Record<string, unknown> = {};

  if (from || to) {
    (where.createdAt as any) = {};
    if (from) {
      (where.createdAt as any).gte = from;
    }
    if (to) {
      (where.createdAt as any).lte = to;
    }
  }

  if (model) {
    where.model = model;
  }

  if (status) {
    where.status = status;
  }

  const safePageSize = Math.min(Math.max(pageSize, 1), 200);
  const safePage = Math.max(page, 1);
  const skip = (safePage - 1) * safePageSize;

  if (tag && tag.trim()) {
    const allRows = await prisma.openAIRequestLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    const filtered = allRows.filter((row) => tagRecordMatchesQuery(row.tags, tag));
    const rows = filtered.slice(skip, skip + safePageSize);
    return { rows, total: filtered.length, page: safePage, pageSize: safePageSize };
  }

  const [rows, total] = await Promise.all([
    prisma.openAIRequestLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: safePageSize,
    }),
    prisma.openAIRequestLog.count({ where }),
  ]);

  return { rows, total, page: safePage, pageSize: safePageSize };
}

export async function getTopExpensiveRequests(filters: AiUsageFilters) {
  await requireAdmin();

  const { from, to, model, status, tag } = filters;

  const where: Record<string, unknown> = {};

  if (from || to) {
    (where.createdAt as any) = {};
    if (from) {
      (where.createdAt as any).gte = from;
    }
    if (to) {
      (where.createdAt as any).lte = to;
    }
  }

  if (model) {
    where.model = model;
  }

  if (status) {
    where.status = status;
  }

  const rows = await prisma.openAIRequestLog.findMany({
    where,
    orderBy: { estimatedCostUsd: 'desc' },
  });
  const filtered = tag && tag.trim()
    ? rows.filter((row) => tagRecordMatchesQuery(row.tags, tag))
    : rows;
  return filtered.slice(0, 20);
}

export async function getUnpricedModelWarning(): Promise<{ count: number; days: number }> {
  await requireAdmin();
  const days = 30;
  const count = await countUnpricedSuccessRequests(days);
  return { count, days };
}

export async function purgeErrorLogs(_formData: FormData): Promise<void> {
  await requireAdmin();
  await prisma.openAIRequestLog.deleteMany({
    where: { status: 'error' },
  });
  revalidatePath('/admin/ai-usage');
}

