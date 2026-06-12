/**
 * Shared sanitize-html options for LLM editorial HTML (model pages, FAQs).
 * Plain JS so lab/modelpager/scripts/render-model-page.js can require it.
 */

/** @type {import('sanitize-html').IOptions} */
const EDITORIAL_HTML_SANITIZE_OPTIONS = {
  allowedTags: ['p', 'ul', 'ol', 'li', 'strong', 'em', 'br', 'a'],
  allowedAttributes: {
    a: ['href', 'title', 'class'],
    p: ['class'],
    ul: ['class'],
    ol: ['class'],
    li: ['class'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
};

module.exports = { EDITORIAL_HTML_SANITIZE_OPTIONS };
