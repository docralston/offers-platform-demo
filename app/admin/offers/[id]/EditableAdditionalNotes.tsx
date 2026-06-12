'use client';

import { useState } from 'react';
import { Textarea } from '@/components/ui';
import { updateOfferAdditionalNotes } from '@/app/actions/offers';

interface EditableAdditionalNotesProps {
  offerId: string;
  initialValue: string | null;
}

export function EditableAdditionalNotes({ offerId, initialValue }: EditableAdditionalNotesProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(initialValue ?? '');
  const [savedValue, setSavedValue] = useState(initialValue ?? '');
  const [saving, setSaving] = useState(false);

  const isEmpty = !savedValue || savedValue.trim() === '';

  const handleSave = async () => {
    setIsEditing(false);
    const trimmed = value.trim() || null;
    if (trimmed === (savedValue?.trim() || null)) return;
    setSaving(true);
    const result = await updateOfferAdditionalNotes(offerId, trimmed ?? null);
    setSaving(false);
    if (result.success) {
      setSavedValue(trimmed ?? '');
    }
  };

  const handleCancel = () => {
    setValue(savedValue ?? '');
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
  };

  if (isEditing) {
    return (
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        rows={4}
        className="min-w-0 text-sm"
        autoFocus
        placeholder="Optional notes…"
        disabled={saving}
      />
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        setValue(savedValue ?? '');
        setIsEditing(true);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setValue(savedValue ?? '');
          setIsEditing(true);
        }
      }}
      className="cursor-pointer rounded px-2 py-1.5 text-sm text-neutral-900 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 min-h-[2.5rem] whitespace-pre-wrap"
      title="Click to edit"
    >
      {isEmpty ? (
        <span className="text-neutral-400 dark:text-neutral-500 italic">—</span>
      ) : (
        savedValue
      )}
    </div>
  );
}
