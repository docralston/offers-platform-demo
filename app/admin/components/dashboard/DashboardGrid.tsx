'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Button } from '@/components/ui';
import { saveDashboardLayout } from '@/app/actions/dashboard-layout';
import {
  DEFAULT_DASHBOARD_ORDER,
  getWidgetColSpan,
  type DashboardLayout,
  type DashboardWidgetId,
} from '@/lib/dashboard/layout';
import { DashboardWidgetShell } from './DashboardWidgetShell';

export interface DashboardSlot {
  id: DashboardWidgetId;
  title: string;
  content: React.ReactNode;
}

interface DashboardGridProps {
  layout: DashboardLayout;
  slots: DashboardSlot[];
}

const WIDGET_TITLES: Record<DashboardWidgetId, string> = {
  pipeline: 'Offer pipeline',
  validation: 'Validation queue',
  outliers: 'Data outliers',
  assets: 'Marketing assets',
  ingestion: 'Ingestion health',
  recent: 'Recent activity',
};

export function DashboardGrid({ layout, slots }: DashboardGridProps) {
  const [order, setOrder] = useState<DashboardWidgetId[]>(layout.order);
  const [hidden, setHidden] = useState<Set<DashboardWidgetId>>(new Set(layout.hidden));
  const [collapsed, setCollapsed] = useState<Set<DashboardWidgetId>>(new Set());
  const [pending, startTransition] = useTransition();

  const slotMap = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots]);
  const visibleOrder = order.filter((id) => !hidden.has(id));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function persist(nextOrder: DashboardWidgetId[], nextHidden: Set<DashboardWidgetId>) {
    startTransition(async () => {
      await saveDashboardLayout(nextOrder, Array.from(nextHidden));
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = visibleOrder.indexOf(active.id as DashboardWidgetId);
    const newIndex = visibleOrder.indexOf(over.id as DashboardWidgetId);
    if (oldIndex < 0 || newIndex < 0) return;
    const nextVisible = arrayMove(visibleOrder, oldIndex, newIndex);
    const hiddenIds = order.filter((id) => hidden.has(id));
    const nextOrder = [...nextVisible, ...hiddenIds];
    setOrder(nextOrder);
    persist(nextOrder, hidden);
  }

  function resetLayout() {
    const next = [...DEFAULT_DASHBOARD_ORDER];
    setOrder(next);
    setHidden(new Set());
    persist(next, new Set());
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="tertiary" size="sm" onClick={resetLayout} disabled={pending}>
          Reset layout
        </Button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visibleOrder} strategy={verticalListSortingStrategy}>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {visibleOrder.map((id) => {
              const slot = slotMap.get(id);
              if (!slot) return null;
              const title = slot.title || WIDGET_TITLES[id];
              return (
                <DashboardWidgetShell
                  key={id}
                  id={id}
                  title={title}
                  colSpan={getWidgetColSpan(id)}
                  collapsed={collapsed.has(id)}
                  onToggleCollapse={() =>
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    })
                  }
                >
                  {slot.content}
                </DashboardWidgetShell>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
