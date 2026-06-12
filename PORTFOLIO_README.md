# Offers Platform — Portfolio Demo

Public demonstration of a multi-store automotive offers admin and publishing platform.

**Live site:** [offers-platform-demo.vercel.app](https://offers-platform-demo.vercel.app)

All dealership names, offers, and inventory on this deployment are **fictional**. This is not connected to production dealer systems.

## Try the admin UI

1. Open [offers-platform-demo.vercel.app/admin](https://offers-platform-demo.vercel.app/admin) (or **Admin sign-in** on the demo landing page).
2. When prompted for an **access code**, enter:

   ```
   demo
   ```

3. Explore offers, publishing outputs, disclaimers, and the embed widget at **Admin → Embed** (`/admin/embed`).

No email or password is required on the hosted demo. Offer data resets daily at 2:00 AM US Eastern.

## Stack

Next.js · PostgreSQL (Supabase) · Clerk · Prisma · Vitest

## Quick start (local)

```bash
npm install
cp .env.example .env.local
# Set DATABASE_URL, DIRECT_URL, Clerk keys, DEMO_CLERK_USER_ID; DEMO_MODE=true
npm run db:migrate
npm run db:seed-demo
npm run dev
```

Sign in locally with access code `demo` when `DEMO_MODE=true` (see `.env.example`).

## What is intentionally excluded

- `lab/` production model-page configs (demo ships `demo/modelpager-configs/`)
- Toyota Playwright ingestion scripts and operator CI workflows
- Spreadsheet fixtures and `.env*` secrets

Model page **bulk generation** on the hosted demo uses **bring-your-own-key** (`DEMO_LLM_BYOK`) so visitors use their own LLM API key.

## Copyright

© 2026 Ralston Digital. All rights reserved.
