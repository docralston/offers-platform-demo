import { requireAdmin } from '@/lib/auth';
import { getDisclaimerTemplates } from '@/app/actions/disclaimers';
import { DisclaimerTemplatesEditor } from './DisclaimerTemplatesEditor';
import { Breadcrumbs } from '@/components/ui';

export default async function DisclaimersAdminPage() {
  await requireAdmin();
  const templates = await getDisclaimerTemplates();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Admin', href: '/admin' },
          { label: 'Disclaimers' },
        ]}
      />
      <div>
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Disclaimer templates</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Global intro/outro and per-store overrides. Placeholders: {'{lender}'}, {'{salesperson}'}, {'{endDate}'},
          {'{docFee}'}, {'{vehicle}'}, {'{leasePayment}'}, {'{leaseTerm}'}, {'{leaseMiles}'}, {'{grossCapCost}'},
          {'{netCapCost}'}, {'{capCostReduction}'}, {'{securityDeposit}'}, {'{perExcessMile}'}, {'{acquisitionFee}'}, etc.
        </p>
      </div>
      <DisclaimerTemplatesEditor initialConfig={templates} />
    </div>
  );
}
