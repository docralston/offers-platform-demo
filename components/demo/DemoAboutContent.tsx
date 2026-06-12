export function DemoAboutContent() {
  return (
    <div className="space-y-4 text-sm text-neutral-600 dark:text-neutral-300">
      <p>
        This deployment is a read-only showcase with fictional dealerships (Toyota of Demotown, BMW
        of Demotown, Lexus of Demotown, Lexus of Exampleville). It is not connected to real dealer
        systems, ingestion pipelines, or production inventory.
      </p>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          Admin UI: sign in with access code <code className="text-xs">demo</code> (no email
          required).
        </li>
        <li>
          OEM ingestion scrapers are disabled. Spreadsheet import, offers, disclaimers, images, and
          embed widget work normally.
        </li>
        <li>
          Model page bulk generation uses your own LLM API key—nothing is billed through this
          environment.
        </li>
        <li>
          Only offer records in the database reset daily at 2:00 AM US Eastern (visitor offer
          edits are cleared). The demo app, configs, and other features are not affected.
        </li>
      </ul>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Demonstration environment · Sample data · Not for commercial use
      </p>
    </div>
  );
}

export function DemoAboutActions({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-wrap justify-end gap-3 pt-2">
      <button
        type="button"
        onClick={onClose}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
      >
        Close
      </button>
    </div>
  );
}
