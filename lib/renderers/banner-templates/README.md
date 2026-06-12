# Banner Template System

You can fully control banner layout and styling by editing HTML template files in this folder.

## How templates are selected

When generating an image, renderer checks templates in this order:

1. `{presetId}.html` (example: `300x250.html`)
2. `{width}x{height}.html` (for custom sizes)
3. `layout-{layout}.html` where layout is `landscape`, `square`, or `portrait`
4. Built-in fallback renderer (if no template exists)

## Size policy (disclaimer and vehicle column)

Logic lives in [`banner-size-policy.ts`](../banner-size-policy.ts) (shared with the admin UI):

- **Disclaimer** — Shown only when the user enables “Include disclaimer (when size allows)” **and** the canvas is large enough (short strips and large mobile widths are excluded). Hand-authored preset files still receive `{disclaimer}` and `{disclaimer-style}`; when policy blocks fine print, the style hides the block.
- **Vehicle column placeholders** — For `layout-*` templates only, `{vehicle-style}` and `{banner-extra-class}` may hide the media column on micro sizes. **Preset-specific HTML files** (e.g. `728x90.html`) are not forced to hide the vehicle image so you can keep a cropped hero photo on leaderboards.

## Phase 1 preset templates

These sizes have dedicated layouts under this folder:

- `728x90.html`, `970x90.html` — Leaderboards (split: visual + copy + CTA rail)
- `970x250.html` — Billboard (wide stage + copy column)
- `300x250.html`, `336x280.html` — Rectangles (hero image + panel)
- `320x50.html`, `320x100.html` — Mobile strips (type-forward; optional legal row hidden by policy)
- `1080x1080.html` — Social square (full-bleed image + overlay stack)

Remaining IAB sizes use `layout-*` or the built-in fallback until Phase 2.

## Supported placeholders

- `{brand-css-vars}` - CSS variable declarations for current brand colors
- `{width}` / `{height}` - numeric pixel dimensions
- `{layout}` - `landscape`, `square`, or `portrait`
- `{brand}` - brand id (`toyota`, `bmw`, `lexus`)
- `{store-code}` - store code
- `{vehicle-image}` - image URL
- `{title}` - vehicle/model title
- `{msrp}` - formatted MSRP label (example: `MSRP $33,120`) or empty string
- `{offers}` - combined lease + finance offer HTML blocks
- `{lease-offer}` - lease offer block HTML only
- `{finance-offer}` - finance offer block HTML only
- `{cta}` - CTA text
- `{disclaimer}` - fine print text
- `{disclaimer-style}` - empty when disclaimer is shown, or `style="display:none"` when hidden (user off or size policy)
- `{vehicle-style}` - (layout templates only) empty or `style="display:none"` when the generic policy omits the vehicle column
- `{banner-extra-class}` - (layout templates only) empty or ` banner--no-vehicle` for grid adjustments when the vehicle column is hidden

## Important notes

- `{offers}`, `{lease-offer}`, and `{finance-offer}` inject pre-rendered HTML blocks (classes like `.offer`, `.price`, `.pill-lease`).
- All text placeholders are HTML-escaped.
- Scope preset CSS under a root class (e.g. `.banner--728x90 .offer`) so sizes do not conflict.
- For fine print, use a full-width element at the bottom; when disclaimer is disabled, rely on `{disclaimer-style}` on that element.
- Start by copying one of the layout templates or a phase-1 preset and tune per size.
