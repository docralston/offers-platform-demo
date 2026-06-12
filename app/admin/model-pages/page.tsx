import { Suspense } from 'react';
import { getModelPagesMeta } from '@/app/actions/model-pages';
import { DemoLlmKeyPanel } from '@/app/admin/components/DemoLlmKeyPanel';
import { isDemoLlmByokClient } from '@/lib/config/demo-llm';
import { ModelPagesClient } from './ModelPagesClient';

export const dynamic = 'force-dynamic';

export default async function ModelPagesPage() {
  const metaResult = await getModelPagesMeta();
  const meta = metaResult.success ? metaResult.data : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-neutral-200 pb-4 dark:border-neutral-700">
        <div>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            Model pages
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Generate, view, approve, and manage model-year page content
          </p>
        </div>
      </header>

      {isDemoLlmByokClient() ? <DemoLlmKeyPanel /> : null}

      <Suspense
        fallback={
          <p className="text-sm text-neutral-500">Loading model pages…</p>
        }
      >
        <ModelPagesClient initialMeta={meta ?? null} />
      </Suspense>
    </div>
  );
}
