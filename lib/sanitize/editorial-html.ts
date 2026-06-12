import sanitizeHtml from 'sanitize-html';
import { EDITORIAL_HTML_SANITIZE_OPTIONS } from './editorial-html-options.js';

export { EDITORIAL_HTML_SANITIZE_OPTIONS };

/** Allowlist sanitizer for LLM-generated editorial HTML (body sections, FAQ answers). */
export function sanitizeEditorialHtml(html: string): string {
  return sanitizeHtml(String(html ?? ''), EDITORIAL_HTML_SANITIZE_OPTIONS);
}
