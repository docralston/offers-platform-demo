import sanitizeHtml from 'sanitize-html';

const WIDGET_HTML_SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'style',
    'div',
    'section',
    'article',
    'a',
    'img',
    'h3',
    'span',
    'strong',
  ],
  allowedAttributes: {
    '*': ['class', 'aria-label', 'role'],
    a: ['href', 'class', 'aria-label'],
    img: ['src', 'alt', 'loading', 'decoding', 'class'],
    section: ['class', 'aria-label'],
    div: ['class', 'data-offers-widget-loading', 'data-offers-widget-error', 'data-offers-widget-empty'],
  },
  allowedSchemes: ['http', 'https'],
  allowProtocolRelative: false,
  // Widget fragments include server-generated <style> blocks; content is escaped before render.
  allowVulnerableTags: true,
  disallowedTagsMode: 'discard',
};

/** Defense-in-depth pass on embed widget HTML before innerHTML insertion on host pages. */
export function sanitizeWidgetHtml(html: string): string {
  return sanitizeHtml(String(html ?? ''), WIDGET_HTML_SANITIZE_OPTIONS);
}
