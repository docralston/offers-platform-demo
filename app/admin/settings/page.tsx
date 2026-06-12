import { Button, FormGroup, Input, Select } from '@/components/ui';
import { STORE_CODES } from '@/lib/config/stores';
import { getStoreDisplayId } from '@/lib/config/store-display';
import { getSettings, updateSettings } from '@/app/actions/settings';

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <div className="max-w-2xl space-y-8">
      <header className="border-b border-neutral-200 pb-4 dark:border-neutral-700">
        <h1 className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
          Settings
        </h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Configure platform defaults and preferences.
        </p>
      </header>

      <form className="space-y-8" action={updateSettings}>
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Features
          </h2>
          <div className="mt-4 space-y-4 rounded-lg border border-neutral-200 bg-surface-amber/70 px-4 py-4 dark:border-neutral-700 dark:bg-surface-amber-dark/60">
            <FormGroup
              label="Allow bulk delete"
              htmlFor="allowBulkDelete"
              hint="When enabled, a bulk DELETE button appears on the Offers list when multiple offers are selected."
            >
              <input type="hidden" name="allowBulkDelete" value="false" />
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  id="allowBulkDelete"
                  name="allowBulkDelete"
                  type="checkbox"
                  value="true"
                  defaultChecked={settings.allowBulkDelete}
                  className="h-4 w-4 rounded border-neutral-300 text-accent-600 focus:ring-accent-500 dark:border-neutral-600 dark:bg-neutral-800"
                />
                <span className="text-sm text-neutral-700 dark:text-neutral-300">
                  Show bulk delete on Offers
                </span>
              </label>
            </FormGroup>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Defaults
          </h2>
          <div className="mt-4 space-y-4 rounded-lg border border-neutral-200 bg-surface-amber/70 px-4 py-4 dark:border-neutral-700 dark:bg-surface-amber-dark/60">
            <FormGroup
              label="Default store"
              htmlFor="defaultStore"
              hint="Pre-select this store when creating new offers."
            >
              <Select id="defaultStore" name="defaultStore">
                <option value="">None</option>
{STORE_CODES.map((c) => (
                <option key={c} value={c}>{getStoreDisplayId(c)}</option>
              ))}
              </Select>
            </FormGroup>
            <FormGroup
              label="Date format"
              htmlFor="dateFormat"
              hint="How dates are shown in lists and details."
            >
              <Select id="dateFormat" name="dateFormat">
                <option value="locale">Locale default</option>
                <option value="mdy">MM/DD/YYYY</option>
                <option value="dmy">DD/MM/YYYY</option>
                <option value="ymd">YYYY-MM-DD</option>
              </Select>
            </FormGroup>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Notifications
          </h2>
          <div className="mt-4 space-y-4 rounded-lg border border-neutral-200 bg-surface-amber/70 px-4 py-4 dark:border-neutral-700 dark:bg-surface-amber-dark/60">
            <FormGroup
              label="Expiring soon (days)"
              htmlFor="expiringDays"
              hint="Get a reminder when offers end within this many days."
            >
              <Input
                id="expiringDays"
                name="expiringDays"
                type="number"
                min={0}
                max={90}
                defaultValue={7}
              />
            </FormGroup>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Offer API (Non-working Placeholder)
          </h2>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Let external systems pull offer data. Create an API key to authenticate requests.
          </p>
          <div className="mt-4 space-y-4 rounded-lg border border-neutral-200 bg-surface-slate px-4 py-4 dark:border-neutral-700 dark:bg-surface-slate-dark">
            <FormGroup
              label="API key"
              htmlFor="apiKey"
              hint="Use this key in the Authorization header when calling the offers API. Keep it secret."
            >
              <div className="flex gap-2">
                <Input
                  id="apiKey"
                  readOnly
                  value="sk_••••••••••••••••••••••••••••••••abcd"
                  className="font-mono text-sm"
                  aria-describedby="apiKey-hint"
                />
                <Button type="button" variant="secondary" size="md">
                  Copy
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                <Button type="button" variant="tertiary" size="sm">
                  Regenerate key
                </Button>
                <a
                  href="#"
                  className="text-sm text-accent-600 hover:text-accent-500 dark:text-accent-400 dark:hover:text-accent-300"
                >
                  View API documentation
                </a>
              </div>
            </FormGroup>
          </div>
        </section>

        <div className="flex justify-end border-t border-neutral-200 pt-4 dark:border-neutral-700">
          <Button type="submit" variant="primary">
            Save changes
          </Button>
        </div>
      </form>
    </div>
  );
}
