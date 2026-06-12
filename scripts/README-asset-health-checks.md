# Asset health checks (model pages & images)

This app distinguishes between **placeholder** and **live** assets in the dashboard via the
`AssetStatus` fields on `ModelAssetCoverageRow` (see `lib/domain/dashboard/summary.ts`).

Today, these statuses are derived purely from local config JSON:

- `missing` — No config or image path is present.
- `placeholder` — A model page JSON or image path exists, but no external check has been run.
- `error` — The config JSON could not be parsed.
- `live` — Reserved for future “URL responds” health checks.

## Future cached health-check flow

When you are ready to validate that R2 URLs and model pages actually respond, add a small script
that:

1. Iterates over brands/years and reads the same model configs used by
   `getModelAssetCoverage`.
2. Performs **HTTP HEAD** requests against:
   - `images.hero.path`
   - `images.vehicleJellybean.path` or `images.vehicle.path`
   - The model page URL, if you decide to track it.
3. Writes results into a lightweight store, such as:
   - A dedicated Prisma model (e.g. `AssetHealthCheck` keyed by brand/year/model/assetType), or
   - A JSON artifact under `artifacts/` that `getModelAssetCoverage` can read.
4. Extends `getModelAssetCoverage` to:
   - Merge cached health results into `modelPageInfo`, `heroImageInfo`, and `vehicleImageInfo`.
   - Upgrade `placeholder` → `live` when the last check status is “ok”.
   - Mark `error` when the URL consistently returns 4xx/5xx.

Run this script on a **nightly schedule** (e.g. via GitHub Actions) so the dashboard stays fast
while still surfacing whether your “default” URLs on R2 are actually live.

