'use client';

import { useAuth, useSignIn } from '@clerk/nextjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AboutThisDemoLink } from '@/components/demo/DemoAboutProvider';

function resolveRedirect(searchParams: URLSearchParams): string {
  const raw = searchParams.get('redirect_url');
  if (!raw) return '/admin';
  if (raw.startsWith('/')) return raw;
  try {
    const parsed = new URL(raw);
    if (parsed.origin === window.location.origin) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // ignore malformed redirect_url
  }
  return '/admin';
}

async function activateTicketSession(
  ticket: string,
  signIn: NonNullable<ReturnType<typeof useSignIn>['signIn']>,
  setActive: NonNullable<ReturnType<typeof useSignIn>['setActive']>,
) {
  const attempt = await signIn.create({
    strategy: 'ticket',
    ticket,
  });

  if (attempt.status !== 'complete' || !attempt.createdSessionId) {
    throw new Error('Sign-in incomplete');
  }

  await setActive({ session: attempt.createdSessionId });
}

export function DemoSignIn() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { isLoaded: signInLoaded, signIn, setActive } = useSignIn();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ticketPending, setTicketPending] = useState(false);
  const consumedTicketRef = useRef<string | null>(null);

  const clerkReady = authLoaded && signInLoaded && !!signIn && !!setActive;

  useEffect(() => {
    if (!authLoaded || !isSignedIn) return;
    router.replace(resolveRedirect(searchParams));
  }, [authLoaded, isSignedIn, router, searchParams]);

  useEffect(() => {
    const ticket = searchParams.get('__clerk_ticket');
    if (!ticket || !clerkReady || isSignedIn) return;
    if (consumedTicketRef.current === ticket) return;

    consumedTicketRef.current = ticket;
    let cancelled = false;
    setTicketPending(true);
    setError(null);
    setLoading(true);

    void (async () => {
      try {
        await activateTicketSession(ticket, signIn, setActive);
        if (cancelled) return;
        router.replace(resolveRedirect(searchParams));
        router.refresh();
      } catch {
        if (!cancelled) {
          setError('Sign-in failed. Enter the access code and try again.');
          setLoading(false);
          setTicketPending(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clerkReady, isSignedIn, router, searchParams, signIn, setActive]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!clerkReady) return;

    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/demo/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json().catch(() => ({}))) as { ticket?: string; error?: string };

      if (!res.ok || !data.ticket) {
        setError(data.error ?? 'Sign-in failed. Try again.');
        return;
      }

      await activateTicketSession(data.ticket, signIn, setActive);
      router.push(resolveRedirect(searchParams));
      router.refresh();
    } catch {
      setError('Sign-in failed. Try again.');
    } finally {
      setLoading(false);
    }
  }

  if (ticketPending && !error) {
    return (
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <p className="text-sm text-neutral-600 dark:text-neutral-300">Signing you in…</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-sm font-medium uppercase tracking-wider text-neutral-500">Portfolio demo</p>
      <h1 className="mt-2 text-xl font-semibold text-neutral-900 dark:text-neutral-100">Admin access</h1>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
        Enter the demo access code to explore the admin UI. No email or password required.
      </p>
      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-200">
          Access code
          <input
            type="text"
            name="code"
            autoComplete="off"
            autoFocus
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="demo"
            className="mt-1 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900 outline-none ring-neutral-400 focus:ring-2 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
          />
        </label>
        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading || !code.trim() || !clerkReady}
          className="w-full rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {loading ? 'Signing in…' : 'Continue to admin'}
        </button>
      </form>
      <p className="mt-4 text-center">
        <AboutThisDemoLink className="text-sm text-neutral-500 underline-offset-2 hover:text-neutral-800 hover:underline dark:text-neutral-400 dark:hover:text-neutral-200" />
      </p>
    </div>
  );
}
