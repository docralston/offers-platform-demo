import { requireAdmin } from '@/lib/auth';
import { EmbedWidgetShowcase } from '@/components/admin/EmbedWidgetShowcase';
import { Breadcrumbs } from '@/components/ui';
import { getEmbedWidgetCatalog } from '@/lib/embed/get-embed-catalog';

export default async function EmbedAdminPage() {
  await requireAdmin();
  const catalog = await getEmbedWidgetCatalog();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Admin', href: '/admin' },
          { label: 'Embed' },
        ]}
      />
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Embed widget</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Live previews and copy-paste snippets for the public offers widget on model pages.
        </p>
      </div>
      <EmbedWidgetShowcase catalog={catalog} />
    </div>
  );
}
