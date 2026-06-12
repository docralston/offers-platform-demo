import { cache } from 'react';
import { auth, currentUser } from '@clerk/nextjs/server';
import { headers } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { isAdmin } from './admin-allowlist';

/**
 * Auth adapter layer - isolates all Clerk calls
 * This allows swapping auth providers later without changing business logic
 */

/**
 * Gets the current user ID from Clerk.
 * Wrapped in React cache() to deduplicate within the same request (avoids Clerk API rate limits).
 * @returns Generic string user ID or null if not authenticated
 */
export const getCurrentUserId = cache(async (): Promise<string | null> => {
  const { userId } = await auth();
  return userId;
});

/**
 * Requires authentication and returns user ID
 * Throws/redirects if not authenticated
 * @returns Generic string user ID
 */
export async function requireUserId(): Promise<string> {
  const userId = await getCurrentUserId();
  if (!userId) {
    if (await isServerActionRequest()) {
      throw new Error('AUTH_REQUIRED');
    }
    redirect('/sign-in');
  }
  return userId;
}

/**
 * Gets the current user's email for display purposes
 * @returns Email string or null
 */
export async function getCurrentUserEmail(): Promise<string | null> {
  try {
    const user = await currentUser();
    return user?.emailAddresses?.[0]?.emailAddress || null;
  } catch {
    return null;
  }
}

export async function isAdminUser(): Promise<boolean> {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return false;
  }

  let email: string | null =
    ((sessionClaims as { email?: string } | null)?.email as string | undefined) ??
    null;

  if (!email) {
    try {
      const user = await currentUser();
      email = user?.emailAddresses?.[0]?.emailAddress ?? null;
    } catch {
      email = null;
    }
  }

  return isAdmin(userId, email);
}

export async function requireAdmin(): Promise<string> {
  const { userId, sessionClaims } = await auth();

  if (!userId) {
    if (await isServerActionRequest()) {
      throw new Error('AUTH_REQUIRED');
    }
    redirect('/sign-in');
  }

  let email: string | null =
    ((sessionClaims as { email?: string } | null)?.email as string | undefined) ??
    null;

  if (!email) {
    try {
      const user = await currentUser();
      email = user?.emailAddresses?.[0]?.emailAddress ?? null;
    } catch {
      email = null;
    }
  }

  if (!isAdmin(userId!, email)) {
    if (await isServerActionRequest()) {
      throw new Error('FORBIDDEN');
    }
    notFound();
  }

  return userId!;
}

async function isServerActionRequest(): Promise<boolean> {
  try {
    const h = await headers();
    return h.has('next-action');
  } catch {
    return false;
  }
}

