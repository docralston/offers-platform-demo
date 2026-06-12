export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

export async function withTransientRetries<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 6;
  const baseDelayMs = options.baseDelayMs ?? 250;
  const maxDelayMs = options.maxDelayMs ?? 2500;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxAttempts || !isTransientActionError(error)) {
        throw error;
      }
      const waitMs = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  throw new Error('Failed after retries');
}

export function isTransientActionError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : typeof error === 'string'
      ? error.toLowerCase()
      : '';

  return (
    message.includes('unexpected response was received from the server') ||
    message.includes('fetch failed') ||
    message.includes('networkerror') ||
    message.includes('connection closed')
  );
}
