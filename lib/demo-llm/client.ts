'use client';

import { DEMO_LLM_API_KEY_HEADER } from '@/lib/config/demo-llm';

const STORAGE_KEY = 'offers-platform-demo-llm-api-key';

export function getDemoLlmApiKey(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  const key = sessionStorage.getItem(STORAGE_KEY)?.trim();
  return key || null;
}

export function setDemoLlmApiKey(key: string): void {
  sessionStorage.setItem(STORAGE_KEY, key.trim());
}

export function clearDemoLlmApiKey(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}

/** Extra headers for demo BYOK fetch calls (sessionStorage only — never sent to third parties except your provider). */
export function demoLlmRequestHeaders(): Record<string, string> {
  const key = getDemoLlmApiKey();
  if (!key) return {};
  return { [DEMO_LLM_API_KEY_HEADER]: key };
}
