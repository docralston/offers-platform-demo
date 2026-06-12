# Demo model-page configs

Fictional dealership data for **portfolio / demo deploys only**. No real dealer names, URLs, or addresses.

- Used when `DEMO_MODE=true` (unless `MODELPAGER_CONFIGS` overrides).
- Shipped in the public repo export; production uses `lab/modelpager/configs` instead.
- Model lists are intentionally small (3–4 models per brand) to keep demo LLM runs cheap with BYOK.
- On Vercel, generated page JSON is ephemeral (serverless filesystem). Use local `DEMO_MODE=true` for persistent generation, or treat demo generate as a live preview.
- Demo vehicle images use flat paths under `public/demo/assets/{brand}/{year}/`, e.g. `2026-toyota-corolla-hero.webp` and `2026-toyota-corolla-jellybean.webp`. Set `assets.r2BaseUrl` to `/demo/assets` in store JSON.
