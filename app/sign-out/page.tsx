'use client';

import { useClerk } from '@clerk/nextjs';
import { useEffect } from 'react';

/**
 * Visit /sign-out to sign out and redirect to the sign-in page.
 * Useful when the UserButton is unavailable or you need to force a fresh session.
 */
export default function SignOutPage() {
  const { signOut } = useClerk();

  useEffect(() => {
    signOut({ redirectUrl: '/sign-in' });
  }, [signOut]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-950">
      <p className="text-neutral-500 dark:text-neutral-400">Signing out…</p>
    </div>
  );
}
