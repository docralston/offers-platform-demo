import { checkRateLimit, clientIpFromRequest } from '@/lib/api/rate-limit';

const PUBLIC_API_LIMIT = Number(process.env.PUBLIC_API_RATE_LIMIT ?? '120');
const PUBLIC_API_WINDOW_MS = Number(process.env.PUBLIC_API_RATE_WINDOW_MS ?? '60000');

export function enforcePublicApiRateLimit(req: Request): Response | null {
  const ip = clientIpFromRequest(req);
  const key = `public-api:${ip}`;
  const result = checkRateLimit(key, PUBLIC_API_LIMIT, PUBLIC_API_WINDOW_MS);
  if (result.ok) return null;

  return new Response(
    JSON.stringify({ error: 'Rate limit exceeded', retryAfterSec: result.retryAfterSec }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(result.retryAfterSec),
      },
    },
  );
}
