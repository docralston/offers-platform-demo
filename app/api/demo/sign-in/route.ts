import { clerkClient } from '@clerk/nextjs/server';
import { clientIpFromRequest, checkRateLimit } from '@/lib/api/rate-limit';
import { demoAccessCode, isDemoMode } from '@/lib/config/demo';

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 60 * 1000;

export async function POST(req: Request) {
  if (!isDemoMode()) {
    return new Response(null, { status: 404 });
  }

  const ip = clientIpFromRequest(req);
  const limited = checkRateLimit(`demo-sign-in:${ip}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limited.ok) {
    return Response.json(
      { error: 'Too many attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSec) } },
    );
  }

  const userId = process.env.DEMO_CLERK_USER_ID?.trim();
  if (!userId) {
    return Response.json({ error: 'Demo sign-in is not configured.' }, { status: 503 });
  }

  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const code = body.code?.trim().toLowerCase() ?? '';
  if (!code || code !== demoAccessCode().toLowerCase()) {
    return Response.json({ error: 'Invalid access code.' }, { status: 401 });
  }

  const client = await clerkClient();
  const signInToken = await client.signInTokens.createSignInToken({
    userId,
    expiresInSeconds: 60,
  });

  return Response.json({ ticket: signInToken.token });
}
