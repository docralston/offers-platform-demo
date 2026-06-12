'use client';

import { useState } from 'react';
import {
  previewDisclaimerFromTemplates,
  saveDisclaimerTemplates,
} from '@/app/actions/disclaimers';
import type { DisclaimerTemplateParts, DisclaimerTemplatesConfig } from '@/lib/disclaimers/template-resolver';
import { CODE_FALLBACK_TEMPLATES } from '@/lib/disclaimers/template-resolver';
import { STORE_CODES } from '@/lib/config/stores';
import { getStoreDisplayId } from '@/lib/config/store-display';
import { Alert, Button, FormGroup, Select, Textarea } from '@/components/ui';

const FIELDS: Array<{ key: keyof DisclaimerTemplateParts; label: string; rows: number }> = [
  { key: 'intro', label: 'Intro', rows: 3 },
  { key: 'leaseParagraph', label: 'Lease paragraph (optional override per offer)', rows: 4 },
  { key: 'financeParagraph', label: 'Finance paragraph (optional)', rows: 3 },
  { key: 'outro', label: 'Outro', rows: 4 },
];

interface Props {
  initialConfig: DisclaimerTemplatesConfig;
}

export function DisclaimerTemplatesEditor({ initialConfig }: Props) {
  const [config, setConfig] = useState<DisclaimerTemplatesConfig>(initialConfig);
  const [storeCode, setStoreCode] = useState<string>('default');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const activeParts: DisclaimerTemplateParts =
    storeCode === 'default'
      ? config.default
      : { ...config.default, ...(config.byStore?.[storeCode] ?? {}) };

  function updateField(key: keyof DisclaimerTemplateParts, value: string) {
    if (storeCode === 'default') {
      setConfig((c) => ({ ...c, default: { ...c.default, [key]: value } }));
      return;
    }
    setConfig((c) => ({
      ...c,
      byStore: {
        ...c.byStore,
        [storeCode]: { ...(c.byStore?.[storeCode] ?? {}), [key]: value },
      },
    }));
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    const result = await saveDisclaimerTemplates(config);
    setSaving(false);
    setMessage(result.success ? 'Saved.' : result.error ?? 'Save failed');
  }

  async function handlePreview() {
    const sc = storeCode === 'default' ? 'TOY' : storeCode;
    const parts =
      storeCode === 'default'
        ? config.default
        : { ...config.default, ...(config.byStore?.[storeCode] ?? {}) };
    const result = await previewDisclaimerFromTemplates(sc, parts);
    setPreview(result.textPretty);
  }

  function handleReset() {
    setConfig(CODE_FALLBACK_TEMPLATES);
    setPreview(null);
    setMessage(null);
  }

  return (
    <div className="space-y-6">
      {message && <Alert tone={message === 'Saved.' ? 'success' : 'error'}>{message}</Alert>}
      <FormGroup label="Edit templates for" htmlFor="storeSelect">
        <Select
          id="storeSelect"
          value={storeCode}
          onChange={(e) => {
            setStoreCode(e.target.value);
            setPreview(null);
          }}
        >
          <option value="default">Default (all stores)</option>
          {STORE_CODES.map((code) => (
            <option key={code} value={code}>
              {getStoreDisplayId(code)} override
            </option>
          ))}
        </Select>
      </FormGroup>
      {FIELDS.map(({ key, label, rows }) => (
        <FormGroup key={key} label={label} htmlFor={key}>
          <Textarea
            id={key}
            rows={rows}
            value={activeParts[key] ?? ''}
            onChange={(e) => updateField(key, e.target.value)}
            placeholder={CODE_FALLBACK_TEMPLATES.default[key] ?? ''}
          />
        </FormGroup>
      ))}
      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save templates'}
        </Button>
        <Button type="button" variant="secondary" onClick={handlePreview}>
          Preview sample offer
        </Button>
        <Button type="button" variant="tertiary" onClick={handleReset}>
          Reset to code defaults
        </Button>
      </div>
      {preview && (
        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-4 text-sm whitespace-pre-wrap dark:border-neutral-700 dark:bg-neutral-800/50">
          <p className="mb-2 font-medium text-neutral-600 dark:text-neutral-400">Composite preview</p>
          {preview}
        </div>
      )}
    </div>
  );
}
