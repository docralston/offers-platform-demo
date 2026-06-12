export interface ApplyCheckboxSelectionArgs {
  selectedIds: ReadonlySet<string>;
  displayedRowIds: string[];
  clickedId: string;
  clickedIndex: number;
  lastSelectedIndex: number | null;
  shiftKey: boolean;
}

export interface ApplyCheckboxSelectionResult {
  nextSelectedIds: Set<string>;
  nextLastSelectedIndex: number;
}

/**
 * Shared row-checkbox behavior:
 * - regular click toggles one row while preserving other selections
 * - shift-click toggles the contiguous visible range from the last clicked row
 */
export function applyCheckboxSelection({
  selectedIds,
  displayedRowIds,
  clickedId,
  clickedIndex,
  lastSelectedIndex,
  shiftKey,
}: ApplyCheckboxSelectionArgs): ApplyCheckboxSelectionResult {
  const next = new Set(selectedIds);

  if (shiftKey && lastSelectedIndex != null) {
    const start = Math.min(lastSelectedIndex, clickedIndex);
    const end = Math.max(lastSelectedIndex, clickedIndex);
    const rangeIds = displayedRowIds.slice(start, end + 1);
    const clickedWasSelected = selectedIds.has(clickedId);

    for (const id of rangeIds) {
      if (clickedWasSelected) next.delete(id);
      else next.add(id);
    }

    return {
      nextSelectedIds: next,
      nextLastSelectedIndex: clickedIndex,
    };
  }

  if (next.has(clickedId)) next.delete(clickedId);
  else next.add(clickedId);

  return {
    nextSelectedIds: next,
    nextLastSelectedIndex: clickedIndex,
  };
}
