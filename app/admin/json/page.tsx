'use client';

import * as React from 'react';
import { Button } from '@/components/ui';
import { OfferSelectionSection } from '@/components/admin/OfferSelectionSection';
import { getOffersJson } from '@/app/actions/json';
import { useToast } from '@/components/ui';
import { withTransientRetries } from '@/lib/utils/transient-action-retry';

export default function JsonPage() {
  const { add: showToast } = useToast();
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [storeCode, setStoreCode] = React.useState('');
  const [jsonOutput, setJsonOutput] = React.useState('');
  const [format, setFormat] = React.useState<'full' | 'schema'>('full');
  const [generating, setGenerating] = React.useState(false);
  const [copyNotification, setCopyNotification] = React.useState(false);

  const handleGenerate = async () => {
    if (selectedIds.length === 0) {
      showToast({ message: 'Select at least one offer', tone: 'error' });
      return;
    }
    setGenerating(true);
    try {
      const result = await withTransientRetries(() =>
        getOffersJson(selectedIds, storeCode || 'TOY', format)
      );
      if (result.success) {
        setJsonOutput(result.data);
        showToast({ message: 'JSON generated' });
      } else {
        showToast({ message: result.errors?.[0]?.message ?? 'Failed', tone: 'error' });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'An unexpected response was received from the server.';
      showToast({ message, tone: 'error' });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!jsonOutput) return;
    try {
      await navigator.clipboard.writeText(jsonOutput);
      setCopyNotification(true);
      setTimeout(() => setCopyNotification(false), 3000);
      showToast({ message: 'Copied to clipboard' });
    } catch {
      showToast({ message: 'Copy failed', tone: 'error' });
    }
  };

  const handleDownload = () => {
    if (!jsonOutput) return;
    const blob = new Blob([jsonOutput], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'offers.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-4 dark:border-neutral-700">
        <div>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">JSON</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Generate JSON for selected offers (full payload or Schema.org style)
          </p>
        </div>
      </header>

      <OfferSelectionSection
        onSelectionChange={setSelectedIds}
        onFiltersApplied={({ storeCode: sc }) => setStoreCode(sc)}
        storeCodeRequired
      />

      {selectedIds.length > 0 && (
        <section className="rounded-lg border border-neutral-200 bg-surface-slate p-4 dark:border-neutral-700 dark:bg-surface-slate-dark">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-neutral-600 dark:text-neutral-400">Format:</span>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as 'full' | 'schema')}
                className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100"
              >
                <option value="full">Full offer objects</option>
                <option value="schema">Schema.org</option>
              </select>
            </label>
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? 'Generating…' : 'Generate JSON'}
            </Button>
            {jsonOutput && (
              <>
                <Button variant="secondary" size="sm" onClick={handleCopy}>
                  Copy to clipboard
                </Button>
                <Button variant="secondary" size="sm" onClick={handleDownload}>
                  Download .json
                </Button>
                {copyNotification && (
                  <span className="text-sm text-neutral-500">Copied</span>
                )}
              </>
            )}
          </div>

          {jsonOutput && (
            <div className="flex flex-col">
              <h2 className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">Output</h2>
              <pre className="max-h-[500px] overflow-auto rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100">
                {jsonOutput}
              </pre>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
