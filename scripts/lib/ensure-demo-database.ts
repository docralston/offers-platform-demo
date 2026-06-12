/**
 * Guardrails so demo seed/reset never run against production PostgreSQL.
 */
const DEMO_DB_MARKERS = ['bgotlyrsjxzjjigymuqz'];

export function isDemoDatabaseUrl(connectionString: string | undefined): boolean {
  if (!connectionString?.trim()) return false;
  return DEMO_DB_MARKERS.some((marker) => connectionString.includes(marker));
}

export function requireDemoDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error('DATABASE_URL is not set.');
  }
  if (!isDemoDatabaseUrl(url)) {
    throw new Error(
      'Refusing to run demo seed/reset: DATABASE_URL is not the demo Supabase project. ' +
        'Set DEMO_DATABASE_URL in .env.local (scripts copy it to DATABASE_URL automatically).',
    );
  }
  return url;
}

/** Point Prisma at the demo DB only. */
export function useDemoDatabaseFromEnv(): void {
  const demoDatabaseUrl = process.env.DEMO_DATABASE_URL?.trim();
  if (!demoDatabaseUrl) {
    throw new Error('Missing DEMO_DATABASE_URL in .env.local');
  }
  if (!isDemoDatabaseUrl(demoDatabaseUrl)) {
    throw new Error('DEMO_DATABASE_URL does not look like the demo Supabase project.');
  }
  process.env.DATABASE_URL = demoDatabaseUrl;
  if (process.env.DEMO_DIRECT_URL?.trim()) {
    process.env.DIRECT_URL = process.env.DEMO_DIRECT_URL.trim();
  }
  requireDemoDatabaseUrl();
}
