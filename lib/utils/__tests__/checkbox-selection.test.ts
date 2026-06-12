import { applyCheckboxSelection } from '@/lib/utils/checkbox-selection';

describe('applyCheckboxSelection', () => {
  const displayedRowIds = ['a', 'b', 'c', 'd', 'e'];

  test('toggles one row on normal click without clearing others', () => {
    const result = applyCheckboxSelection({
      selectedIds: new Set(['a']),
      displayedRowIds,
      clickedId: 'c',
      clickedIndex: 2,
      lastSelectedIndex: 0,
      shiftKey: false,
    });

    expect(Array.from(result.nextSelectedIds).sort()).toEqual(['a', 'c']);
    expect(result.nextLastSelectedIndex).toBe(2);
  });

  test('shift-click selects contiguous range from last clicked row', () => {
    const first = applyCheckboxSelection({
      selectedIds: new Set<string>(),
      displayedRowIds,
      clickedId: 'a',
      clickedIndex: 0,
      lastSelectedIndex: null,
      shiftKey: false,
    });

    const range = applyCheckboxSelection({
      selectedIds: first.nextSelectedIds,
      displayedRowIds,
      clickedId: 'e',
      clickedIndex: 4,
      lastSelectedIndex: first.nextLastSelectedIndex,
      shiftKey: true,
    });

    expect(Array.from(range.nextSelectedIds).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(range.nextLastSelectedIndex).toBe(4);
  });

  test('shift-click deselects range when clicked row was already selected', () => {
    const result = applyCheckboxSelection({
      selectedIds: new Set(['a', 'b', 'c', 'd', 'e']),
      displayedRowIds,
      clickedId: 'e',
      clickedIndex: 4,
      lastSelectedIndex: 0,
      shiftKey: true,
    });

    expect(Array.from(result.nextSelectedIds)).toEqual([]);
  });
});
