# CLAUDE.md — offers-platform

## Build & Dev Commands

```bash
npm run dev              # Next.js dev server
npm run build            # Production build
npm run lint             # ESLint 9 flat config (eslint .)
npm run test             # Vitest (vitest run) — 67 tests
npm run test -- <pattern> # Run single test file or pattern
npm run db:generate      # prisma generate
npm run db:migrate       # prisma migrate dev
npm run db:studio        # prisma studio (DB GUI)
npm run ingest:toyota    # Toyota scraper pipeline (tsx scripts/run-toyota-ingestion.ts)
npm run toyota:seed      # Seed Playwright storage state for Toyota login
npm run generate:model-pages # AI model page generation
npm run generate:search-queries # Anthropic search-query .txt backfill (see script flags)
```

## Architecture

Next.js 16 App Router with layered architecture:

```
UI (app/admin/) → Server Actions (app/actions/) → Domain Logic (lib/domain/) → Prisma (lib/prisma.ts) → PostgreSQL (Supabase)
```

**Key directories:**
- `app/actions/` — Server actions for all mutations (`offers.ts` is the largest at ~49KB)
- `lib/domain/` — Pure business logic (validation, versioning, finance rates, offer types)
- `lib/validation/` — Import-specific soft-block validation
- `lib/ingestion/toyota/` — Playwright scraper → extract → normalize → dedupe → DB
- `lib/renderers/` — Output formatters: email, landing-page, CSV, JSON, PDF (placeholder)
- `lib/model-page-generator/` — OpenAI-powered SEO page generation (28 files)
- `lib/config/` — Store configs, certified qualifying years
- `prisma/` — Schema and 17+ migrations
- `scripts/` — CLI tools for ingestion, merging, seeding

## Key Patterns

**Soft-block validation** — Import validation never hard-fails. Invalid offers are set `status = INACTIVE` with `validationIssues` JSON populated for operator follow-up.

**Versioning** — Every offer mutation creates an `OfferVersion` with full snapshot, changedBy, changeNote, and incrementing versionNumber. History at `[id]/history/`, restore via `restoreOfferVersion()`.

**Multi-store** — `storeCode` is primary; `storeCodes` (String[]) lists all applicable stores. Stores: `TOY`, `BMW`, `LEXDT`, `LEXWG`. Per-store config in `lib/config/stores.ts`.

**Finance rate consolidation** — Multiple rate/term combos stored as `financeRates` JSON array on a single offer. `computeBestFinanceRate()` derives display values. `mergeFinanceRowsForImport()` consolidates duplicate vehicle rows during import.

**Auth abstraction** — `lib/auth.ts` wraps Clerk into three functions: `getCurrentUserId()`, `requireUserId()`, `getCurrentUserEmail()`. Swap Clerk by changing only this file.

**Offer lifecycle:** `LIVE ↔ INACTIVE` (manual), with expired offers treated as `INACTIVE`. Frozen types: Cash, Other (only Lease and Finance are active).

**Toyota ingestion pipeline:** Playwright scraper → HTML extraction → normalize model names → dedupe by trim → write DB or preview. Retries up to 3 attempts. Artifacts saved to `artifacts/` (gitignored; CI uploads as workflow artifacts). Runs nightly via GitHub Actions (1:00 AM UTC).

## Tech Stack

Next.js 16.1.3, React 19.2, TypeScript 5.9, Prisma 7.3 (with `@prisma/adapter-pg`), Clerk 6.36, Tailwind CSS 4.1, Vitest 2.1, Playwright 1.58, OpenAI SDK 6.17, xlsx 0.18

## Testing

- **Vitest** with `globals: true` (no imports needed for `describe`/`test`/`expect`)
- Path alias: `@` → project root
- Test locations: `lib/domain/__tests__/`, `lib/validation/__tests__/`, `lib/ingestion/toyota/__tests__/`
- CJS deprecation warning during runs is cosmetic — ignore it

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Pooled PostgreSQL via Supabase (port 6543, `?pgbouncer=true`) |
| `DIRECT_URL` | Direct PostgreSQL (port 5432, used by Prisma migrations) |
| `CLERK_SECRET_KEY` | Clerk auth (server-only) |
| `CLERK_PUBLISHABLE_KEY` / `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk auth (client) |
| `OPENAI_API_KEY` | Model page LLM generation |
| `ANTHROPIC_API_KEY` | Anthropic-powered generation (pages, SEO meta, links, search-query refresh) |
| `ANTHROPIC_MODEL_QUERIES` | Optional Anthropic model id for search queries (defaults in `search-queries-generate.ts`) |
| `ANTHROPIC_MODEL` | Main Anthropic model id for full single-pass page generation and other default calls |
| `ANTHROPIC_MODEL_SKELETON` | Anthropic model for the first pass when split local generation is on (SEO, hero, bullets, trims only); defaults to `ANTHROPIC_MODEL` |
| `OPENAI_MODEL_SKELETON` | Same skeleton pass when `LLM_PROVIDER` is OpenAI; defaults to `OPENAI_MODEL` |
| `ANTHROPIC_MODEL_FAQS` | Anthropic model id for FAQ generation (`generateFaqsOnly`) |
| `ANTHROPIC_MODEL_LOCAL` | Anthropic model id for local-only generation (optional override) |
| `ANTHROPIC_MODEL_META` | Anthropic model id for SEO title/meta regeneration (`contentType: "meta"`) |
| `ANTHROPIC_MODEL_FALLBACK` | Fallback Anthropic model id if the primary model errors |
| `ANTHROPIC_MODEL_LINKS` | Primary model id for internal-link injection rewrite pass (fallback chain: `ANTHROPIC_MODEL_LINKS` -> `ANTHROPIC_MODEL` -> hardcoded default, then `ANTHROPIC_MODEL_FALLBACK` on failure) |
| `LLM_MAX_OUTPUT_TOKENS` | Optional max output tokens for all model-page LLM calls (`generateContent`, internal-links, search-queries); overrides per-pass tuning when set |
| `INTERNAL_LINKS_MAX_OUTPUT_TOKENS` | Legacy alias for `LLM_MAX_OUTPUT_TOKENS` (same resolver) |
| `TOYOTA_STORAGE_STATE_PATH` | Playwright cookies file (`.playwright/toyota-storage.json`) |
| `TOYOTA_USER_DATA_DIR` | Playwright session dir (`.playwright/toyota-session`) |
| `TOYOTA_HEADLESS` | `0` = show browser, `1` = headless |
| `PLAYWRIGHT_CHANNEL` | `chrome` or `chromium` |
| `MODELPAGER_CONFIGS` | Model page config path (default: `lab/modelpager/configs`) |

## Known Issues

### Model defaults used for this rollout

- Split page flow: set `ANTHROPIC_MODEL_SKELETON=claude-haiku-4-5` (or similar) and keep `ANTHROPIC_MODEL_LOCAL` on Sonnet for long-form local blocks.
- FAQs: prefer `ANTHROPIC_MODEL_FAQS=claude-sonnet-4-6` for richer, more specific Q&A.
- Internal links: set `ANTHROPIC_MODEL_LINKS=claude-sonnet-4-6` (or rely on `ANTHROPIC_MODEL_FALLBACK`).

- **Duplicate migration name** — Two migrations both named `add_offer_model_code` (timestamps `20260202000000` and `20260202222637`) do different things. Don't rename — Prisma tracks by folder name.
- **Deploy docs** — `docs/deploy/DEPLOY.md`, `docs/deploy/DEMO_PUBLIC_REPO.md`; environment matrix in `docs/ENVIRONMENTS.md`.
- **`as any` usage** — Widespread in `OffersTable.tsx`, `offers.ts` actions, and several lib files. Weaken type safety gradually.
- **`SerializedOffer.year` type mismatch** — Typed as `number` in `app/admin/offers/types.ts` but schema is `Int?` (nullable). Should be `number | null`.
- **`/admin/model-pages` dynamic route** — Build warns about dynamic server usage from `headers()` via Clerk. Could add `export const dynamic = 'force-dynamic'`.
- **StatusBadge gaps** — Only maps `DRAFT` and `LIVE`; `NEEDS_REVIEW` and `INACTIVE` fall through to neutral styling.
- **Placeholder TODOs** — `lib/renderers/pdf.ts` and `lib/jobs/image-generation.ts` are stubs.
