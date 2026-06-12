'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';

const ALLOW_BULK_DELETE_COOKIE = 'allowBulkDelete';

export interface Settings {
  allowBulkDelete: boolean;
}

export async function getSettings(): Promise<Settings> {
  const store = await cookies();
  const value = store.get(ALLOW_BULK_DELETE_COOKIE)?.value;
  // Default to true when cookie is missing so the DELETE button is visible until user disables it in Settings
  return {
    allowBulkDelete: value !== 'false',
  };
}

export async function updateSettings(formData: FormData): Promise<void> {
  await requireAdmin();
  const store = await cookies();
  // Checkbox sends "true" when checked; hidden sends "false". When both sent, last wins.
  const values = formData.getAll(ALLOW_BULK_DELETE_COOKIE);
  const allowBulkDelete = values.length > 0 && values[values.length - 1] === 'true';
  store.set(ALLOW_BULK_DELETE_COOKIE, String(allowBulkDelete), {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: 'lax',
    httpOnly: false, // so client can read if needed; server is source of truth for bulk actions
  });
  revalidatePath('/admin/settings');
  revalidatePath('/admin/offers');
}
