'use client';

import { useCallback, useState } from 'react';
import { previewOfferDisclaimer } from '@/app/actions/disclaimers';
import type { OfferInput } from '@/lib/domain/validation';
import { Button, FormGroup, Textarea } from '@/components/ui';

type DisclaimerSource = 'AUTO' | 'MANUAL';

interface DisclaimerSectionProps {
  defaultDisclaimer?: string | null;
  defaultSource?: DisclaimerSource;
  buildOfferInput: () => OfferInput;
}

export function DisclaimerSection({
  defaultDisclaimer = '',
  defaultSource = 'AUTO',
  buildOfferInput,
}: DisclaimerSectionProps) {
  const [source, setSource] = useState<DisclaimerSource>(defaultSource);
  const [disclaimer, setDisclaimer] = useState(defaultDisclaimer ?? '');
  const [preview, setPreview] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const runPreview = useCallback(async () => {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const result = await previewOfferDisclaimer(buildOfferInput());
      setPreview(result.textPretty);
    } catch {
      setPreviewError('Preview failed');
    } finally {
      setPreviewLoading(false);
    }
  }, [buildOfferInput]);

  async function handleRegenerate() {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const result = await previewOfferDisclaimer(buildOfferInput());
      setDisclaimer(result.textMinified);
      setPreview(result.textPretty);
      setSource('MANUAL');
    } catch {
      setPreviewError('Regenerate failed');
    } finally {
      setPreviewLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <input type="hidden" name="disclaimerSource" value={source} />
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Disclaimer mode</span>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="disclaimerSourceUi"
            checked={source === 'AUTO'}
            onChange={() => setSource('AUTO')}
          />
          Auto
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="disclaimerSourceUi"
            checked={source === 'MANUAL'}
            onChange={() => setSource('MANUAL')}
          />
          Manual
        </label>
        <Button type="button" variant="secondary" size="sm" onClick={runPreview} disabled={previewLoading}>
          {previewLoading ? 'Loading…' : 'Preview'}
        </Button>
        <Button type="button" variant="tertiary" size="sm" onClick={handleRegenerate} disabled={previewLoading}>
          Regenerate from offer data
        </Button>
      </div>
      {source === 'MANUAL' ? (
        <FormGroup label="Disclaimer" htmlFor="disclaimer">
          <Textarea
            id="disclaimer"
            name="disclaimer"
            rows={6}
            value={disclaimer}
            onChange={(e) => setDisclaimer(e.target.value)}
            placeholder="Legal disclaimer text"
          />
        </FormGroup>
      ) : (
        <>
          <input type="hidden" name="disclaimer" value={disclaimer} />
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Auto mode regenerates disclaimer from offer fields and global templates on save. Use Preview to see the
            current text; switch to Manual to edit.
          </p>
        </>
      )}
      {previewError && <p className="text-sm text-red-600 dark:text-red-400">{previewError}</p>}
      {preview && (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm whitespace-pre-wrap dark:border-neutral-700 dark:bg-neutral-800/50">
          <p className="mb-2 font-medium text-neutral-600 dark:text-neutral-400">Live preview</p>
          {preview}
        </div>
      )}
    </div>
  );
}
