export const DEFAULT_DASHBOARD_ORDER = [
  'pipeline',
  'validation',
  'outliers',
  'assets',
  'ingestion',
  'recent',
] as const;

export type DashboardWidgetId = (typeof DEFAULT_DASHBOARD_ORDER)[number];

export type DashboardWidgetColSpan = 1 | 2 | 3;

/** Default column span per widget on lg+ (3-column grid). Marketing assets always spans full width. */
export const WIDGET_COLUMN_SPANS: Record<DashboardWidgetId, DashboardWidgetColSpan> = {
  pipeline: 1,
  validation: 1,
  outliers: 1,
  assets: 3,
  ingestion: 1,
  recent: 2,
};

export function getWidgetColSpan(id: DashboardWidgetId): DashboardWidgetColSpan {
  return WIDGET_COLUMN_SPANS[id];
}

export interface DashboardLayout {
  order: DashboardWidgetId[];
  hidden: DashboardWidgetId[];
}
