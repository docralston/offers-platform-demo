# Environments — dev, prod, and demo

One codebase, three deploy profiles. Behavior is controlled by environment variables, not separate branches.

## Matrix

| Variable | Local dev (typical) | Production Vercel | Demo Vercel |
|----------|---------------------|-------------------|-------------|
| `DEMO_MODE` | unset / `false` | **must be unset** | `true` |
| `NEXT_PUBLIC_DEMO_MODE` | `false` | unset | `true` |
| `DATABASE_URL` | Your Supabase | Prod Supabase (pooled) | Demo Supabase only |
| `DIRECT_URL` | Your Supabase | Prod direct (migrations) | Demo direct |
| `CLERK_*` | Dev Clerk app | Prod Clerk app | Demo Clerk app |
| `ADMIN_EMAILS` / `ALLOWED_EMAILS` | Operators | Operators | Demo operators |
| `MODELPAGER_CONFIGS` | `lab/modelpager/configs` | `lab/modelpager/configs` | auto `demo/modelpager-configs` |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | Set locally | Set on Vercel | Omit when using BYOK |
| `DEMO_LLM_BYOK` | optional | unset | `true` (recommended) |
| `NEXT_PUBLIC_DEMO_LLM_BYOK` | optional | unset | `true` (recommended) |
| `DEMO_ASSET_BASE_URL` | optional | unset | `https://<demo-host>/demo/assets` |
| `DEMO_ACCESS_CODE` | `demo` | — | `demo` (or custom) |
| `DEMO_CLERK_USER_ID` | — | — | Shared demo Clerk user |

Never share database URLs or Clerk keys between prod and demo.

## What differs on demo

- Fictional store names and domains (`lib/config/demo-stores.ts`, `lib/config/store-display.ts`)
- Access-code sign-in (`/api/demo/sign-in`) instead of email invites
- **OEM ingestion blocked** (Toyota/Lexus/BMW scrapers in `app/actions/ingestion.ts`)
- Spreadsheet import, offers CRUD, disclaimers, images, embed widget, specials — **work normally**
- Offer data resets nightly (2:00 AM US Eastern) on hosted demo
- Model page bulk LLM via bring-your-own-key when `DEMO_LLM_BYOK` is set

## Post-merge checklist

After meaningful changes on `main` in the **private** repo:

1. Run Prisma migrations on **prod** DB, then **demo** DB (`npx prisma migrate deploy`).
2. If seed data or asset paths changed: `npm run db:seed-demo` on demo.
3. Deploy prod (push private repo → Vercel prod).
4. Export demo: `npm run export:demo-repo -- ../offers-platform-demo --force` → review diff → push public repo.
5. Smoke test prod `/admin` and demo `/demo` + access-code sign-in + `/admin/embed`.

## Smoke test (demo)

- [ ] `/demo` landing loads; sign in with access code `demo`
- [ ] Offers list shows seeded Demotown offers with jellybean images
- [ ] Admin → **Embed** (after Disclaimers) — widgets load live offers
- [ ] Admin → Images — 1080×1080 generates; 320×50 blocks lease+finance combo
- [ ] Ingestion actions show “disabled in demo mode”
- [ ] Optional: BYOK bulk generate on Model pages

See also [DEPLOY.md](./deploy/DEPLOY.md) and [DEMO_PUBLIC_REPO.md](./deploy/DEMO_PUBLIC_REPO.md).
