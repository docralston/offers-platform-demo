import { checkRateLimit, clientIpFromRequest } from '@/lib/api/rate-limit';
import { isDemoMode } from '@/lib/config/demo';

export const DEMO_LLM_API_KEY_HEADER = 'x-demo-llm-api-key';

/** Server: demo visitors supply their own LLM key (never stored server-side). */
export function isDemoLlmByokEnabled(): boolean {
  return isDemoMode() && process.env.DEMO_LLM_BYOK === 'true';
}

/** Client bundle: show BYOK UI on demo deploy. */
export function isDemoLlmByokClient(): boolean {
  return (
    process.env.NEXT_PUBLIC_DEMO_MODE === 'true' &&
    process.env.NEXT_PUBLIC_DEMO_LLM_BYOK === 'true'
  );
}

export function resolveDemoByokApiKey(request: Request): string | null {
  const key = request.headers.get(DEMO_LLM_API_KEY_HEADER)?.trim();
  if (!key || key.length < 20) return null;
  return key;
}

export function checkDemoLlmRateLimit(
  userId: string,
  request: Request,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const limit = Number(process.env.DEMO_LLM_RATE_LIMIT ?? 10);
  const windowMs = Number(process.env.DEMO_LLM_RATE_WINDOW_MS ?? 3_600_000);
  const ip = clientIpFromRequest(request);
  return checkRateLimit(`demo-llm:${userId}:${ip}`, limit, windowMs);
}

export const DEMO_LLM_KEY_REQUIRED_CODE = 'DEMO_LLM_KEY_REQUIRED';

export function demoLlmKeyRequiredMessage(): string {
  return 'Model page generation on the demo requires your own Anthropic or OpenAI API key. Add it below — it stays in your browser only.';
}
