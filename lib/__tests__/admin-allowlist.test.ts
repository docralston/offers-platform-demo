import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAdmin } from '@/lib/admin-allowlist';

describe('isAdmin', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows any signed-in user when DEMO_MODE=true', () => {
    vi.stubEnv('DEMO_MODE', 'true');
    expect(isAdmin('user_abc', 'stranger@example.com')).toBe(true);
  });

  it('denies when not in allowlist and DEMO_MODE is off', () => {
    vi.stubEnv('DEMO_MODE', 'false');
    vi.stubEnv('ADMIN_EMAILS', 'operator@example.com');
    expect(isAdmin('user_abc', 'stranger@example.com')).toBe(false);
    expect(isAdmin('user_abc', 'operator@example.com')).toBe(true);
  });

  it('denies everyone when allowlists are empty and DEMO_MODE is off', () => {
    vi.stubEnv('DEMO_MODE', 'false');
    vi.stubEnv('ADMIN_EMAILS', '');
    vi.stubEnv('ADMIN_CLERK_USER_IDS', '');
    expect(isAdmin('user_abc', 'anyone@example.com')).toBe(false);
  });
});
