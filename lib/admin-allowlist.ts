import { isDemoMode } from '@/lib/config/demo';

function envSet(key: string, normalize = (s: string) => s): Set<string> {
  return new Set(
    (process.env[key] ?? '')
      .split(',')
      .map((s) => normalize(s.trim()))
      .filter(Boolean),
  );
}

export function isAdmin(userId: string | null, email: string | null): boolean {
  if (isDemoMode() && userId) {
    return true;
  }

  const adminUserIds = envSet('ADMIN_CLERK_USER_IDS');
  if (userId && adminUserIds.size > 0 && adminUserIds.has(userId)) {
    return true;
  }

  const adminEmails = envSet('ADMIN_EMAILS', (s) => s.toLowerCase());
  if (email && adminEmails.size > 0 && adminEmails.has(email.toLowerCase())) {
    return true;
  }

  return false;
}

