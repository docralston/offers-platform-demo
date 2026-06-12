# Deployment guide

Stack: **Vercel** + **Supabase** (PostgreSQL) + **Clerk** (invite-only auth).

## 1. Supabase

1. Create a production project.
2. Copy **pooled** connection string → `DATABASE_URL` (port 6543, `?pgbouncer=true`).
3. Copy **direct** connection string → `DIRECT_URL` (port 5432, migrations only).

## 2. Database migrations

From CI or locally with production `DIRECT_URL`:

```bash
npx prisma migrate deploy
```

After deploy, optional demo seed (demo project only):

```bash
npm run db:seed-demo
```

## 3. Clerk (production)

1. Create a Clerk application; **disable public sign-up** (invites only).
2. Set production domain and redirect URLs for your Vercel hostname.
3. Copy API keys into Vercel env (see `.env.example`).
4. Set `ADMIN_EMAILS` and `ALLOWED_EMAILS` to operator email(s).

## 4. Vercel environment variables

Copy all keys from `.env.example`. Minimum for production:

| Variable | Notes |
|----------|--------|
| `DATABASE_URL` / `DIRECT_URL` | Supabase |
| `CLERK_*` | Auth |
| `ADMIN_EMAILS` / `ALLOWED_EMAILS` | Belt + suspenders access control |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Model pages (if used) |

**Do not** set `DEMO_MODE=true` on production.

### Vercel project settings (prod + demo)

- **Node.js version:** 22.x (required by `@sparticuz/chromium` for banner image generation on `/admin/images`)
- **Memory:** `vercel.json` requests 1769 MB for App Router functions; confirm the plan allows it
- Banner generation uses Playwright + `@sparticuz/chromium` at runtime (not the full `playwright` package)

## 5. Deploy

```bash
vercel --prod
```

Or connect the GitHub repo to Vercel with `main` → production.

## 6. Post-deploy smoke test (~1 hour)

- [ ] Sign in from two browsers / devices (Clerk invite flow)
- [ ] Offers list, create, edit, version history restore
- [ ] Import preview (BMW xlsx fixture) — not full Toyota scrape on Vercel
- [ ] Email + specials + image banner generation
- [ ] Disclaimer editor (per-offer + `/admin/disclaimers`)
- [ ] Admin → Embed (`/admin/embed`) — widget previews and snippets
- [ ] `/admin/ai-usage` loads; pricing-as-of date visible

## 7. Toyota ingestion

Playwright ingestion **does not run on Vercel**. Use GitHub Actions (`.github/workflows/toyota-ingestion.yml`) or local `npm run ingest:toyota` with `GITHUB_TOKEN` + `GITHUB_REPO` set for workflow dispatch from admin.

## 8. Demo portfolio deploy (separate project)

Use an isolated stack:

| Resource | Demo |
|----------|------|
| Vercel project | `offers-platform-demo` |
| Supabase | Separate DB |
| Clerk | Separate app |
| GitHub | Public repo via `npm run export:demo-repo` |

Demo Vercel env:

```
DEMO_MODE=true
NEXT_PUBLIC_DEMO_MODE=true
DEMO_ASSET_BASE_URL=https://<your-demo-domain>/demo/assets
```

Run on each deploy or monthly cron:

```bash
npm run db:seed-demo
```

Export sanitized public tree (see **`DEMO_PUBLIC_REPO.md`** in this folder for full workflow + LLM BYOK):

```bash
npm run export:demo-repo -- ../offers-platform-demo --force
```

Demo LLM (optional): set `DEMO_LLM_BYOK=true` and `NEXT_PUBLIC_DEMO_LLM_BYOK=true`; omit operator API keys so visitors use their own on Model pages.

Model pages on demo use `demo/modelpager-configs/` (fictional stores; auto when `DEMO_MODE=true`).

See **[`docs/ENVIRONMENTS.md`](../ENVIRONMENTS.md)** for the full dev/prod/demo matrix and post-merge checklist.

## 9. LLM pricing maintenance

Quarterly (or when vendors change list prices):

1. Update `lib/openai-pricing.ts` (`MODEL_PRICING_PER_1K`, `PRICING_AS_OF`)
2. `npm run test -- openai-pricing`
3. `npm run backfill:openai-costs -- --all` against production DB

GitHub opens a reminder issue via `.github/workflows/pricing-reminder.yml`.
