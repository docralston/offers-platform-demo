'use client';

import * as React from 'react';
import { Button, FormGroup, Input } from '@/components/ui';
import { demoLlmKeyRequiredMessage } from '@/lib/config/demo-llm';
import {
  clearDemoLlmApiKey,
  getDemoLlmApiKey,
  setDemoLlmApiKey,
} from '@/lib/demo-llm/client';

export function DemoLlmKeyPanel() {
  const [value, setValue] = React.useState('');
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    const existing = getDemoLlmApiKey();
    if (existing) {
      setValue(existing);
      setSaved(true);
    }
  }, []);

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
      <p className="font-medium">Demo: bring your own LLM key</p>
      <p className="mt-1 text-amber-900/90 dark:text-amber-200/90">{demoLlmKeyRequiredMessage()}</p>
      <p className="mt-2 text-xs text-amber-800/80 dark:text-amber-300/80">
        Bulk generate on this page sends the key only to this app&apos;s API, which forwards it to
        Anthropic or OpenAI for that request. Per-row FAQ/SEO regen uses server actions and stays
        disabled on demo unless you add operator keys (not recommended).
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <FormGroup label="Anthropic or OpenAI API key" className="min-w-[280px] flex-1">
          <Input
            type="password"
            autoComplete="off"
            placeholder="sk-… or sk-ant-…"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
          />
        </FormGroup>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setDemoLlmApiKey(value);
            setSaved(true);
          }}
          disabled={value.trim().length < 20}
        >
          {saved ? 'Saved in this tab' : 'Save for session'}
        </Button>
        <Button
          type="button"
          variant="tertiary"
          onClick={() => {
            clearDemoLlmApiKey();
            setValue('');
            setSaved(false);
          }}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}
