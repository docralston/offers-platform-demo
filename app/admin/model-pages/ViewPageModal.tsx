'use client';

import * as React from 'react';
import { Button, Modal, ConfirmModal, Textarea } from '@/components/ui';
import {
  getPageContent,
  savePage,
  approvePage,
  regenerateFaqs,
} from '@/app/actions/model-pages';
import type { ModelYearPage } from './types';

interface ViewPageModalProps {
  open: boolean;
  onClose: () => void;
  brand: string;
  year: number;
  storeKey: string | null;
  slug: string;
  onSaved?: () => void;
  onApproved?: () => void;
}

type Tab = 'structured' | 'raw';

export function ViewPageModal({
  open,
  onClose,
  brand,
  year,
  storeKey,
  slug,
  onSaved,
  onApproved,
}: ViewPageModalProps) {
  const [page, setPage] = React.useState<ModelYearPage | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<Tab>('structured');
  const [editing, setEditing] = React.useState(false);
  const [editJson, setEditJson] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [saveErrors, setSaveErrors] = React.useState<string[]>([]);
  const [approveConfirm, setApproveConfirm] = React.useState(false);
  const [regeneratingFaqs, setRegeneratingFaqs] = React.useState(false);
  const [faqConfirm, setFaqConfirm] = React.useState(false);
  const [faqError, setFaqError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !slug || !brand || !year) {
      setPage(null);
      setError(null);
      setEditing(false);
      setTab('structured');
      return;
    }
    setLoading(true);
    setError(null);
    getPageContent(brand, year, storeKey, slug)
      .then((r) => {
        setLoading(false);
        if (r.success && r.data) {
          setPage(r.data);
          setEditJson(JSON.stringify(r.data, null, 2));
        } else {
          setPage(null);
          setError(r.errors?.[0]?.message ?? 'Failed to load page');
        }
      })
      .catch((e) => {
        setLoading(false);
        setPage(null);
        setError((e as Error).message);
      });
  }, [open, slug, brand, year, storeKey]);

  const handleSave = async () => {
    if (!page) return;
    setSaving(true);
    setSaveErrors([]);
    let parsed: ModelYearPage;
    try {
      parsed = JSON.parse(editJson) as ModelYearPage;
    } catch (e) {
      setSaveErrors(['Invalid JSON']);
      setSaving(false);
      return;
    }
    const r = await savePage(brand, year, storeKey, slug, parsed);
    setSaving(false);
    if (r.success) {
      setPage(parsed);
      setEditing(false);
      onSaved?.();
    } else {
      setSaveErrors(r.errors?.map((e) => e.message) ?? ['Save failed']);
    }
  };

  const handleApprove = async () => {
    const r = await approvePage(brand, year, storeKey, slug);
    setApproveConfirm(false);
    if (r.success) {
      onApproved?.();
      onClose();
    }
  };

  const handleRegenerateFaqs = async () => {
    if (!slug || !brand || !year) return;
    setFaqConfirm(false);
    setRegeneratingFaqs(true);
    setFaqError(null);
    try {
      const r = await regenerateFaqs(brand, year, storeKey, slug);
      if (r.success && r.data) {
        setPage(r.data);
        setEditJson(JSON.stringify(r.data, null, 2));
      } else {
        setFaqError(r.errors?.[0]?.message ?? 'Failed to regenerate FAQs');
      }
    } catch (e) {
      setFaqError((e as Error).message);
    } finally {
      setRegeneratingFaqs(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={page ? `${page.model} (${slug})` : 'View page'}
        size="lg"
        actions={
          page && !editing ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setFaqConfirm(true)}
                disabled={regeneratingFaqs}
              >
                {regeneratingFaqs ? 'Regenerating FAQs…' : 'Regenerate FAQs'}
              </Button>
              <Button variant="tertiary" size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setApproveConfirm(true)}>
                Approve
              </Button>
              <Button variant="secondary" size="sm" onClick={onClose}>
                Close
              </Button>
            </div>
          ) : editing ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          )
        }
      >
        {loading && <p className="text-sm text-neutral-500">Loading…</p>}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {faqError && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{faqError}</p>
        )}
        {page && !loading && (
          <>
            {!editing ? (
              <>
                <div className="mb-4 flex gap-2 border-b border-neutral-200 dark:border-neutral-700">
                  <button
                    type="button"
                    onClick={() => setTab('structured')}
                    className={`-mb-px border-b-2 px-2 py-1.5 text-sm font-medium ${
                      tab === 'structured'
                        ? 'border-accent-600 text-neutral-900 dark:border-accent-500 dark:text-neutral-100'
                        : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400'
                    }`}
                  >
                    Structured
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('raw')}
                    className={`-mb-px border-b-2 px-2 py-1.5 text-sm font-medium ${
                      tab === 'raw'
                        ? 'border-accent-600 text-neutral-900 dark:border-accent-500 dark:text-neutral-100'
                        : 'border-transparent text-neutral-500 hover:text-neutral-700 dark:text-neutral-400'
                    }`}
                  >
                    Raw JSON
                  </button>
                </div>
                {tab === 'structured' && (
                  <div className="max-h-96 overflow-y-auto rounded border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-600 dark:bg-neutral-800">
                    <div className="space-y-4 text-sm">
                      <section>
                        <h3 className="font-medium text-neutral-700 dark:text-neutral-300">SEO</h3>
                        <p className="mt-1 text-neutral-600 dark:text-neutral-400">
                          <strong>Title:</strong> {page.seo?.title}
                        </p>
                        <p className="mt-0.5 text-neutral-600 dark:text-neutral-400">
                          <strong>Meta:</strong> {page.seo?.metaDescription}
                        </p>
                      </section>
                      <section>
                        <h3 className="font-medium text-neutral-700 dark:text-neutral-300">Hero</h3>
                        <p className="mt-1 text-neutral-600 dark:text-neutral-400">{page.heroSubhead}</p>
                      </section>
                      <section>
                        <h3 className="font-medium text-neutral-700 dark:text-neutral-300">Why bullets</h3>
                        <ul className="mt-1 list-disc pl-5 text-neutral-600 dark:text-neutral-400">
                          {page.whyBullets?.map((b, i) => (
                            <li key={i}>{b}</li>
                          ))}
                        </ul>
                      </section>
                      <section>
                        <h3 className="font-medium text-neutral-700 dark:text-neutral-300">Trims</h3>
                        <p className="mt-1 text-neutral-600 dark:text-neutral-400">{page.trims?.intro}</p>
                        {page.trims?.sections?.map((s, i) => (
                          <div key={i} className="mt-2">
                            <p className="font-medium">{s.title}</p>
                            <ul className="list-disc pl-5">
                              {s.items?.map((item, j) => (
                                <li key={j}>
                                  {item.label}
                                  {item.note ? `: ${item.note}` : ''}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </section>
                      <section>
                        <h3 className="font-medium text-neutral-700 dark:text-neutral-300">Local SEO summary</h3>
                        <p className="mt-1 text-neutral-600 dark:text-neutral-400">
                          {page.localSeoSummary ?? '—'}
                        </p>
                      </section>
                      <section>
                        <h3 className="font-medium text-neutral-700 dark:text-neutral-300">Long-form sections</h3>
                        {page.contentSections && page.contentSections.length > 0 ? (
                          <div className="mt-1 space-y-2">
                            {page.contentSections.map((sec, i) => (
                              <div
                                key={sec.id ?? i}
                                className="rounded border border-neutral-200 bg-white p-2 dark:border-neutral-600 dark:bg-neutral-900"
                              >
                                <p className="font-medium text-neutral-800 dark:text-neutral-100">
                                  {sec.title}
                                  {sec.intent ? (
                                    <span className="ml-2 text-xs font-normal text-neutral-500 dark:text-neutral-400">
                                      ({sec.intent})
                                    </span>
                                  ) : null}
                                </p>
                                <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                                  {(sec.bodyHtml ?? '').length > 200
                                    ? `${sec.bodyHtml.slice(0, 200)}…`
                                    : sec.bodyHtml ?? ''}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-1 text-neutral-600 dark:text-neutral-400">No sections</p>
                        )}
                      </section>
                      <section>
                        <h3 className="font-medium text-neutral-700 dark:text-neutral-300">FAQs</h3>
                        <dl className="mt-1 space-y-2 text-neutral-600 dark:text-neutral-400">
                          {page.faqs?.map((faq, i) => (
                            <React.Fragment key={i}>
                              <dt className="font-medium">{faq.q}</dt>
                              <dd className="ml-0 pl-4">{faq.a}</dd>
                            </React.Fragment>
                          ))}
                        </dl>
                      </section>
                    </div>
                  </div>
                )}
                {tab === 'raw' && (
                  <pre className="max-h-96 overflow-auto rounded border border-neutral-200 bg-neutral-50 p-3 text-xs dark:border-neutral-600 dark:bg-neutral-800">
                    {JSON.stringify(page, null, 2)}
                  </pre>
                )}
              </>
            ) : (
              <div>
                {saveErrors.length > 0 && (
                  <ul className="mb-2 list-disc pl-5 text-sm text-red-600 dark:text-red-400">
                    {saveErrors.map((msg, i) => (
                      <li key={i}>{msg}</li>
                    ))}
                  </ul>
                )}
                <Textarea
                  value={editJson}
                  onChange={(e) => setEditJson(e.target.value)}
                  rows={20}
                  className="font-mono text-sm"
                />
              </div>
            )}
          </>
        )}
      </Modal>

      <ConfirmModal
        open={approveConfirm}
        onClose={() => setApproveConfirm(false)}
        onConfirm={handleApprove}
        title="Approve page"
        body="Copy this page to approved examples? This will overwrite any existing approved example with the same slug."
        confirmLabel="Approve"
      />
      <ConfirmModal
        open={faqConfirm}
        onClose={() => setFaqConfirm(false)}
        onConfirm={handleRegenerateFaqs}
        title="Regenerate FAQs"
        body="Regenerate the FAQs for this page using the latest LLM prompt? This will replace the existing FAQs (except the maintenance FAQ) but leave the rest of the page unchanged."
        confirmLabel="Regenerate FAQs"
      />
    </>
  );
}
