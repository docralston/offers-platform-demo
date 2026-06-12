import JSON5 from 'json5';

/** Parse LLM JSON output; JSON5 tolerates trailing commas and unquoted keys. */
export function parseLlmJson<T>(json: string): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return JSON5.parse(json) as T;
  }
}

export function tryParseLlmJson<T>(json: string): T | null {
  try {
    return parseLlmJson<T>(json);
  } catch {
    return null;
  }
}
